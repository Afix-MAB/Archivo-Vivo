-- Base portable SQLite schema. No sqlite-vec extension is required.
PRAGMA foreign_keys = ON;
BEGIN;
CREATE TABLE IF NOT EXISTS roots (
 id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_indexed_at TEXT
);
CREATE TABLE IF NOT EXISTS files (
 id INTEGER PRIMARY KEY, root_id INTEGER REFERENCES roots(id) ON DELETE CASCADE,
 path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, mime TEXT NOT NULL,
 size_bytes INTEGER CHECK(size_bytes >= 0), modified_at TEXT, sha256 TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','indexed','error','excluded')),
 error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, indexed_at TEXT
);
CREATE INDEX IF NOT EXISTS files_hash ON files(sha256);
CREATE TABLE IF NOT EXISTS chunks (
 id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL CHECK(ordinal >= 0), text TEXT NOT NULL, page INTEGER CHECK(page > 0),
 locator TEXT NOT NULL, extraction_method TEXT NOT NULL DEFAULT 'text',
 content_hash TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(file_id, ordinal)
);
CREATE TABLE IF NOT EXISTS embedding_models (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
 dimensions INTEGER NOT NULL DEFAULT 384 CHECK(dimensions = 384),
 dtype TEXT NOT NULL DEFAULT 'float32' CHECK(dtype = 'float32'),
 status TEXT NOT NULL DEFAULT 'unavailable' CHECK(status IN ('unavailable','ready','retired')),
 model_path TEXT, checksum TEXT, UNIQUE(name, version)
);
CREATE TABLE IF NOT EXISTS embeddings (
 chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
 model_id INTEGER NOT NULL REFERENCES embedding_models(id) ON DELETE CASCADE,
 vector BLOB NOT NULL CHECK(typeof(vector) = 'blob' AND length(vector) = 1536),
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','stale')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(chunk_id, model_id)
);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS file_tags (
 file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY(file_id, tag_id)
);
CREATE TABLE IF NOT EXISTS duplicate_groups (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('exact','image','semantic')),
 fingerprint TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS duplicate_members (
 group_id INTEGER NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
 file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 similarity REAL CHECK(similarity >= 0 AND similarity <= 1), PRIMARY KEY(group_id, file_id)
);
CREATE TABLE IF NOT EXISTS image_hashes (
 file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 page INTEGER NOT NULL DEFAULT 0 CHECK(page >= 0), algorithm TEXT NOT NULL,
 hash BLOB NOT NULL, PRIMARY KEY(file_id, page, algorithm)
);
CREATE TABLE IF NOT EXISTS detected_dates (
 id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 chunk_id INTEGER REFERENCES chunks(id) ON DELETE CASCADE, date TEXT NOT NULL,
 original_text TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'mentioned',
 confidence REAL CHECK(confidence >= 0 AND confidence <= 1)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY, action TEXT NOT NULL, file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
 details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS index_jobs (
 id INTEGER PRIMARY KEY, root_id INTEGER REFERENCES roots(id) ON DELETE CASCADE,
 file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','error','cancelled')),
 stage TEXT NOT NULL DEFAULT 'discovery', progress REAL NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 1),
 error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, finished_at TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
 text, content='chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
 INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
 INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE OF text, id ON chunks BEGIN
 INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
 INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
PRAGMA user_version = 1;
COMMIT;
