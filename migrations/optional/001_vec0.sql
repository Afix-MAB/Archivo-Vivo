-- OPTIONAL: execute only after the trusted, pinned sqlite-vec extension is loaded.
-- Not part of Store::open / Store::memory and not an automatic migration.
-- Separate table per active model/version; do not mix incompatible embedding spaces.
-- Caller must backfill, delete and refresh rows transactionally with embeddings.
-- No fake vectors, extension download or model inference is performed by this demo.
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors_384 USING vec0(
 chunk_id INTEGER PRIMARY KEY,
 embedding float[384]
);
