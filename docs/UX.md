# UX de Archivo Vivo — cinco wireframes

> Hay cinco pantallas demo React implementadas y probadas. Estos wireframes describen el MVP futuro con carpetas personales: las funciones pendientes están deshabilitadas. La demo web no prueba paridad del motor Rust.

## Principios y navegación

- La persona elige carpetas; nunca se escanea Home completo ni se indexa sin permiso explícito.
- “La fuente antes que la respuesta”: extracto literal, documento y localizador son más prominentes que un score. MVP no inventa respuestas generativas.
- Informar “Solo en este dispositivo” solo si el build y estado realmente no realizan solicitudes de red para esa acción.
- La barra lateral permite volver a Inicio, Buscar, Documento, Duplicados y Ajustes. El contenido adapta layout a ventana mínima 760×600 actual; en tamaños pequeños colapsa navegación a menú accesible.
- Cada pantalla maneja estados vacíos, carga, error, sin conexión al original, modelo/OCR ausente y cancelación. Ningún progreso depende solo de color.
- Accesibilidad: foco visible, enlaces para saltar navegación, orden de tab lógico, `aria-live` para cambios de estado, diálogo de confirmación con foco atrapado/restaurado, contraste y zoom 200%, lector de pantalla. Navegación teclado sin drag obligatorio.

## Wireframe 1 — Inicio y añadir carpetas

```text
┌ Archivo Vivo ──────────────────────────────── [Ajustes] ──┐
│ Tu archivo. A mano.                                        │
│ Busca texto localmente. Nada se indexa hasta que elijas.   │
│                                                           │
│ [ Elegir carpetas… ]   [ Cargar demo ficticia ]            │
│                                                           │
│ Privacidad: el índice guarda extractos en este dispositivo.│
│ Límites: 10.000 archivos (aviso), hasta 50.000; 100 MiB;  │
│ OCR hasta 100 páginas. Se excluyen cachés y ocultos.      │
│                                                           │
│ Raíces añadidas                                             │
│ Documentos         Preparada      1.238 archivos [Quitar]  │
│ Archivo externo    Sin conexión   462 archivos [Reintentar]│
│                                                           │
│ Última actualización: hoy 14:20 · [Buscar en mi archivo]   │
└───────────────────────────────────────────────────────────┘
```

**Acciones y comportamiento:** `Elegir carpetas…` abre selector nativo. Tras elegir, modal describe alcance, límites y creación del índice antes de confirmar. Se muestra nombre legible y ruta completa solo si la persona necesita verificar; preferir no exponer ruta por toda la UI. “Cargar demo” usa datos ficticios y deja claro que no lee personales. El estado sin raíces no ofrece buscador engañoso; acceso a Ajustes siempre visible. Durante indexado se presenta job total y etapa, pausa/cancelación, sin modal bloqueante. Desconexión de unidad no se confunde con borrado.

## Wireframe 2 — Buscar

```text
┌ Navegación ──────┬ Buscar ─────────────────────────────────┐
│ Inicio            │ [¿Cuánto pagué de electricidad?     ][⌕]│
│ Buscar            │ [Raíces ▾] [Tipo ▾] [Etiqueta ▾] [Fecha]│
│ Documento         │ Buscar: híbrida local ● 3 fuentes       │
│ Duplicados        │                                        │
│ Ajustes           │ 1  Factura electricidad.pdf  Página 1  │
│                   │    “Total a pagar: 42 euros.”          │
│ ● Local           │    Facturas · PDF · feb 2025 [Abrir]   │
│ 1.700 documentos  │                                        │
│                   │ 2  gasto-febrero.xlsx  Gastos!B2:B4    │
│                   │    “Electricidad … 42,00”              │
│                   │    Hoja de cálculo · ene 2025 [Abrir]  │
│                   │                                        │
│                   │ [No se encontró resultado]             │
└───────────────────┴────────────────────────────────────────┘
```

**Acciones:** enter o botón Buscar dispara query; filtros se anuncian y se pueden limpiar individualmente. Orden híbrido/léxico se indica y filtros no borran la búsqueda. Los resultados son fragmentos literales enlazados a cita; `page` no se muestra si no existe. Score no visible por defecto. Si sólo FTS está activo, mostrar “Búsqueda por texto; semántica no disponible”. Si vacío, explicar si no hay raíces, no hay coincidencias o un job aún procesa. No mostrar “respuesta” generada. El extracto resaltado conserva puntuación/diacríticos originales.

## Wireframe 3 — Documento y citas

```text
┌ ‹ Resultados ── Factura electricidad.pdf ───────────────────┐
│ PDF · 1 página indexada · modificada 18 feb 2025            │
│ Hogar/Facturas/Factura electricidad.pdf [Abrir original]    │
│                                                           │
│ Página 1                                                    │
│ ┌ Extracto de origen ────────────────────────────────────┐ │
│ │ Total a pagar: 42 euros.  [Coincidencia]               │ │
│ └────────────────────────────────────────────────────────┘ │
│ Cita: Página 1 · chunk 883 · [Copiar referencia]           │
│ Fuente: OCR local · idioma spa · verificada ✓               │
│ Etiquetas: [Facturas] [+ Añadir etiqueta]                  │
│                                                           │
│ [Original no disponible: conservar extracto indexado]      │
│ [Volver a resultados]                                      │
└───────────────────────────────────────────────────────────┘
```

Si existe texto PDF original y el backend resuelve la página, al abrir se usa un visor/handler explícito del sistema; no se interpreta una ruta suministrada por frontend. Si original no existe/raíz offline, se mantiene extracto como archivo indexado y se explica que no puede abrir fuente. Para DOCX, localizador “párrafo N”/estructura sin página; citas nunca dicen “Página”. Copiar referencia puede copiar título + locator + excerpt solo bajo acción explícita. Apertura externa evita shell arbitraria. El método OCR/texto está separado de la certeza de contenido.

## Wireframe 4 — Duplicados y timeline

```text
┌ Duplicados / Fechas ────────────────────────────────────────┐
│ [Duplicados] [Fechas mencionadas]                           │
│                                                           │
│ Coincidencia exacta · SHA-256 de contenido                 │
│ ☐ Factura final.pdf      248 KB · 12 ene                    │
│ ☐ factura-final(1).pdf   248 KB · 14 ene                    │
│ 1 elemento seleccionado. [Abrir ambos] [Revisar]            │
│                                                           │
│ Fechas mencionadas (no fechas de archivo)                   │
│ 2025-03-01 · Contrato.pdf · “con 30 días de antelación”     │
│                                           [Ver cita]       │
│                                                           │
│ No eliminamos automáticamente originales.                  │
└───────────────────────────────────────────────────────────┘
```

Distinguir duplicado exacto por hash frente a parecido de imagen; indicar evidencia y score de similitud, nunca agrupar semánticamente como identidad segura. “Revisar” abre copias y resalta diferencias solo si se implementa. No eliminar automáticamente. Timeline etiqueta “fecha mencionada” y referencia literal; metadata de archivo es vista diferente. Sin duplicados o fechas, estado vacío explica cobertura/limitación.

## Wireframe 5 — Ajustes, privacidad y estado

```text
┌ Ajustes ───────────────────────────────────────────────────┐
│ Índice local                                                │
│ Estado: 1.700 archivos · FTS5 activo · ONNX no instalado   │
│ [Pausar indexado] [Reconciliar ahora] [Exportar backup…]   │
│                                                           │
│ Privacidad                                                  │
│ El índice almacena texto extraído en claro en este equipo. │
│ No incluye originales. Usa cifrado integral del disco.      │
│ [Ver alcance] [Borrar índice…] [Quitar una carpeta…]       │
│                                                           │
│ Recursos                                                   │
│ OCR spa/eng: no disponible (OCR pendiente)                 │
│ Modelo semántico: [Importar modelo…] (sin descarga auto)   │
│                                                           │
│ Diagnóstico: eventos watcher perdidos; reconciliación       │
│ pendiente · [Ver estado]                                   │
│ Auditoría local metadata: 30 días [Cambiar]                │
└───────────────────────────────────────────────────────────┘
```

Toda acción destructiva presenta resumen y confirmación: alcance, cantidades conocidas, datos indexados que se borran, originales que no se tocan, límites de secure erase. El modal pide confirmación adicional para borrar todo y no reutiliza token. Backup permite elegir ubicación con selector nativo, explica que texto extraído es sensible y ofrece cifrado si está implementado; no afirma cifrado si no lo está. La descarga/importación de modelo distingue archivo local de descarga consentida. El apartado de conexión Ollama no aparece en MVP si no está compilado; si aparece en build posterior, limita loopback y advierte operador/retención de Ollama.

## Estados UX transversales

| Estado | Mensaje/acción |
|---|---|
| Índice vacío | “Elige carpetas o prueba la demo ficticia.” No dispara scan implícito. |
| Procesando | Etapa + progreso comprobable, pausar/cancelar; no prometer tiempo exacto desconocido. |
| Pausado | Mantiene resultados previos; reanudar continúa jobs válidos. |
| Error de formato/límite | Mostrar nombre, motivo y límite; conservar indexado previo y permitir retry tras cambio. |
| Raíz inaccesible | “No se pudo comprobar; conservamos índice anterior.” No ofrecer purga como única opción. |
| Semántica/OCR ausente | Fallback visible a búsqueda léxica; sin descargas automáticas. |
| No encontrado | Abstención explícita; sugerir filtro/consulta, no respuesta inventada. |
| Cita no verificable | No mostrar como cita válida; error y acción “Reindexar”. |
| Purga en curso | Progreso, cancelación segura por etapa y listado final de derivados no eliminados. |

El diseño tiene cinco wireframes; ajustar estilo visual es libre siempre que no degrade privacidad, trazabilidad, teclado ni distinción entre actual y pendiente.
