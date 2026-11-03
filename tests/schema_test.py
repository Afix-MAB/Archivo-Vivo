"""Portable schema checks; run with Python stdlib only."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/001_initial.sql"


class SchemaTests(unittest.TestCase):
    def connect(self):
        self.assertTrue(MIGRATION.exists(), "initial migration must exist")
        db = sqlite3.connect(":memory:")
        db.executescript(MIGRATION.read_text())
        self.addCleanup(db.close)
        return db

    def test_schema_runs_without_vector_extension(self):
        db = self.connect()
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        expected = {"roots", "files", "chunks", "embedding_models", "embeddings", "tags", "file_tags", "duplicate_groups", "duplicate_members", "image_hashes", "detected_dates", "settings", "audit", "index_jobs", "chunks_fts"}
        self.assertTrue(expected <= tables, expected - tables)
        self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 1)
        self.assertEqual(db.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_embedding_contract_and_foreign_keys(self):
        db = self.connect()
        db.execute("INSERT INTO files(id,path,title,mime) VALUES(1,'demo/a','A','text/plain')")
        db.execute("INSERT INTO chunks(id,file_id,ordinal,text,locator) VALUES(10,1,0,'texto','página 1')")
        db.execute("INSERT INTO embedding_models(id,name,version) VALUES(1,'planned','v1')")
        self.assertEqual(db.execute('SELECT status FROM embedding_models').fetchone()[0], 'unavailable')
        for vector in (bytes(4), bytes(1535), bytes(1537), 'x' * 1536):
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO embeddings(chunk_id,model_id,vector) VALUES(10,1,?)', (vector,))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO embedding_models(name,version,dimensions) VALUES('bad','v1',768)")
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO chunks(file_id,ordinal,text,locator) VALUES(999,0,'orphan','none')")
        db.execute('INSERT INTO embeddings(chunk_id,model_id,vector) VALUES(10,1,?)', (bytes(1536),))
        db.execute('DELETE FROM files WHERE id=1')
        self.assertEqual(db.execute('SELECT count(*) FROM embeddings').fetchone()[0], 0)
        db.execute("INSERT INTO chunks_fts(chunks_fts,rank) VALUES('integrity-check',1)")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_optional_vec0_ddl_is_separate(self):
        vec = ROOT / "migrations/optional/001_vec0.sql"
        self.assertTrue(vec.exists(), "optional vector DDL must be documented separately")
        sql = vec.read_text()
        self.assertIn("USING vec0", sql)
        self.assertIn("float[384]", sql)
        self.assertNotIn("USING vec0", MIGRATION.read_text())

    def test_fts_tracks_insert_update_delete_and_cascade(self):
        db = self.connect()
        db.execute("INSERT INTO files(id,path,title,mime) VALUES(1,'demo/a','A','text/plain')")
        db.execute("INSERT INTO chunks(id,file_id,ordinal,text,locator) VALUES(10,1,0,'electricidad factura','página 1')")
        def matches(term):
            return db.execute("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?", (term,)).fetchall()
        self.assertEqual(matches('electricidad'), [(10,)])
        db.execute("UPDATE chunks SET text='alquiler contrato' WHERE id=10")
        self.assertEqual(matches('electricidad'), [])
        self.assertEqual(matches('alquiler'), [(10,)])
        db.execute("DELETE FROM files WHERE id=1")
        self.assertEqual(matches('alquiler'), [])
        self.assertEqual(db.execute('SELECT count(*) FROM chunks').fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
