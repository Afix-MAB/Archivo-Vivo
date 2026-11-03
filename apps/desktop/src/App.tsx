import { useEffect, useRef, useState } from 'react';
import type { ArchiveApi, IndexStatus, SearchHit } from './types';
function ConfirmDialog({onCancel,onConfirm}: {onCancel: () => void; onConfirm: () => void}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = window.document.activeElement as HTMLElement | null; root.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => previous?.focus(); },[]);
  return <div className="modal-backdrop"><div ref={root} className="panel confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab') { event.preventDefault(); const buttons = root.current?.querySelectorAll('button'); if(buttons) buttons[window.document.activeElement === buttons[0] ? 1 : 0].focus(); }
  }}><h2 id="confirm-title">¿Borrar el índice local?</h2><p id="confirm-description">Se eliminarán los extractos indexados. Los archivos originales no se borran. Esta acción no se puede deshacer.</p><div className="button-row"><button onClick={onCancel}>Cancelar</button><button className="danger" onClick={onConfirm}>Sí, borrar índice</button></div></div></div>;
}
type Screen = 'onboarding' | 'buscar' | 'documento' | 'duplicados' | 'ajustes';
const navigation: [Screen, string, string][] = [['onboarding','Inicio','01'],['buscar','Buscar','02'],['documento','Documento','03'],['duplicados','Duplicados','04'],['ajustes','Ajustes','05']];
function Tags({tags}: {tags: string[]}) { return <div className="tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div>; }
function Citation({hit}: {hit: SearchHit}) { return <p className="citation">{hit.title} · {hit.page !== null ? `Página ${hit.page}` : hit.locator || 'Sin localizador'}{hit.page !== null && hit.locator && hit.locator !== `Página ${hit.page}` ? ` · ${hit.locator}` : ''}</p>; }
export function App({api, native}: {api: ArchiveApi; native: boolean}) {
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [status, setStatus] = useState<IndexStatus>({files:0,mode:'—'});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [document, setDocument] = useState<SearchHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { let alive = true; api.indexStatus().then(value => { if(alive) setStatus(value); }).catch(() => { if(alive) setError('No se pudo consultar el índice. Comprueba que la aplicación nativa está disponible.'); }); return () => {alive = false;}; },[api]);
  useEffect(() => { heading.current?.focus(); },[screen]);
  async function loadDemo() {
    setBusy(true); setError('');
    try { await api.demoLoad(); setStatus(await api.indexStatus()); setResults([]); setSearched(false); setDocument(null); setScreen('buscar'); }
    catch { setError('No se pudo cargar la demo. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  async function search(value = query) {
    if (!value.trim()) { setResults([]); setSearched(false); return; }
    setQuery(value); setBusy(true); setError(''); setResults([]); setSearched(false);
    try { setResults(await api.search(value.trim())); setSearched(true); }
    catch { setError('No se pudo completar la búsqueda. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  async function openDocument(id: number) {
    setScreen('documento'); setDocument(null); setBusy(true); setError('');
    try { setDocument(await api.documentGet(id)); }
    catch { setError('No se pudo recuperar el documento. Vuelve a buscar e inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  function requestClear() {
    if (native) { setConfirming(true); return; }
    if (window.confirm('¿Borrar el índice local? Se eliminarán los extractos indexados, no los archivos originales.')) void clearIndex();
  }
  async function clearIndex() {
    setConfirming(false);
    setBusy(true); setError('');
    try { await api.indexClear(); setStatus(await api.indexStatus()); setResults([]); setDocument(null); setSearched(false); setQuery(''); }
    catch { setError('No se pudo borrar el índice. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  const titles: Record<Screen,string> = {onboarding:'Tu archivo. A mano.',buscar:'Encuentra el detalle.',documento:document?.title ?? 'Documento',duplicados:'Menos copias. Más orden.',ajustes:'Tu archivo, tus reglas.'};
  return <div className="app-shell">
    {confirming && <ConfirmDialog onCancel={() => setConfirming(false)} onConfirm={() => void clearIndex()}/> }
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon" aria-hidden="true">AV</span><div>Archivo Vivo<small>Tu archivo local</small></div></div>
      <nav aria-label="Navegación principal">{navigation.map(([id,label,num]) => <button key={id} aria-current={screen === id ? 'page' : undefined} disabled={busy} onClick={() => {setScreen(id); setError('');}}><span aria-hidden="true">{num}</span>{label}</button>)}</nav>
      <div className="sidebar-foot"><span className="local-dot" aria-hidden="true"/>Sin nube<small>{native ? 'Aplicación de escritorio' : 'Vista previa · demo estática'}</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>ESPACIO PERSONAL / {navigation.find(([id]) => id === screen)?.[1]}</span><span className="mode">{native ? 'Local' : 'Demo navegador'} · {status.files} documentos</span></header>
      <main id="contenido" aria-busy={busy}>
        <p className="eyebrow">ARCHIVO VIVO <span>/ {navigation.find(([id]) => id === screen)?.[2]}</span></p>
        <h1 ref={heading} tabIndex={-1}>{titles[screen]}</h1>
        {!native && <p className="preview-note">Vista previa: solo tres documentos ficticios. No se leen archivos personales. La demo vive en memoria y se pierde al recargar.</p>}
        {error && <div role="alert" className="error">{error}</div>}
        {busy && <p role="status" className="loading">Procesando en local…</p>}
        {screen === 'onboarding' && <>
          <p className="lead">Facturas, contratos, manuales. Recupera lo que dicen, con el origen siempre a la vista.</p>
          <div className="onboarding-grid">
            <section className="panel demo-panel"><span className="badge">EMPIEZA AQUÍ</span><h2>Un pequeño archivo de prueba</h2><p>Tres ejemplos para explorar la búsqueda sin añadir tus documentos.</p><ul className="example-list"><li><span aria-hidden="true">01</span> Factura de electricidad <small>42 euros · pág. 1</small></li><li><span aria-hidden="true">02</span> Contrato de alquiler <small>Aviso de 30 días · pág. 2</small></li><li><span aria-hidden="true">03</span> Manual de lavadora <small>Filtro mensual · pág. 3</small></li></ul><button className="primary" disabled={busy} onClick={loadDemo}>Cargar demo</button></section>
            <section className="panel"><span className="badge neutral">PRÓXIMO HITO</span><h2>Tu propia carpeta</h2><p>La importación de archivos personales todavía no está disponible.</p><button disabled>Elegir carpeta · Pendiente</button><p className="fine">No se han solicitado permisos ni seleccionado archivos.</p></section>
          </div>
          <p className="fine privacy-line">Sin cuenta. Sin servicios externos. Extractos, no respuestas generadas.</p>
        </>}
        {screen === 'buscar' && <>
          <p className="lead">Busca una palabra o escribe una pregunta. Verás extractos literales y sus citas, no una respuesta de IA.</p>
          <form className="search-form" onSubmit={event => {event.preventDefault(); void search();}}><label htmlFor="query">Buscar o preguntar en el archivo</label><div><input id="query" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ej. electricidad, aviso de alquiler, filtro" disabled={busy}/><button className="primary" disabled={busy || !query.trim() || status.files === 0}>Buscar extractos</button></div></form>
          <div className="suggestions"><span>Prueba:</span>{['electricidad','aviso alquiler','filtro mensual'].map(value => <button key={value} disabled={busy || status.files === 0} onClick={() => void search(value)}>{value}</button>)}</div>
          {status.files === 0 && !busy && <section className="empty panel"><h2>Tu índice está vacío</h2><p>Carga los ejemplos para empezar. La importación de carpetas está pendiente.</p><button className="primary" onClick={loadDemo}>Cargar demo</button></section>}
          {status.files > 0 && !searched && !busy && !error && <section className="empty"><h2>El detalle está en el documento.</h2><p>Escribe una búsqueda para ver los fragmentos relevantes.</p></section>}
          {searched && !busy && <section aria-label="Resultados"><div className="results-heading"><h2>{results.length} {results.length === 1 ? 'extracto encontrado' : 'extractos encontrados'}</h2><span>Coincidencias de texto</span></div>{results.length === 0 ? <div className="empty panel"><h3>No encontrado</h3><p>No hay extractos para «{query}». Prueba otra palabra; no se ha generado una respuesta.</p></div> : results.map(hit => <article className="result panel" key={hit.id}><div className="result-title"><span className="file-symbol" aria-hidden="true">PDF</span><button className="title-button" onClick={() => void openDocument(hit.id)}>{hit.title}</button></div><blockquote>{hit.excerpt}</blockquote><Citation hit={hit}/><Tags tags={hit.tags}/></article>)}</section>}
        </>}
        {screen === 'documento' && <><button className="back-button" disabled={busy} onClick={() => setScreen('buscar')}>← Volver a buscar</button>{document ? <div className="document-grid"><section className="panel document-excerpt"><span className="badge">EXTRACTO DE ORIGEN</span><blockquote>{document.excerpt}</blockquote><Citation hit={document}/><p className="fine">Se muestra el fragmento indexado, no el documento completo.</p></section><aside className="panel metadata"><h2>Origen</h2><dl><dt>Ruta de referencia</dt><dd>{document.path}</dd><dt>Tipo</dt><dd>{document.mime}</dd></dl><Tags tags={document.tags}/><button disabled>Abrir original · Pendiente</button><p className="fine">Las rutas de demo son referencias ficticias, no archivos que se puedan abrir.</p></aside></div> : !busy && !error && <section className="empty panel"><h2>No hay documento seleccionado</h2><p>Abre un resultado de búsqueda para consultar su extracto y origen.</p></section>}</>}
        {screen === 'duplicados' && <><p className="lead">Un espacio para revisar copias. La detección todavía no se ha implementado.</p><section className="empty panel"><span className="badge neutral">PENDIENTE</span><h2>Detección de duplicados · Pendiente</h2><p>No se ha analizado ningún archivo. Esta pantalla no representa un resultado de escaneo.</p><button disabled>Analizar duplicados · Pendiente</button></section></>}
        {screen === 'ajustes' && <><p className="lead">Sin nube, sin cuenta y sin llamadas a servicios externos.</p><div className="settings-stack"><section className="panel"><h2>Privacidad y almacenamiento</h2><dl className="settings-dl"><dt>Entorno</dt><dd>{native ? 'Escritorio · comandos IPC locales' : 'Navegador · demo estática en memoria'}</dd><dt>Índice</dt><dd>{status.files ? `${status.files} documentos` : 'Índice vacío'}</dd><dt>Modo del índice</dt><dd>{status.mode}</dd><dt>Respuestas generadas</dt><dd>No se usa un LLM. Solo extractos con citas.</dd><dt>Conexión externa</dt><dd>Ninguna</dd></dl></section><section className="panel"><h2>Portabilidad</h2><p>Las copias de seguridad y la exportación aún no están disponibles.</p><div className="button-row"><button disabled>Crear copia de seguridad · Pendiente</button><button disabled>Exportar índice · Pendiente</button></div></section><section className="panel danger-zone"><h2>Borrar el índice</h2><p>Elimina los extractos del índice. No borra los archivos originales. Esta acción requiere confirmación.</p><button className="danger" disabled={busy || status.files === 0} onClick={requestClear}>{native ? 'Borrar índice' : 'Borrar demo'}</button></section></div></>}
      </main>
      <footer><span>Archivo Vivo · Primer hito</span><span>La fuente antes que la respuesta.</span></footer>
    </div>
  </div>;
}
