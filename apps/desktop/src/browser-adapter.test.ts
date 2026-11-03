import { describe, expect, it } from 'vitest';
import { createBrowserAdapter } from './browser-adapter';
describe('demo aislada del navegador', () => {
  it('carga exactamente tres documentos de ejemplo', async () => {
    const api = createBrowserAdapter();
    expect(await api.demoLoad()).toBe(3);
    expect(await api.indexStatus()).toEqual({files:3, mode:'browser-demo'});
  });
  it('busca extractos literales y devuelve su cita, sin fabricar respuestas', async () => {
    const api = createBrowserAdapter();
    await api.demoLoad();
    const hits = await api.search('electricidad');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({id:1, page:1, locator:'Página 1'});
    expect(hits[0].excerpt).toContain('42 euros');
    expect(await api.search('inexistente')).toEqual([]);
    expect(await api.search('')).toEqual([]);
  });
  it('borra la demo, resuelve documentos y mantiene instancias aisladas', async () => {
    const api = createBrowserAdapter();
    expect(await api.search('filtro')).toEqual([]);
    expect(await api.documentGet(1)).toBeNull();
    await api.demoLoad();
    expect(await api.documentGet(2)).toMatchObject({page:2});
    expect(await api.search('¿Cuándo limpio el filtro?')).toHaveLength(1);
    expect(await api.documentGet(999)).toBeNull();
    expect(await createBrowserAdapter().indexStatus()).toMatchObject({files:0});
    await api.indexClear();
    expect(await api.indexStatus()).toMatchObject({files:0});
    expect(await api.search('electricidad')).toEqual([]);
    expect(await api.documentGet(2)).toBeNull();
  });
});
