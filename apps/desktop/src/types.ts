export interface SearchHit {
  id: number; title: string; path: string; page: number | null; locator: string;
  excerpt: string; score: number; tags: string[]; mime: string;
}
export interface IndexStatus { files: number; mode: string }
export interface ArchiveApi {
  demoLoad(): Promise<number>;
  search(query: string): Promise<SearchHit[]>;
  documentGet(id: number): Promise<SearchHit | null>;
  indexStatus(): Promise<IndexStatus>;
  indexClear(): Promise<void>;
}
