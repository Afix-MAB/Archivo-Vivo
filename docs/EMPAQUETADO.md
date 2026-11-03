# Empaquetado, instalación y actualización

> Estado actual: configuración Tauri 2 declara targets Linux (`deb`, `appimage`), Windows (`nsis`, `msi`) y macOS (`app`, `dmg`); esto no prueba que se hayan construido, firmado o distribuido. Los sidecars OCR y pesos del modelo no están presentes; sus recursos están marcados pendientes. Este plan no inventa hashes, certificados ni mediciones.

## Objetivo de release

Instalador completo, nativo y offline-first para la plataforma publicada. Sin usuario final obligado a instalar Python, Tesseract, runtime ONNX u Ollama. Sin cuentas, backend, contenedor, actualización automática inesperada o descargas en startup. El build ligero, si se ofrece, debe identificarse como tal y dejar explícito que semántica/OCR requiere importar recursos localmente o acción de descarga consentida.

Tauri permite elegir bundles por plataforma, pero tipo de instalador no garantiza firma o contenido correcto [1]. La firma de código y notarización dependen de herramientas, identidades/certificados externos y configuración por plataforma. No declarar un instalador release-ready hasta probar instalación, upgrade/manual replacement y desinstalación limpia en cada OS objetivo.

## Inventario de artefactos de release

| Artefacto | Empaquetado previsto | Estado / control requerido |
|---|---|---|
| Frontend React/Vite | assets compilados en bundle Tauri, CSP local | estructura actual declarada en `tauri.conf.json`; UI demo compilada y probada; MVP personal pendiente. |
| Core Rust + SQLite | binario nativo con SQLite bundled; DB de usuario fuera de carpeta de instalación | dependencias/licencias SBOM; migraciones versionadas. |
| SQLite FTS5 | incluida/compilada en SQLite que usa el core | smoke test de `chunks_fts` al instalar. |
| sqlite-vec `vec0` | recurso nativo versionado por tripleta SO/arquitectura y cargado desde ruta interna fijada | no disponible hoy; pin de versión, checksum real, pruebas ABI/carga y fallback FTS5. No aceptar plugins/extensions externos. |
| Runtime ONNX y modelo | binario/runtime compatible más ONNX multilingual-e5-small INT8, tokenizer/vocab/config/special tokens | pendientes. fijar revision/origen y licencia MIT modelo [3], validar embedding 384-D y manifest hashes al build. Sin red en arranque. |
| PDFium | librería nativa compatible por plataforma | pendiente; revisar licencia, versión, firma, CVEs y pruebas raster. |
| Tesseract 5 + `spa`/`eng` | sidecar y tessdata incluidos, firmados cuando OS lo exige | pendiente; Tesseract Apache-2.0 [5]; incluir avisos y versión. No ejecutar Tesseract del PATH del usuario por defecto. |
| Docs/licencias | `THIRD_PARTY_NOTICES`, licencias y SBOM empaquetados | crear y verificar para cada artefacto redistribuido. |
| Manifest de recursos | JSON build-time de nombre, versión, arquitectura, bytes y SHA-256 | calcular sobre archivos finales reales durante build. Prohibido check-in de hash placeholder. |

La edición completa solo se denomina “offline” luego de una prueba con red desconectada desde instalación limpia que compruebe primera apertura, selector, indexado PDF, OCR/modelo (si incluidos), búsqueda, backup y eliminación. No asumir que las librerías se incluyen solo porque los recursos se encuentran en `resources/`; validar artefactos dentro del bundle instalado.

## Manifiesto y reproducibilidad

El pipeline de build genera un manifiesto por plataforma de la forma:

```json
{
  "schemaVersion": 1,
  "appVersion": "<versión del build>",
  "target": "<triple SO-arquitectura>",
  "resources": [
    {"name":"tesseract","version":"<versión fijada>","path":"resources/ocr/<binario>","bytes":0,"sha256":"<calculado al build>"},
    {"name":"tessdata-spa","version":"<commit/paquete fijado>","path":"resources/ocr/spa.traineddata","bytes":0,"sha256":"<calculado al build>"},
    {"name":"onnx-model","version":"<revisión fijada>","path":"resources/models/model.onnx","bytes":0,"sha256":"<calculado al build>"}
  ]
}
```

Ejemplo de forma exclusivamente: campos bytes/hash son placeholders deliberados, no hashes publicables. Build debe fallar si falta un fichero obligatorio, hay marcador, formato invalido, licence omitted, hash no coincide o recurso de otra arquitectura. El manifiesto final inmutable se conserva con el artefacto y firma del release; no generar cifras ficticias en docs/installer. Lockfiles fijan dependencias; build reproducible requiere toolchain y versiones documentadas, sin garantizar reproducibilidad hasta comprobarla.

## Construcción por sistema operativo

1. Host y toolchain nativa por target; registrar versión Rust, Node/NPM, Tauri CLI, compilador, SDK y entorno CI. No compilar sidecar a host equivocado.
2. `npm ci` para lockfile de frontend; tests/lint frontend; `cargo test --workspace` y lint/formato; test de migraciones y parser/recursos.
3. Obtener dependencias nativas con procedencia y versión fijada; verificar licencias, firma/origen y SHA-256; empaquetar en carpeta staging por target.
4. Ejecutar tests en staging: OCR smoke con PDF fixture, inferencia tokenizer/modelo, FTS y vector fallback, watcher y selector; caso de timeout/kills, ausencia de red, sin permisos, rutas con caracteres/no ASCII.
5. Generar bundle Tauri target y verificar contenido descomprimido, firma y checksums. Inspeccionar ACL/capability, CSP y canales de red.
6. Instalar en VM/host limpio, sin Rust/Node/Python/Tesseract preinstalados; lanzar offline, crear DB en ubicación de usuario, probar upgrade y desinstalar sin tocar originales. Conservar logs scrubbed y hashes de artefacto.

Los scripts del package.json están preparados. Se ejecutaron 21 pruebas y build/lint locales; un paquete .deb debug de 49.92 MiB fue generado. No se verificaron instaladores Windows/macOS ni ejecución gráfica nativa. Detalles en ../VERIFICACION.md.

## Firmas y publicación

- **macOS:** bundle `.app`/`.dmg`; cuenta Apple Developer, identidad Developer ID, certificado y notarización/requisitos de Apple deben ser proporcionados por quien publica. Ejecutar `codesign --verify --deep --strict`, comprobar Gatekeeper/notarización desde un Mac limpio y no firmar recursos modificados tras sign. Certificados Apple no vienen incluidos; disponibilidad/costos y renovación bloquean publicación hasta decisión de propietario.
- **Windows:** MSI/NSIS según canal; firma Authenticode con certificado confiable o servicio de firma aprobado, timestamp y verificación de firma en VM limpia. Firma puede reducir warnings pero no garantiza reputación de SmartScreen. El certificado/titular/costo no se conoce; es precondición externa, no cifra estimada.
- **Linux:** `.deb` y AppImage son targets configurados. Generar checksum y firma detached de release con clave protegida; verificar instalación en distribución compatible, dependencias WebView2/WebKit y apertura sin privilegios root. No publicar AppImage/paquete con dependencias de sistema asumidas sin declarar.

Firmar binarios internos/sidecars si política OS lo requiere y mantener relación de hashes firmada. No sobrescribir recursos después de la firma. No publicar si OCR/ONNX binaries sin revisión de origen/licencia o si un hash de manifiesto no se deriva del artefacto real.

## Instalación, datos y desinstalación

La instalación guarda ejecutables en directorio de aplicaciones. Base de datos, recursos de usuario/importados, caches temporales y logs se almacenan bajo `app_data_dir`/cache del sistema con permisos privados, no junto a binario ni archivos personales. El programa no modifica archivos de origen. El usuario controla raíces persistidas.

El desinstalador no elimina silenciosamente índice o backups sensibles; ofrece explicación/acción de limpieza. Si queda índice tras uninstall, documentarlo e indicar cómo eliminarlo desde sistema antes de la remoción; si la plataforma ofrece opción, obtener consentimiento explícito. Conservar original intacto. Reportar que snapshots, backup OS y flash storage pueden conservar bloques; no prometer secure erase.

Migraciones se ejecutan con backup transaccional consistente y versión de esquema. Si actualización encuentra DB incompatible, proteger copia anterior, abrir en modo seguro y permitir export/recuperación; nunca borrar base para hacer que app inicie. El downgrade no es soportado salvo que migration esté diseñada y probada.

## Actualización y red

No hay actualización automática en startup. Para MVP, actualizar mediante release manual instalable, con release firmado, checksum autenticado y notas de versión; el usuario inicia y confirma. Tauri updater firmado es trabajo posterior/adaptador opt-in: requiere generación/rotación de claves, endpoint de publicación, verificación de firma, protección contra rollback, política de canal y consentimiento; no está configurado actualmente. No inferir “updater firmado” de firma del bundle [1].

La aplicación no contacta endpoints remotos para iniciar, indexar o buscar. El instalador completo porta recursos. Una build ligera podrá incluir botón de acción deliberada para descargar el recurso con URL/versión fijada, aviso de tamaño/licencia, verificación de checksum/firma y opción de cancelar; sin tracking y sin transferir documentos. Si no se puede comprobar TLS/manifest/recurso, cancelar sin instalar. Ollama opcional futuro solo en `127.0.0.1:11434`, sin redirects ni proxy, opt-in explícito, sin host editable; la advertencia explica que daemon local puede mantener logs/prompts. No usar endpoints remotos para telemetría ni inferencia silenciosa.

## Registro de release y criterios de go/no-go

Cada publicación captura: versión/commit; tripleta y toolchain; dependencias/runtime y licencia; manifiesto final de recurso con hash real; firma/identidad verificada; test offline limpio; pruebas de migración/backup/restore; SHA-256 instalador y firma detached; notas de versión; matriz de fallos aceptados y compatibilidad de OS.

No-go si falta un recurso declarado obligatorio, firma inválida, capability concede filesystem/shell genérico, bundle descarga en arranque, red aparece durante indexación/search, FTS no está operativa sin vec0, OCR no mata timeout, manifest contiene placeholder, consulta/cuerpo llega a log, no existe copia recuperable ante migración fallida o el install/uninstall toca originales. Publicación general multiplataforma bloqueada por certificados/cuentas externos y pruebas nativas pendientes; se permite build de desarrollo claramente etiquetado, no presentado como release firmada.

## Evidencia actual

Paquete Linux debug .deb generado: 49.92 MiB. Arranque nativo bloqueado por ausencia de DISPLAY (`Failed to initialize GTK`, código 101). No instalado ni probado en Windows/macOS. Workflows ci.yml/release.yml preparados, sin CI remota; ver ../VERIFICACION.md.

## Sources

[1] https://v2.tauri.app/distribute
[3] https://huggingface.co/intfloat/multilingual-e5-small
[5] https://tesseract-ocr.github.io/tessdoc
