# Archivo Vivo

Encuentra tus documentos y vuelve a entender lo que guardaste. Una aplicación de escritorio local para Windows, macOS y Linux, sin cuentas, telemetría ni subida de archivos.

## Estado actual — 0.1.0, andamiaje de desarrollo

Hay un paquete Linux `.deb` de depuración generado localmente para comprobar el empaquetado; no es una beta final. Windows/macOS y ejecución gráfica nativa siguen sin verificar en este entorno. La demo web y las pruebas del backend sí se han ejecutado.

**No es aún el MVP terminado ni una release para instalar en equipos personales.** Incluye cinco pantallas en español, tres extractos ficticios, búsqueda SQLite FTS5 con citas, consulta de documento, carga y borrado del índice demo, bandeja y comandos Tauri en segundo plano. La vista web usa una demo en memoria claramente identificada; la aplicación nativa usa SQLite.

Todavía NO incluye indexación de carpetas personales, OCR, embeddings, RAG generativo, búsqueda híbrida, cálculo de duplicados, etiquetas automáticas, línea de tiempo ni backup/restauración. Los controles pendientes no realizan esas operaciones. El esquema y el backlog permiten construirlas por fases.

## Qué podrás hacer en el MVP

- Encontrar la factura de una compra aunque no recuerdes el nombre del archivo.
- Consultar el plazo de aviso de tu contrato y ver el fragmento y la página originales.
- Reunir apuntes, recibos y manuales, localizar copias repetidas y consultar una línea de tiempo.

Sin un modelo generativo, seguirás teniendo búsqueda y extractos con citas. Si no existe evidencia suficiente, verás **«No encontrado»**. La integración opcional con Ollama no será necesaria para buscar.

## Instalar — cuando se publique la primera beta validada

No hay instaladores finales publicados todavía. Descarga solamente los artefactos de una release validada de este proyecto:

- Windows: abre el instalador `.exe` o `.msi` y sigue el asistente.
- macOS: abre el `.dmg` y arrastra Archivo Vivo a Aplicaciones. La distribución pública debe estar firmada y notarizada.
- Linux: usa el `.deb` con tu gestor de software o abre el `.AppImage` tras permitir su ejecución desde Propiedades.

El paquete completo incluirá OCR y embeddings: no tendrás que instalar Python, Tesseract, modelos o herramientas por terminal. Windows debe recibir WebView2 mediante el instalador offline para equipos que no lo tengan. Linux seguirá necesitando las bibliotecas de escritorio compatibles de su distribución.

## Probar hoy sin archivos personales

En la aplicación de desarrollo, pulsa **Cargar demo**. Busca `electricidad`, `alquiler` o `lavadora`. Abre un resultado para ver el extracto y su cita. Las rutas `demo/` son ejemplos ficticios; no se presentan como originales en tu disco.

## Elegir carpetas — previsto para el hito 2

En la beta, entra en **Ajustes → Carpetas → Añadir carpeta** y elige solamente lo que necesitas. Verás estimación de archivos, tamaño y límites antes de confirmar. Nunca se seleccionará todo tu disco automáticamente. Podrás excluir subcarpetas, pausar y quitar una carpeta. La versión actual indica que esta función está pendiente.

## Buscar — demo disponible; búsqueda híbrida en el hito 3

Escribe palabras o una pregunta. Los resultados incluyen archivo, página cuando realmente exista, y fragmento. En documentos sin páginas estables se mostrará párrafo, hoja/celda o diapositiva, nunca una página inventada. Los filtros de tipo, fecha, carpeta y etiqueta llegarán con la búsqueda híbrida.

Los extractos no son asesoramiento ni una garantía de respuesta completa: abre el documento para comprobar el contexto.

## Borrar el índice

Actualmente, **Ajustes → Borrar índice** (o **Borrar demo** en la vista web) elimina los datos de ejemplo del índice; puedes volver a cargarlos. No borra documentos originales. La demo web se borra de memoria; el índice nativo es SQLite.

La beta tendrá **Borrar todo el índice** con confirmación, cierre de trabajadores y limpieza de textos, vectores, miniaturas, cachés y registros vinculados. Las carpetas seleccionadas se olvidarán para impedir la reindexación automática. No se promete borrado forense de SSD ni de backups externos.

## Backup y restauración — previstos para el hito 4

En la beta: **Ajustes → Privacidad → Crear backup**, elige un destino, y usa **Restaurar backup** para recuperarlo. El backup será una instantánea consistente del índice y sus ajustes; no incluirá los documentos originales. La restauración verificará integridad y versión antes de sustituir nada.

Estas funciones todavía están deshabilitadas. No copies una base SQLite abierta sin considerar su WAL. El índice y los backups contienen información sensible: protégelos como tus documentos; cifrado de disco del sistema recomendado. No hay cifrado de base de datos incorporado en este andamiaje.

## Privacidad

No se usa Internet para la demo ni se envían documentos. No hay telemetría. La UI no tiene permisos genéricos de shell, HTTP ni lectura arbitraria de archivos. Los datos nativos se guardan en el directorio de datos de la aplicación gestionado por el sistema.

Actualizaciones, descargas opcionales y Ollama solo se incorporarán con consentimiento explícito. «Local» no implica «cifrado» ni protege de otras aplicaciones con acceso a tu usuario.

## Documentación y backlog

- `docs/ARQUITECTURA.md`: visión, componentes, monorepo, datos, pipeline, fases, riesgos y matriz de entrega.
- `migrations/001_initial.sql`: esquema ejecutable SQLite y FTS5.
- `migrations/optional/001_vec0.sql`: índice vectorial opcional, separado del esquema base.
- `docs/API.md`: contrato IPC y payloads, con implementado/previsto.
- `docs/UX.md`: cinco wireframes.
- `docs/EMPAQUETADO.md`: paquetes, modelos, firma, actualizaciones y puertas de release.
- `backlog/issues.json`: cinco Issues listas para publicar cuando se autorice GitHub.

## Desarrollo — no necesario para usuarios finales

Requisitos: Node.js 22 LTS, Rust estable y dependencias de desarrollo Tauri de tu plataforma.

```sh
npm run setup
npm run preview:ui
npm run dev
npm run test:ui
cargo test --workspace
python3 -m unittest discover -s tests -p '*test.py' -v
npm run build:desktop
```

`preview:ui` es una demo de navegador, no el backend nativo. `dev` arranca Tauri y SQLite. Los paquetes se construyen desde cada sistema operativo; el workflow crea borradores de prerelease y no sustituye pruebas de instalación, certificados de firma ni notarización.

## Licencia

MIT para el código del proyecto. Los paquetes OCR y modelos futuros deben conservar sus licencias y atribuciones. Véase `LICENSE`.
