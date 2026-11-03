# Arquitectura de Archivo Vivo

Diseño objetivo y andamiaje probado, no MVP completado. Existen cinco pantallas React, demo SQLite FTS5, cinco comandos IPC y bandeja. No existen todavía watcher, extracción personal, OCR, ONNX ni RAG. Ver `../VERIFICACION.md` para resultados y límites.

## 1. Visión de producto y casos de uso

Archivo Vivo es una aplicación de escritorio local para encontrar información en documentos propios mediante texto, fragmentos citables y referencias al archivo fuente. La arquitectura prioriza búsqueda extractiva: un resultado debe poder rastrearse hasta un fragmento extraído y, si el formato ofrece paginación fiable, hasta su página. No se inventan páginas ni se presenta texto generado como cita.

**Objetivo de producto:** importar raíces de carpetas elegidas por la persona, vigilar cambios, extraer formatos admitidos, indexar localmente, ofrecer búsqueda léxica y semántica híbrida, abrir el documento original y permitir borrar o exportar datos del índice.

**Incluido en el objetivo:** desktop con Tauri 2, frontend React/TypeScript, núcleo Rust, SQLite FTS5, opción SQLite-vec, extracción local, OCR local, modelo multilingüe local, actualización del índice, controles de privacidad, configuración y empaquetado offline.

**Fuera del MVP:** nube, cuentas, telemetría, microservicios, Docker, indexado remoto, importación automática de modelos por red, respuestas generativas presentadas como verdad, conversión completa de formatos Office heredados, sincronización entre dispositivos y garantía de borrado físico irrecuperable de SSD.


### Tres casos de uso reales

1. Marta necesita tramitar la garantía de su lavadora: busca «factura lavadora», filtra por fecha y abre el recibo con el importe y la página originales.
2. Luis quiere saber cuánto aviso exige su alquiler: pregunta «¿con cuánto tiempo tengo que avisar?» y consulta los fragmentos del contrato con archivo y página, sin depender de un resumen inventado.
3. Ana guarda capturas y apuntes de cursos: busca por tema, aplica «apunte» y revisa la línea de tiempo; compara imágenes similares antes de decidir qué conservar. Nunca hay borrado automático de originales.

Son flujos objetivo; la demo actual permite probar extractos ficticios, no esos documentos personales.

## 2. Arquitectura de componentes y flujo

La UI no lee archivos ni ejecuta órdenes del sistema. Envía comandos con IDs y argumentos validados al backend Tauri. Rust controla la selección de carpetas, canoniza las raíces, recorre archivos, parsea y genera el índice. SQLite es la fuente de verdad del estado indexado. Sidecars de OCR se ejecutan localmente con límites y sin terminal visible en Windows. Los workers CPU/IO pesados no bloquean el event loop ni la ventana.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Ventana Tauri (capability main; CSP restrictiva)                    │
│ React / TypeScript: onboarding, búsqueda, citas, documento, ajustes  │
└───────────────────────┬────────────────────────────────────────────┘
                        │ invoke tipado / eventos tipados
┌───────────────────────▼────────────────────────────────────────────┐
│ Fachada de comandos Rust: validación, permisos, errores saneados     │
│ Gestor de raíces ─ Watcher notify ─ cola/jobs ─ reconciliación      │
│ Extractores aislados ─ chunker ─ ONNX Runtime local ─ ranker híbrido │
└───────────────┬──────────────────────────────────┬─────────────────┘
                │                                   │
       SQLite + FTS5                        sidecars firmados
       vec0 opcional                        PDFium / Tesseract
```

Los comandos y eventos forman un contrato explícito, no una API de archivos genérica. La ventana nunca aporta una ruta arbitraria para abrir o borrar: proporciona un ID; el backend busca la ruta persistida, vuelve a validar que pertenece a una raíz autorizada y usa las APIs del sistema adecuadas. No se expone shell, HTTP genérico, SQL ni apertura de ruta arbitraria a la WebView. Las capabilities Tauri deben conceder solo permisos concretos a `main`; las ACL no deben depender del supuesto de que un comando registrado queda restringido automáticamente a una sola ventana [4].

No hay contrato de microservicio ni proceso de red. El runtime de inferencia y el watcher se ejecutan en proceso Rust; el OCR es un subproceso local limitado. Un proveedor Ollama sería integración opcional de alcance posterior, no dependencia para indexar o buscar.


```text
watcher → cola → extracción/OCR → chunking → embeddings → SQLite → búsqueda/UI
```

## 3. Árbol del monorepo

**Árbol previsto del monorepo (objetivo; `actual` solo identifica rutas comprobadas):**

```text
Archivo-Vivo/
├── Cargo.toml                         actual: workspace Rust
├── Cargo.lock                         actual
├── package.json                       actual: scripts de setup/build/test
├── crates/core/                       actual: núcleo mínimo
├── apps/desktop/
│   ├── package.json                   actual
│   ├── src/                           actual: React y adaptador demo
│   └── src-tauri/                     actual: Tauri 2, comandos demo, capability
├── migrations/
│   └── 001_initial.sql                actual: SQLite + FTS5; no vectorial
├── resources/
│   ├── demo/README.md                 actual: extractos ficticios
│   ├── models/README.md               actual: recursos ONNX pendientes
│   └── ocr/README.md                  actual: Tesseract pendiente
├── tests/                             actual: existe el directorio
├── docs/                              este conjunto de documentación
├── backlog/                           issues planificados por fase
├── scripts/                           objetivo: reproducibilidad/licencias/manifest
└── .github/workflows/                 actual: CI y release preparados, no ejecutados remotamente
```

## 4. Esquema SQLite inicial

`migrations/001_initial.sql` es la migración portable y real del andamiaje. Declara `roots`, `files`, `chunks`, `embedding_models`, `embeddings`, `tags`, `file_tags`, `duplicate_groups`, `duplicate_members`, `image_hashes`, `detected_dates`, `settings`, `audit`, `index_jobs` y la tabla virtual FTS5 `chunks_fts`; `user_version` es 1. Los triggers FTS sincronizan alta, baja y modificación de texto de chunks. La columna vectorial de base almacena un BLOB float32 de 1536 bytes, es decir, 384 dimensiones. Esa tabla no habilita por sí sola búsqueda aproximada.

**Objetivo de persistencia:** una base SQLite en el directorio de datos privado de la app; WAL y claves foráneas activadas; migraciones ordenadas y reversibles cuando sea viable; escrituras transaccionales cortas. `files` contiene identidad/ruta canónica, MIME, tamaño, fecha, hash y estado. `chunks` conserva texto extraído, ordinal, localizador, método y página solo cuando la fuente da una página real. Los embeddings se enlazan con el modelo/versionado y el chunk; las etiquetas y los grupos de duplicados se enlazan por claves foráneas. Al borrar un archivo se borran en cascada fragmentos, vectores, etiquetas, metadatos derivados y referencias a duplicados.

**SQLite-vec es opcional:** añadir en una migración aparte (`migrations/optional/001_vec0.sql`, existente pero no ejecutada) la tabla virtual `vec0`, con dimensión fija 384 y relación comprobable con `chunk_id`/`model_id`; no convertir la DB base en dependiente de la extensión. El uso de vec0 sigue el modelo de tabla virtual y consulta descrito por sqlite-vec [2], pero se debe fijar y probar el binario de la extensión para cada plataforma. No se carga una extensión arbitraria hallada en disco ni se acepta SQL de la UI. Si vec0 no está disponible, FTS5 continúa funcionando y el estado informa búsqueda semántica desactivada.

Datos sensibles: el texto extraído y las rutas se guardan localmente en claro en el MVP; el cifrado depende del cifrado integral del disco del sistema. No se promete SQLCipher. Backups usan SQLite Backup API para una instantánea consistente con WAL, empaquetada como archivo de respaldo; el cifrado con protección del sistema operativo es una opción posterior y se indica si no está disponible. Eliminar registros no garantiza borrado seguro de bloques flash, snapshots o copias externas.


El DDL completo ejecutable está en `../migrations/001_initial.sql`; vec0 opcional en `../migrations/optional/001_vec0.sql`.

## 5. Pipeline incremental y UI

Las raíces se registran solo tras una selección nativa del usuario. El backend almacena identidad de raíz y ruta canónica; la UI recibe `rootId`, no define límites de acceso por sí sola. El recorrido:

- Nunca sigue enlaces simbólicos fuera de la raíz autorizada; en Windows compara rutas normalizadas según reglas de volumen, separadores, mayúsculas y, cuando esté disponible, identidad de archivo. Revalidar en cada acceso; las rutas pueden cambiar entre selección e indexación.
- Excluye por defecto directorios ocultos/de sistema y árboles como `.git`, `node_modules` y cachés; muestra exclusiones relevantes y motivo. No indexa el directorio de datos propio ni copias de seguridad.
- Limita por defecto a 10.000 elementos por raíz con aviso; admite hasta 50.000 elementos configurables como techo del MVP. Omite archivos mayores de 100 MiB y limita OCR a 100 páginas por documento. Los límites son configurables en presupuestos explícitos y no se eluden por cambiar la extensión.
- Observa cambios con `notify`, pero trata los eventos como pistas: agrupa ráfagas, consulta metadata y revalida el archivo. Eventos perdidos/overflow provocan un barrido completo; el watcher no es fuente de verdad.
- El barrido compara estado conocido y estado actual. Un fallo de acceso, archivo bloqueado o error de parser genera `error` con motivo y conserva la versión indexada anterior; no convierte errores temporales en eliminaciones.

Cada reindexación tiene `jobId`, generación del contenido y lease/estado. Orden de alto nivel: reclamar job → obtener snapshot/metadata → extraer/chunkear/embeddar fuera de la transacción → validar que la generación sigue vigente → confirmar todo de una vez en transacción y reemplazar el índice visible. La versión previa permanece consultable mientras se procesa; nunca se publica un archivo medio actualizado. Si el origen cambió durante el trabajo, no se confirma resultado obsoleto y se vuelve a encolar. Pausa detiene la toma de jobs, no deja transacciones abiertas. Cancelación invalida la generación; una operación ya terminada no puede volver a confirmar después de cancelar.

Quitar una raíz revoca primero su autorización y cancela sus jobs, después purga filas/documentos/vectores/cachés asociados en una operación consistente y señala cualquier archivo que no pudo borrarse del índice. Las raíces disponibles al inicio se reconcilian; no se borra por ausencia transitoria de permisos, volumen desconectado o error de lectura. Evitar `TOCTOU` exige validar identidad y pertenencia inmediatamente antes de leer, además del control durante el recorrido.


La extracción corre en workers con límites de tiempo, tamaño descomprimido, cantidad de entradas, memoria y páginas. Parsers no descargan recursos, resuelven referencias externas ni ejecutan macros. Un archivo dañado no debe bloquear el lote. Guardar el método y estado de extracción facilita diagnóstico sin insertar texto de error en búsqueda.

| Formato | Comportamiento objetivo | Localizador / restricción |
|---|---|---|
| PDF | Leer texto embebido por página. Rasterizar con PDFium solo las páginas sin texto suficiente y aplicar Tesseract. | Cita `página N` únicamente con índice de página original. Raster/OCR con timeout, máximo 100 páginas y dimensiones razonables. PDFium requerido para OCR, no para devolver páginas inventadas. |
| DOCX | Leer XML del paquete OOXML, extraer párrafos en orden y tablas si se prueban. | Párrafo/sección aproximada; **no inventar página**. Páginas cambian con fuente, impresora y layout. |
| XLSX | Leer hojas y celdas no vacías, respetar nombres de hoja y coordenadas. | `Hoja!A1:B4`; valores/formulas según política documentada, sin recalcular fórmulas. |
| PPTX | Leer texto de cada diapositiva y notas si se implementan y se prueban. | `Diapositiva N`; las notas se distinguen de texto visible. |
| EML | Parsear MIME y extraer partes `text/plain`, cabeceras de fecha/remitente/tema permitidas. | No renderizar HTML ni acceder a contenido remoto; HTML remoto permanece excluido. |
| DOC/XLS/PPT heredados | En el MVP registrar MIME/metadata y estado pendiente de soporte; no fingir extracción completa. | Convertidor externo sería decisión de seguridad/licencias y fase separada. |

Para OOXML, imponer límites al contenedor ZIP (número de entradas, bytes descomprimidos, ratio de compresión, profundidad y tiempo); rechazar rutas ZIP con `..`, XML externo/XXE, DTD y expansión de entidades. El parser debe ser streaming o acotado. Para MIME, limitar partes, adjuntos analizados, profundidad y tamaño; no abrir adjuntos automáticamente salvo formato aceptado e indicación clara.

Tesseract 5 y datos `spa`/`eng` se distribuyen localmente en el paquete completo; validar licencias, versión y checksums de artefactos reales durante build. Tesseract es Apache-2.0 [5]. Invocar como sidecar firmado, con `stdin`/`stdout` controlados, directorio temporal privado, timeout, límite de salida y terminación de árbol de procesos. Windows: ocultar consola. La ausencia o error de OCR queda visible; no se inventa texto. PDFium y dependencias nativas requieren sus propias licencias y builds por plataforma.


Pipeline por archivo: identificar formato por contenido/MIME además de extensión; extraer texto junto con offsets/localizadores; normalizar Unicode y espacios conservando vínculo a la fuente; detectar páginas/bloques; formar chunks sin cruzar límites de cita cuando se pueda; calcular hash de contenido; persistir fragmentos; generar embeddings; confirmar generación completa. No eliminar datos como números, importes o puntuación necesaria para búsquedas.

Estrategia inicial propuesta: fragmentos por estructura (párrafo, tabla/celda, diapositiva, página PDF) y luego subdivisión por tokens cuando exceden presupuesto. Mantener ventana objetivo aproximada de 250–350 tokens y solape de 40–60 tokens para prosa larga; no unir hojas, diapositivas o páginas en una cita. Ajustar estos valores tras corpus de evaluación; longitud efectiva no excede 512 tokens del modelo. El chunk guarda offset/localizador verificable y hash; el extracto de UI se obtiene de ese mismo texto, no de una segunda generación libre.

Modelo objetivo `intfloat/multilingual-e5-small`: representación de 384 dimensiones, contexto máximo de 512 tokens y licencia MIT según ficha del modelo [3]. El artefacto no se incluye hoy. Fijar revisión del modelo y herramienta/exportador; empaquetar ONNX INT8 junto con tokenizer, vocabulario y configuración/special tokens. Fijar los prefijos exactos `query: ` y `passage: `, aplicar attention mask en mean pooling y normalizar L2. Para la consulta se usa `query:`; texto de documento `passage:`. Evaluar vectores para español y casos multilingües contra referencia; equivalencia tras cuantización y similitud coseno tolerada se establecen antes del hito de release.

El registro de modelos es estático y validado: nombre, versión, dimensiones, tipo, ruta de recursos y hash generado en build. No cargar modelo arbitrario por extensión o ruta suministrada por UI. Si faltan pesos/tokenizer o checksum falla, búsqueda semántica no está disponible y se degrada a FTS5, con indicación visible. Nada descarga un modelo al arrancar.


### Presupuesto y reanudación

Objetivos iniciales, no mediciones: un OCR concurrente, dos trabajos de extracción, ONNX intra-op limitado a dos hilos, pausa entre lotes y modo batería con un worker. Los límites de hilos no garantizan un porcentaje de CPU: ajustar por tiempo ocupado/descanso y perfilar. Alertar a 10.000 archivos; techo MVP 50.000, archivos 100 MiB, OCR 100 páginas. Presupuesto índice 2 GiB y caché 512 MiB configurables; pausar al alcanzar cuota o quedar menos de 1 GiB libre. Evitar copiar originales, descartar raster temporal al terminar y mostrar uso del índice.

100.000 chunks × 384 × 4 bytes = 153.600.000 bytes (146,48 MiB) solo para una copia float32; la tabla vec0 adicional puede duplicar vectores. FTS, texto, metadatos y cachés requieren espacio extra: no prometer ese total como tamaño del índice.

Antes del watcher, migración 002 debe añadir `files.generation`, identidad estable, versión extractor y hash observado; `index_jobs.generation`, stage_checkpoint, attempts, next_attempt_at, lease_owner/lease_until, prioridad y clave única por archivo/generación. La migración 001 actual define cola básica, no implementa leases. Recuperar leases expirados al arrancar; un único escritor confirma generaciones completas. Guardar extracción/chunks temporales fuera del índice visible; validar fuente y autorización justo antes del commit. Abrir conexiones lectoras separadas en WAL; nunca mantener el mutex de DB durante OCR/ONNX.

Formatos adicionales objetivo: TXT/Markdown UTF-8 con límites y párrafo/línea, imágenes PNG/JPEG/TIFF y capturas mediante OCR local con dimensiones acotadas y orientación EXIF; citas imagen/región, sin inventar páginas. Correos exportados EML en MVP; MBOX requiere delimitación/límites y queda para 1.1 explícitamente. UI de progreso agrupada cada 250 ms; pausa inmediata de toma de jobs y cancelación por generación. Extractores nativos deben aislarse en un proceso worker para poder abortar timeout; spawn_blocking solo no cancela una librería bloqueada.

## 6. Comandos internos y API local

El contrato detallado, tipos JSON de entrada/salida y ejemplos viven en [`API.md`](API.md). Comandos implementados en el andamiaje: `demo_load`, `search`, `document_get`, `index_status`, `index_clear`. La ruta normal de producción se planifica con selección/register/list/remove de raíces, pause/resume/rescan, búsqueda híbrida y filtros, obtención/abertura de documento por ID, citas, etiquetas, duplicados, fechas, import/export/backup/restore y confirmación de purga. No declarar esos comandos implementados hasta que estén registrados y probados.

Los trabajos informan `jobId`, `rootId`/`fileId`, etapa, progreso, estado y error apto para UI. La UI puede suscribirse a eventos, pero el estado persistido es autoritativo y recuperable por `index_status`/`job_get` tras reinicio. Eventos de progreso se agrupan para no saturar la WebView; nunca exponen el texto completo ni consulta en telemetría. IDs de solicitud correlacionan errores y eventos. Los errores externos se traducen a categorías estables (permiso, límite, corrupto, formato no soportado, modelo no disponible, cancelado, IO, base de datos), conservando detalle técnico local mínimo.

Operaciones CPU/IO se ejecutan con `spawn_blocking` o pool dedicado y concurrencia acotada. SQLite serializa escrituras cortas; no mantener mutex global mientras se OCRiza o se ejecuta inferencia. Tiempo límite, cancelación y retries acotados para cada etapa. Integridad de base se verifica con pruebas/migraciones; trabajo inconsistente no avanza el checkpoint.


La búsqueda lexical se basa en FTS5 (`unicode61 remove_diacritics 2` ya está en esquema). El motor vectorial opcional obtiene vecinos de distancia compatibles mediante vec0. Se calcula lista lexical y semántica separadas, filtradas por IDs/etiquetas/raíz/estado; se fusionan por Reciprocal Rank Fusion (RRF), con `k` y tamaños de candidatos versionados y probados. Puntajes de motores distintos no se comparan directamente. Deduplicar por chunk/file sin borrar referencias. Filtros temporales y MIME se aplican antes o después del top-N según plan de consulta verificado.

La semántica no reemplaza FTS. Si no hay modelo o vec0, no se bloquea la búsqueda léxica; `mode` indica `lexical`, `hybrid`, `demo` o `degraded`. El andamiaje de hoy implementa consultas FTS de demo (no RRF ni vectores).

Toda cita apunta a `fileId` y `chunkId`, contiene `locator` y `excerpt` exactos verificados contra el chunk persistido. Página nullable: `null` para DOCX y formatos sin página confiable. Al pedir abrir el original, backend verifica raíz/pertenencia/ID antes de abrir. Si el archivo desaparece, el resultado puede ofrecer el extracto indexado con estado “original no disponible”; no simula abrirlo.

MVP completamente offline y extractivo: puede mostrar coincidencias y resumir solo una selección exacta de frases copiadas con referencias. No hay LLM requerido. Nunca genera respuesta factual a partir de conocimiento libre ni inventa cita o número de página. Si la consulta no tiene resultados con confianza calibrada para el corpus, abstiene con “No encontrado en el archivo”. El umbral, recuperación y precisión se miden con conjuntos etiquetados; no se promete ausencia total de errores. Cualquier capa generativa futura debe validar IDs de cita, que cada span exista literalmente en la fuente y el localizador, y abstenerse si una comprobación falla.

## 7. Cinco wireframes

Cinco vistas funcionales objetivo: inicio/onboarding y selección; búsqueda; documento/citas; duplicados/timeline; ajustes/privacidad. Flujos y wireframes textuales están en [`UX.md`](UX.md). Estados sin carpetas, indexando, pausado, con error, vacío, modelo ausente, disco desconectado y no encontrado deben ser comprensibles y accesibles con teclado/lector de pantalla. Mostrar la fuente primero, no una respuesta opaca.

Por defecto no hay cuentas, telemetría, analítica ni solicitudes de red. Auditoría local solo guarda metadata de acciones (acción, ID opcional, fecha); no guarda rutas completas, texto, consultas ni prompts por defecto. Retención propuesta 30 días configurable; purga y export permiten actuar sobre el índice. Verificar que logs no filtren paths/consultas. La app avisa que índice y OCR contienen copia local de datos sensibles; cifrado a nivel de DB no está en MVP. Recomendar cifrado integral del disco.

Exportación y backup no incluyen documentos originales; incluyen índice/metadatos/texto derivado bajo elección explícita y advierten sensibilidad. Restaurar valida versión, migraciones y manifiesto antes de reemplazar; mantener backup previo y rollback si falla. Purga requiere confirmación que identifique impacto; quita archivos, fragmentos, embeddings, tags/membresías, caches y jobs. Puede quedar recuperación forense en SSD, snapshots, backups del sistema o copias exportadas: advertirlo y no prometer destrucción física segura.

Integración Ollama no forma parte del núcleo ni del MVP. Si se aprueba más adelante, solo loopback fijo `127.0.0.1:11434`; no host configurable, redirecciones deshabilitadas, proxies ignorados y consentimiento explícito con aviso de que Ollama puede registrar prompts. No auto-descargar modelo ni enviar originales; la experiencia completa sigue operativa sin él. No se crean microservicios propios.


Los cinco wireframes completos están en [UX.md](UX.md). La demo tiene cinco vistas navegables; filtros y acciones personales permanecen deshabilitados.

## 8. Empaquetado e instaladores

Plan completo en [EMPAQUETADO.md](EMPAQUETADO.md). Rust evita distribuir intérprete Python y se integra en Tauri; OCR/PDFium nativos se empaquetan como sidecars con consola oculta y recursos verificados. No se requiere terminal al usuario. Tauri dispone de paquetes por plataforma.[1]

## 9. GitHub Actions y Releases

Configuraciones reales: `../.github/workflows/ci.yml` y `../.github/workflows/release.yml`. CI ejecuta TypeScript, Vitest, build web, SQL, fmt, clippy y tests Rust. Release compila en Windows/macOS/Linux, sube instaladores y checksums a un borrador prerelease en GitHub Releases. No se ha ejecutado CI remota; GitHub no autorizado. Windows requiere firma pendiente y macOS certificados/notarización. No publicar borrador como versión estable hasta QA offline e inventario de recursos.

```yaml
# Fragmento real del contrato de calidad
- run: cargo fmt --all -- --check
- run: cargo clippy --workspace --all-targets --locked -- -D warnings
- run: cargo test --workspace --locked
```

## 10. Plan de hitos

Objetivo: una persona, seis semanas / 30 días hábiles. Estimación con riesgo alto en bindings/modelos/instaladores; no garantía de entregar todos los requisitos en cuatro semanas. Reserva QA incluida; firma externa no depende del desarrollador.

| Hito | Días | Entregable | Aceptación |
|---|---:|---|---|
| H1 — escritorio y FTS | 4 | UI demo, IPC, SQLite, bandeja | demo cargar/buscar/citar/borrar; pruebas y build; sesión nativa por plataforma pendiente |
| H2 — archivos e incremental | 7 | raíces, TXT/MD/PDF texto/OOXML/EML, watcher y recuperación | 20 fixtures/formatos; permisos no provocan borrados; reinicio continúa; cambios no publican versiones parciales |
| H3 — OCR e híbrida | 8 | Tesseract, PDFium, ONNX 384, vec0, RRF y filtros | OCR spa/eng offline; timeout; pooling/prefijos/normalización; Recall@10/nDCG evaluados y fallback FTS |
| H4 — organización y datos | 5 | SHA-256, pHash imagen, seis etiquetas, fechas/timeline, export/backup/restore/purge | similares no se tratan como duplicados exactos; fuente/fecha visibles; backup consistente y restauración rollback |
| H5 — instaladores y QA | 6 | empaquetado offline, accesibilidad, privacidad, fallos, licencias | instalar/buscar/desinstalar en tres OS; certificados; cero red por defecto; recursos y hashes reales |

Total: 4 + 7 + 8 + 5 + 6 = 30 días. Cuatro semanas solo permiten beta recortada para una plataforma; no cumple todo el MVP solicitado. Si OCR/empaquetado se retrasa, pHash y timeline deben diferirse explícitamente a 1.1 y etiquetar release parcial: son requisitos solicitados, no «extras» invisibles. Ollama generativo se planifica opcional después de la búsqueda extractiva; no bloquea uso sin LLM. Office heredado y MBOX también 1.1.

Objetivos a medir: p95 búsqueda <500 ms en corpus de referencia de 10.000 archivos/100.000 chunks sobre SSD y 8 GiB RAM; mantener UI interactiva durante OCR, sin transacciones largas. Publicar hardware/corpus/resultados antes de afirmar rendimiento. Calidad con consultas españolas etiquetadas, Recall@10 y abstención; umbral calibrado, no probabilidad improvisada.

## 11. Riesgos y mitigaciones

Amenazas prioritarias: archivo malicioso/parsers, rutas/symlinks escapando raíces, ZIP/XML/MIME bombs, consumo de CPU/RAM/disco, carrera de cambio del archivo, comando IPC demasiado amplio, extracción de datos a logs, binario/artefacto adulterado, configuración de proxy/red no deseada y backup sensible.

Controles mínimos: limitación dura en traversal/bytes/páginas/entradas; procesos OCR con timeout y sandbox disponible; archivos temporales privados; parser actualizado y dependencias/licencias inventariadas; revalidación de raíz e identidad; query SQLite parametrizada; capability Tauri de mínimo privilegio [4]; CSP sin conexión externa; ninguna API genérica filesystem/shell a UI; límites de input IPC; checksum verificado; permisos del directorio de datos; logs locales redactados y con retención 30 días configurable. No indexar ubicación de instalación, configuración o cache de la aplicación.

CI de objetivo: formateo/lint TypeScript, `cargo fmt --check`, clippy con warnings tratados, pruebas unitarias, tests integración SQLite/migración, parser fixtures hostiles, pruebas de límites y regresión de ranking, build de frontend/Tauri por plataformas. SBOM/licencias de artefactos nativos. No hay evidencia de CI ejecutada en este estado. No afirmar que parser/OCR está sandboxed o firmado hasta que las pruebas/build lo demuestren.

Métricas de producto no salen de la máquina: tiempos y conteos agregados locales son opcionales; no usar endpoints de analítica. Auditoría de acciones sin contenido. Respaldo y logs se excluyen del corpus por defecto. Cualquier función de red debe estar detrás de acción explícita y tener destino fijado; bloquear red en arranque y en búsqueda/indexado offline.


| Riesgo crítico | Mitigación concreta | Verificación |
|---|---|---|
| Indexar todo por accidente | selector explícito, estimación, exclusiones, sin raíz del disco por defecto, límites por carpeta | fixtures de symlinks, raíz prohibida y overflow |
| OCR lento o parser colgado | proceso worker acotado, 1 OCR, timeout por página, kill árbol, pause/checkpoint | fixture corrupto y escaneo largo, recuperación tras cierre |
| Alucinación / cita falsa | extractos por defecto; no encontrado sin evidencia; IDs y spans validados, fuentes tratadas como datos no instrucciones | consultas sin respuesta y prompt injection en documentos |
| Disco/CPU/RAM excesivos | cuotas, hilos/descanso, raster efímero, aviso antes del índice, rechazo límites | corpus grande, disco bajo, batería y perf profile |
| Fuga a API externa | sin cliente red por defecto, CSP local, Ollama loopback fijo opt-in, sin proxies/redirecciones ni pull automático | monitor red y firewall sin tráfico al arrancar/indexar/buscar |
| Backup o logs filtran contenido | advertencia, permisos OS, auditoría sin texto/paths/consultas, backup sin originales | inspección logs y archivo backup; retención/purga |
| Parser/ZIP/HTML malicioso | límites, sin macros/XXE/HTML remoto, worker aislado, dependencia fijada | fixtures adversariales y timeout |

### Preguntas generativas opcionales

Proveedor Ollama fijo en loopback, desactivado por defecto. RAG recupera y filtra citas antes del prompt; solicita JSON de afirmaciones con citationIds. Rechazar IDs inexistentes y fragmentos que no estén en el chunk. Esto verifica procedencia, no implica entailment: si una afirmación no se puede respaldar, no mostrarla como hecho; dar extractos y «No encontrado». Documentos son datos, no instrucciones. No hay garantía absoluta contra alucinaciones; evaluación y abstención obligatorias. Sin LLM, resultados/extractos completos.

## Sources

[1] https://v2.tauri.app/distribute
[2] https://alexgarcia.xyz/sqlite-vec
[3] https://huggingface.co/intfloat/multilingual-e5-small
[4] https://v2.tauri.app/security/capabilities
[5] https://tesseract-ocr.github.io/tessdoc
