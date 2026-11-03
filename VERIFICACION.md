# Verificación del andamiaje 0.1.0

## Ejecutado realmente

- React/TypeScript: 9 pruebas aprobadas en 3 archivos; typecheck y build Vite correctos.
- Rust core: 7 pruebas aprobadas.
- Puente Tauri: 1 prueba aprobada (trabajo en segundo plano, demo/estado/borrado sobre el mismo Store).
- SQL portable: 4 pruebas aprobadas, incluidos triggers FTS, claves foráneas y contrato de vector 384 float32.
- Total: 21 pruebas, sin fallos.
- `cargo clippy --workspace --all-targets -- -D warnings`: correcto.
- `cargo fmt --all`: aplicado.
- Revisión independiente de código/configuración: sin bloqueos detectados; no es auditoría exhaustiva.
- Navegador real: cargar demo → buscar electricidad → abrir extracto con 42 euros y Página 1; consulta inexistente muestra No encontrado.
- Tauri build debug Debian: paquete generado de 49.92 MiB en `target/debug/bundle/deb/Archivo Vivo_0.1.0_amd64.deb`.

## No verificado / no implementado

- El intento de arranque nativo salió con código 101 y `Failed to initialize GTK`: entorno sin DISPLAY ni Wayland. El smoke test GUI nativo no pudo completarse.
- El paquete Debian no fue instalado; host de pruebas no es Debian.
- Builds e instalación Windows/macOS no ejecutados. No hay certificados ni notarización configurados.
- GitHub no autorizado para crear repo/Issues: no hay URL remota ni CI remota ejecutada. Workflows preparados, no se declaran verdes.
- OCR, ONNX, sqlite-vec, watcher, indexación personal, RAG, backup, filtros, timeline y cálculo de duplicados no implementados. No se simulan.
- No hay mediciones de rendimiento ni calidad de recuperación.

## Diferencias conocidas de demo web / nativa

La demo web en memoria es una vista previa, no validación del motor Rust. Usa coincidencias parciales OR y algunas stopwords; Rust usa términos completos AND parametrizados en FTS5. Textos y etiquetas de ejemplo difieren ligeramente. Repetir carga en Rust devuelve 0 nuevos archivos; la demo web informa el tamaño del conjunto. Ambas muestran fuentes ficticias explícitas.

Antes de archivos multichunk, añadir `chunkId` al contrato y usarlo como clave React: el ID actual identifica el archivo. Incorporar pruebas de paridad y citas a página seleccionada. HMR Vite en Tauri puede requerir `devCsp` con WebSocket local; nunca ampliar CSP de producción por ello.

## Reproducir (desarrolladores)

```sh
npm run setup
npm run test:ui
npm run lint
npm run build:ui
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo fmt --all -- --check
python3 -m unittest discover -s tests -p '*test.py' -v
npm --prefix apps/desktop run tauri -- build --debug --bundles deb
```

Requiere Node >=22.12 compatible con Vitest, Rust estable y dependencias Tauri del sistema. El toolchain usado para esta entrega está en scratch del entorno de trabajo, no forma parte del proyecto ni de un instalador.
