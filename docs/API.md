# API local de Archivo Vivo

> Contrato objetivo de comandos Tauri y eventos tipados. No es una API HTTP ni refleja todo lo implementado. A día de hoy solo existen `demo_load`, `search`, `document_get`, `index_status`, `index_clear`; no existen todavía selección/indexación de raíces, OCR, búsqueda híbrida, duplicados, tags o backup. La implementación actual de consulta está demostrada sobre datos demo. Este documento sirve de destino versionado para completar el producto.

## Convenciones

- Transporte: `invoke(command, payload)` de Tauri 2, serialización JSON camelCase. Respuestas y errores son JSON estructurado tras migrar de los `String` actuales.
- IDs son enteros opacos a UI; la UI no interpreta ni construye paths. `requestId` es UUID generado por cliente para correlacionar operación, evento y error, no idempotency key por defecto.
- `page` es entero desde 1 solo si extractor dispone de página de origen; `null` para formatos paginados dinámicamente como DOCX. `locator` es texto visible y localizador estructurado para reproducir la cita.
- Valores `score` son relevancia interna de ranking y solo comparables dentro de una versión/configuración determinada. No representan probabilidad ni veracidad.
- Límites del diseño: consulta ≤512 bytes UTF-8 (validada en comando `search`); listas se paginan; títulos/extractos y filtros tienen máximos fijados en servidor. Límites completos antes de abrir UI en producción.
- Errores no deben incluir stacks, SQL, texto completo o rutas externas en el canal de UI. Los detalles técnicos se redactan en log local.

## Tipos compartidos

```ts
type JobState = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled';
type IndexMode = 'demo' | 'lexical' | 'hybrid' | 'degraded';
type ErrorCode =
  | 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'PERMISSION_DENIED'
  | 'OUTSIDE_REGISTERED_ROOT' | 'UNSUPPORTED_FORMAT' | 'LIMIT_EXCEEDED'
  | 'SOURCE_UNAVAILABLE' | 'CORRUPT_FILE' | 'MODEL_UNAVAILABLE'
  | 'INDEX_PAUSED' | 'CANCELLED' | 'DATABASE_ERROR' | 'INTERNAL';
interface ApiError {
  code: ErrorCode;
  message: string;        // localizable, safe for display
  retryable: boolean;
  requestId: string;
  details?: { limitName?: string; max?: number; jobId?: number };
}
interface Citation {
  fileId: number;
  chunkId: number;
  locator: string;        // e.g. "Página 4", "Hoja!B2:B6", "Diapositiva 2"
  page: number | null;
  startOffset: number | null;
  endOffset: number | null;
  excerpt: string;        // literal span from stored chunk
  verified: boolean;      // backend re-read span and locator before returning
}
interface SearchHit {
  id: number;             // file ID for compatibility with existing UI type
  title: string;
  path: string;           // present only after the user grants root access; UI must not send it back
  page: number | null;
  locator: string;
  excerpt: string;
  score: number;
  tags: string[];
  mime: string;
  chunkId: number;
  citation: Citation;
  modifiedAt: string | null;
  mode: IndexMode;
}
interface RootSummary {
  id: number;
  displayName: string;    // safe display path/name; no capability implied by this value
  enabled: boolean;
  state: 'ready' | 'offline' | 'permission_lost' | 'reconciling';
  indexedFiles: number;
  lastReconciledAt: string | null;
}
interface Job {
  id: number;
  rootId: number | null;
  fileId: number | null;
  state: JobState;
  stage: 'discovery' | 'extract' | 'ocr' | 'chunk' | 'embed' | 'commit' | 'reconcile';
  progress: number;       // [0,1], may be null when unknowable before enumeration
  completedItems: number;
  totalItems: number | null;
  errorCode: ErrorCode | null;
}
```

`SearchHit.path` conserva el tipo existente, pero la UI nunca usa la ruta para invocar operaciones. En vistas de privacidad se puede sustituir por `displayPath` redactada. `Citation.verified` no significa que el extractor entienda semánticamente el texto; solo que span/localizador corresponden a lo guardado.

## Comandos base implementados

### `demo_load`

Carga tres extractos de demostración ficticios de forma idempotente.

**Payload:** `{}`

**Respuesta:** `number` de documentos añadidos en esta llamada (actual: 3 la primera, 0 en repetición).

**Efecto:** no indexa los archivos personales ni pone documentos ficticios como raíces.

### `search`

**Payload real:** `{ "query": "electricidad" }`

**Respuesta actual:** `SearchHit[]` con `{id,title,path,page,locator,excerpt,score,tags,mime}`; la implementación actual ejecuta búsqueda sobre store demo.

**Objetivo ampliado:**

```json
{
  "query": "¿cuánto pagué de electricidad?",
  "requestId": "7f4f5eb0-df5c-43a8-9157-a81c4e105998",
  "filters": {
    "rootIds": [2], "mime": ["application/pdf"], "tagIds": [4],
    "modifiedAfter": "2025-01-01T00:00:00Z", "modifiedBefore": null
  },
  "limit": 20,
  "offset": 0,
  "mode": "auto"
}
```

`mode=auto|lexical|hybrid`. Si falta ONNX o vec0, `auto` vuelve a FTS y devuelve `mode=degraded`/diagnóstico de capacidad; nunca falla una búsqueda textual por ausencia de vector. `limit` default 20, máximo 100; `offset` no negativo. Consulta >512 bytes UTF-8 se rechaza (límite actual). Términos de query se parametrizan; no concatenar sintaxis SQL.

**Respuesta objetivo:**

```json
{
  "requestId": "7f4f5eb0-df5c-43a8-9157-a81c4e105998",
  "mode": "hybrid",
  "hits": [{
    "id": 17, "title": "Factura electricidad.pdf", "path": "Hogar/2025/Factura electricidad.pdf",
    "page": 1, "locator": "Página 1", "excerpt": "Total a pagar: 42 euros.",
    "score": 0.0318, "tags": ["Facturas"], "mime": "application/pdf",
    "chunkId": 883, "citation": {
      "fileId": 17, "chunkId": 883, "locator": "Página 1", "page": 1,
      "startOffset": 118, "endOffset": 140, "excerpt": "Total a pagar: 42 euros.", "verified": true
    }, "modifiedAt": "2025-02-18T12:00:00Z", "mode": "hybrid"
  }],
  "nextOffset": null,
  "capabilities": {"fts": true, "vectors": true, "model": "multilingual-e5-small"}
}
```

El ejemplo de respuesta expresa el formato del contrato, no es dato actual. El resultado vacío es `{hits:[],nextOffset:null,...}`. No hay `answer` generado en el MVP.

### `document_get`

**Payload actual:** `{ "id": 17 }`.

**Respuesta actual:** `SearchHit | null`.

**Objetivo:** `{ "id": 17, "requestId": "…", "includeChunks": true }` devuelve `DocumentDetail` con archivo, estado original (`available|offline|permission_lost|deleted`), fragmentos y citas exactas paginables. Para el comando real existente no enviar argumento path. Para obtener el documento se valida ID, raíz activa y relación persistida.

### `index_status`

**Payload actual:** `{}`; respuesta `{ "files": 3, "mode": "demo" }` en el estado demo tras seed.

**Objetivo:** devolver número de archivos por estado, raíces, capacidades, cola/jobs activos, pausa y espacio en disco aproximado. No incluir rutas o contenido en auditoría. Debe ser consultable al iniciar para recuperar UI si se perdió un evento.

### `index_clear`

**Payload actual:** `{}`; limpia el store completo, sin argumento de ruta.

**Objetivo de uso:** borrar índice completo requiere confirmación aparte mediante token de una sola acción emitido por `privacy_purge_confirmation`. El comando legado no debe usarse como API pública de purga sin protección; retirar o adaptar antes de producción. Nunca borra originales.

## Comandos objetivo adicionales

| Comando | Entrada | Respuesta / efecto | Estado |
|---|---|---|---|
| `folder_pick` | `{requestId}` | `RootSummary|null`; selector nativo | Plan |
| `root_register` | `{pathFromNativePicker,requestId}` | `{root:RootSummary,job:Job}`; backend canoniza y no acepta ruta arbitraria de UI | Plan interno, preferible combinar con `folder_pick` |
| `root_list` | `{}` | `RootSummary[]` | Plan |
| `root_remove` | `{rootId,requestId,confirmationToken}` | `{purged:true,filesRemoved:number}`; revoca y purga derivados, nunca originales | Plan |
| `index_pause` | `{}` | `{paused:true}` | Plan |
| `index_resume` | `{}` | `{paused:false,activeJobs:number}` | Plan |
| `index_rescan` | `{rootId,requestId,full:boolean}` | `Job` | Plan; `full` completa reconciliación aunque watcher informe eventos |
| `job_get` | `{jobId}` | `Job|null` | Plan |
| `job_cancel` | `{jobId}` | `{cancelRequested:true}` | Plan; invalida generación antes de confirmar |
| `document_open` | `{fileId,requestId}` | `{opened:boolean,availability:string}` | Plan; backend abre solo ID ya autorizado |
| `tags_list` | `{}` | `Tag[]` | Plan |
| `tag_set` | `{fileId,tagNames,requestId}` | `Tag[]` | Plan, set completo y transacción |
| `duplicates_list` | `{kind?,limit,offset}` | `{groups:DuplicateGroup[],nextOffset}` | Plan; duplicados exactos primero |
| `timeline_list` | `{from?,to?,limit,offset}` | `{items:DetectedDate[],nextOffset}` | Plan; fecha con evidencia/cita |
| `backup_export` | `{destinationFromPicker,includeText,requestId}` | `{backupId,bytes,encrypted,warning}` | Plan; original no incluido |
| `backup_restore` | `{backupFromPicker,requestId}` | `{restoredFiles,version}` | Plan; validar antes de sustituir |
| `privacy_purge_confirmation` | `{scope:'all'|'root',rootId?,requestId}` | `{confirmationToken,expiresAt,summary}` | Plan; token corto de un uso |
| `privacy_purge` | `{scope:'all'|'root',rootId?,confirmationToken,requestId}` | `{filesPurged,chunksPurged,warning}` | Plan; no promete borrado seguro de SSD/snapshots/backups |
| `capabilities_get` | `{}` | disponibilidad de `fts`, `vectors`, `ocr`, modelo y versión | Plan |

`folder_pick` debe usar plugin/diálogo con alcance nativo y registrar la raíz solo después de validar/canonizar; no exponer una opción para el frontend de pasar `path` libremente. Comandos de backup reciben solo un resultado de selector de sistema validado. Un `requestId` duplicado de operación no debe duplicar purgas: tokens de confirmación consumibles e idempotencia local en jobs.

## Eventos de trabajo objetivo

Canal Tauri `index://job-progress` con payload:

```json
{
  "requestId": "7f4f5eb0-df5c-43a8-9157-a81c4e105998",
  "job": {
    "id": 311, "rootId": 2, "fileId": null, "state": "running",
    "stage": "extract", "progress": 0.4, "completedItems": 4,
    "totalItems": 10, "errorCode": null
  }
}
```

Eventos terminales: `done`, `error`, `cancelled`; payload safe con `errorCode`, sin texto del documento/ruta. La UI elimina listeners al desmontar y consulta estado persistido si recupera ventana. `notify` watcher puede agrupar eventos; UI recibe progreso de jobs, no un evento por cada cambio bruto.

## Errores y errores de cita

```json
{
  "code": "LIMIT_EXCEEDED",
  "message": "El documento supera el límite de 100 MiB y no se ha indexado.",
  "retryable": false,
  "requestId": "7f4f5eb0-df5c-43a8-9157-a81c4e105998",
  "details": {"limitName":"fileBytes","max":104857600}
}
```

`NOT_FOUND` para ID inexistente; `OUTSIDE_REGISTERED_ROOT` para intento de escapar permisos; `SOURCE_UNAVAILABLE` cuando se retiene el extracto pero el original no es accesible; `MODEL_UNAVAILABLE` solo para consulta explícitamente semántica (modo `auto` se degrada); `CANCELLED` y `INDEX_PAUSED` son estados recuperables. El backend no debe devolver fragmentos en un error general.

Citas se validan contra texto normalizado persistido antes de responder. El identificador de chunk debe pertenecer al fileId; offset debe caer dentro de texto, y `page` debe coincidir con metadata del extractor. Para DOCX, page siempre nulo. El frontend puede truncar el excerpt visualmente, pero conserva localizador e ID completos para abrir/resaltar.

## Compatibilidad y versionado

Contrato IPC se versiona con app; no es estable entre versiones arbitrarias. Cambios aditivos preferibles, pruebas serializadas de tipos TS/Rust y compatibilidad base de datos mediante migraciones `user_version`. Si se cambia `SearchHit` o semántica de purge, actualizar frontend, docs y pruebas en el mismo cambio. No presentar los payloads marcados “Plan” como comandos disponibles en la release actual.

## Contrato actual comprobado y diferencias

`search`: payload `{"query":"electricidad"}`, máximo 512 bytes UTF-8, hasta 30 resultados. Respuesta `SearchHit[]` con id (archivo), title, path, page nullable, locator, excerpt, score, tags, mime. Rust FTS token completo AND; browser demo parcial OR con stopwords y fixtures diferentes. Errores actuales son String, no ApiError aún. No guarda historial de consultas. El estado native `{"files":3,"mode":"demo"}`.

`demo_load` no tiene payload; retorna nuevos archivos insertados: 3 primera vez, 0 si ya cargada. Browser informa tamaño conjunto. `document_get` usa `{"id":1}` y devuelve primera cita del archivo, no página arbitraria; chunkId y selección de cita se añadirán antes de documentos multichunk. `index_clear` borra archivos y derivados de demo, jobs, tags y grupos; conserva ajustes, raíces y auditoría. No es purga global de privacidad ni limpieza de cachés: `privacy_purge` es futuro.
