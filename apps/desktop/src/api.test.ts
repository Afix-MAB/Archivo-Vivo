import { expect, it, vi } from 'vitest';
const core = vi.hoisted(() => ({invoke:vi.fn(),isTauri:vi.fn()}));
vi.mock('@tauri-apps/api/core', () => core);
import { createApi } from './api';
it('usa el contrato IPC en Tauri sin fallback al fallar', async () => {
  core.isTauri.mockReturnValue(true);
  core.invoke.mockResolvedValue(null);
  const {api,native} = createApi();
  expect(native).toBe(true);
  await api.demoLoad(); await api.search('filtro'); await api.documentGet(3); await api.indexStatus(); await api.indexClear();
  expect(core.invoke.mock.calls).toEqual([['demo_load'],['search',{query:'filtro'}],['document_get',{id:3}],['index_status'],['index_clear']]);
  core.invoke.mockRejectedValue(new Error('IPC no disponible'));
  await expect(api.demoLoad()).rejects.toThrow('IPC no disponible');
});
it('elige demo explícita solamente fuera de Tauri', async () => {
  core.isTauri.mockReturnValue(false); core.invoke.mockClear();
  const {api,native} = createApi();
  expect(native).toBe(false); expect(await api.demoLoad()).toBe(3);
  expect(core.invoke).not.toHaveBeenCalled();
});
