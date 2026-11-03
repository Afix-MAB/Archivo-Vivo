# Backlog — Archivo Vivo

Este backlog local define cinco issues ordenados por hitos H1–H5 para un equipo de **una persona y 4–6 semanas**. El plan base usa seis semanas. H5 y la disponibilidad de artefactos/certificados externos pueden bloquear una release general; construir un bundle no equivale a firmarlo.

- `issues.json`: array JSON de cinco issues con `title`, `body` y `phase`. Cada cuerpo incluye estado, alcance y criterios verificables.
- Arquitectura y contratos: [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md), [`../docs/API.md`](../docs/API.md), [`../docs/UX.md`](../docs/UX.md), [`../docs/EMPAQUETADO.md`](../docs/EMPAQUETADO.md).

## Orden de trabajo

| Fase | Esfuerzo orientativo | Entrega |
|---|---:|---|
| H1 | 3–5 días | Shell React/Tauri y demo FTS estable, sin acceso a archivos personales. |
| H2 | 6–8 días | Selector/raíces, watcher/reconciliación, extracción acotada y ciclo seguro de jobs. |
| H3 | 7–9 días | OCR PDF, embeddings ONNX locales y búsqueda híbrida con fallback. |
| H4 | 4–6 días | Tags, duplicados exactos, evidencia de fechas, backup y purga. |
| H5 | 6–8 días | QA, accesibilidad, seguridad y al menos un bundle validado; firmas externas según plataforma. |

Los intervalos solapan investigación, revisión y pruebas; suman aproximadamente 26–36 días-persona. A cuatro semanas, reducir H4 a purga y backup básico y H5 a un único target nativo. Posponer LLM/Ollama, Office heredado, timeline avanzado y duplicados semánticos antes que quitar consistencia del índice, protección de raíz, evidencia de citas o privacidad. No declarar estimaciones de rendimiento como medidas.

## Estado inicial comprobado

Existen cinco pantallas demo, Rust/Tauri y SQLite FTS5. Pasan 21 pruebas; se generó .deb debug. No existen aún watcher, extracción personal, OCR, ONNX ni RRF. GUI nativa y distribución final pendientes. Las cinco Issues son trabajo futuro y no están publicadas ni cerradas.