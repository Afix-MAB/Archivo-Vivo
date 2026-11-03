import { invoke, isTauri } from '@tauri-apps/api/core';
import { createBrowserAdapter } from './browser-adapter';
import type { ArchiveApi, IndexStatus, SearchHit } from './types';
export function createApi(): {api: ArchiveApi; native: boolean} {
  const native = isTauri();
  if (!native) return {api:createBrowserAdapter(),native:false};
  return {native:true,api:{
    demoLoad: () => invoke<number>('demo_load'),
    search: query => invoke<SearchHit[]>('search',{query}),
    documentGet: id => invoke<SearchHit | null>('document_get',{id}),
    indexStatus: () => invoke<IndexStatus>('index_status'),
    indexClear: () => invoke<void>('index_clear'),
  }};
}
