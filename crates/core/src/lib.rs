use rusqlite::Connection;

pub struct Store(Connection);

#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchHit {
    /// File ID, never the chunk ID.
    pub id: i64,
    pub title: String,
    pub path: String,
    pub page: Option<i64>,
    pub locator: String,
    pub excerpt: String,
    pub score: f64,
    pub tags: Vec<String>,
    pub mime: String,
}

impl Store {
    pub fn open(path: impl AsRef<std::path::Path>) -> Result<Self, rusqlite::Error> {
        Self::initialize(Connection::open(path)?)
    }

    /// Removes indexed metadata only; never touches source files or settings.
    pub fn clear(&mut self) -> Result<(), rusqlite::Error> {
        let transaction = self.0.transaction()?;
        transaction.execute_batch("DELETE FROM index_jobs; DELETE FROM files; DELETE FROM duplicate_groups; DELETE FROM tags;")?;
        transaction.execute("INSERT INTO audit(action,details) VALUES('clear_index','Índice local borrado; archivos originales intactos')", [])?;
        transaction.commit()
    }

    /// First citation for a file. Demo paths are metadata, not real files.
    pub fn document(&self, id: i64) -> Result<Option<SearchHit>, rusqlite::Error> {
        use rusqlite::OptionalExtension;
        let hit = self
            .0
            .query_row(
                "SELECT f.id,f.title,f.path,c.page,c.locator,substr(c.text,1,1200),0.0,f.mime
             FROM files f JOIN chunks c ON c.file_id=f.id WHERE f.id=?1
             ORDER BY c.ordinal,c.id LIMIT 1",
                [id],
                Self::read_hit,
            )
            .optional()?;
        Ok(self
            .with_tags(hit.into_iter().collect())?
            .into_iter()
            .next())
    }

    /// Literal token conjunction; FTS operators from the user are never executed.
    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>, rusqlite::Error> {
        // Bound bytes before tokenization to avoid unbounded allocations.
        if query.len() > 512 {
            return Err(rusqlite::Error::InvalidParameterName(
                "consulta: máximo 512 bytes".into(),
            ));
        }
        let literal = query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|token| !token.is_empty())
            .map(|token| format!("\"{token}\""))
            .collect::<Vec<_>>()
            .join(" AND ");
        if literal.is_empty() {
            return Ok(Vec::new());
        }
        let mut statement = self.0.prepare(
            "SELECT f.id,f.title,f.path,c.page,c.locator,
             snippet(chunks_fts,0,'','',' … ',32), -bm25(chunks_fts),f.mime
             FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.rowid
             JOIN files f ON f.id=c.file_id WHERE chunks_fts MATCH ?1
             ORDER BY bm25(chunks_fts),f.id,c.ordinal LIMIT 30",
        )?;
        let hits = statement
            .query_map([literal], Self::read_hit)?
            .collect::<Result<Vec<_>, _>>()?;
        self.with_tags(hits)
    }

    fn read_hit(row: &rusqlite::Row<'_>) -> Result<SearchHit, rusqlite::Error> {
        Ok(SearchHit {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            page: row.get(3)?,
            locator: row.get(4)?,
            excerpt: row.get(5)?,
            score: row.get(6)?,
            mime: row.get(7)?,
            tags: Vec::new(),
        })
    }

    fn with_tags(&self, mut hits: Vec<SearchHit>) -> Result<Vec<SearchHit>, rusqlite::Error> {
        let mut tags = self.0.prepare("SELECT t.name FROM tags t JOIN file_tags ft ON ft.tag_id=t.id WHERE ft.file_id=?1 ORDER BY t.name")?;
        for hit in &mut hits {
            hit.tags = tags
                .query_map([hit.id], |r| r.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
        }
        Ok(hits)
    }

    pub fn count(&self) -> Result<i64, rusqlite::Error> {
        self.0
            .query_row("SELECT count(*) FROM files", [], |r| r.get(0))
    }

    pub fn seed_demo(&mut self) -> Result<usize, rusqlite::Error> {
        let transaction = self.0.transaction()?;
        let mut added = 0;
        for (title, path, text, page, tag) in [
            ("Factura de electricidad", "demo/factura-electricidad.pdf", "Factura de electricidad. El total a pagar es 42 euros.", 1, "facturas"),
            ("Contrato de alquiler", "demo/contrato-alquiler.pdf", "Contrato de alquiler. El aviso de terminación debe darse con 30 días de antelación.", 2, "contratos"),
            ("Manual de lavadora", "demo/manual-lavadora.pdf", "Manual de lavadora. Limpie el filtro mensualmente; el mantenimiento del filtro es mensual.", 3, "manuales"),
        ] {
            let inserted = transaction.execute(
                "INSERT OR IGNORE INTO files(path,title,mime,status,indexed_at) VALUES(?1,?2,'application/pdf','indexed',CURRENT_TIMESTAMP)",
                rusqlite::params![path, title],
            )?;
            if inserted == 0 { continue; }
            let file_id = transaction.last_insert_rowid();
            transaction.execute(
                "INSERT INTO chunks(file_id,ordinal,text,page,locator,extraction_method) VALUES(?1,0,?2,?3,?4,'demo')",
                rusqlite::params![file_id, text, page, format!("página {page}")],
            )?;
            transaction.execute("INSERT OR IGNORE INTO tags(name) VALUES(?1)", [tag])?;
            transaction.execute("INSERT INTO file_tags(file_id,tag_id) SELECT ?1,id FROM tags WHERE name=?2", rusqlite::params![file_id, tag])?;
            added += inserted;
        }
        transaction.commit()?;
        Ok(added)
    }
    pub fn memory() -> Result<Self, rusqlite::Error> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(connection: Connection) -> Result<Self, rusqlite::Error> {
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys=ON;")?;
        let version: i64 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        match version {
            0 => connection.execute_batch(include_str!("../../../migrations/001_initial.sql"))?,
            1 => {}
            _ => {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "versión de esquema no compatible: {version}"
                )))
            }
        }
        Ok(Self(connection))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_persists_data_and_rejects_future_versions() {
        let directory = std::env::var_os("TMPDIR")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(|home| std::path::PathBuf::from(home).join(".hermes/cache/scratch"))
            })
            .unwrap_or_else(|| {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-scratch")
            });
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(format!("archivo-core-test-{}.sqlite", std::process::id()));
        let _ = std::fs::remove_file(&path);
        {
            let mut store = Store::open(&path).unwrap();
            assert_eq!(store.count().unwrap(), 0);
            store.seed_demo().unwrap();
        }
        {
            let store = Store::open(&path).unwrap();
            assert_eq!(store.count().unwrap(), 3);
            assert_eq!(store.search("42").unwrap().len(), 1);
            store.0.execute_batch("PRAGMA user_version=99;").unwrap();
        }
        assert!(Store::open(&path).is_err());
        let raw = Connection::open(&path).unwrap();
        let version: i64 = raw
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 99);
        drop(raw);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn clearing_index_removes_citations_not_configuration() {
        let mut store = Store::memory().unwrap();
        store.seed_demo().unwrap();
        store
            .0
            .execute("INSERT INTO settings(key,value) VALUES('theme','dark')", [])
            .unwrap();
        store.clear().unwrap();
        assert_eq!(store.count().unwrap(), 0);
        assert!(store.search("electricidad").unwrap().is_empty());
        assert!(store.document(1).unwrap().is_none());
        let theme: String = store
            .0
            .query_row("SELECT value FROM settings WHERE key='theme'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(theme, "dark");
        store.clear().unwrap();
        assert_eq!(store.seed_demo().unwrap(), 3);
    }

    #[test]
    fn document_uses_file_id_and_first_citation() {
        let mut store = Store::memory().unwrap();
        // Force chunk IDs to diverge from file IDs.
        store
            .0
            .execute(
                "INSERT INTO files(id,path,title,mime) VALUES(100,'demo/temp','Temp','text/plain')",
                [],
            )
            .unwrap();
        store.0.execute("INSERT INTO chunks(id,file_id,ordinal,text,locator) VALUES(900,100,0,'temp','temp')", []).unwrap();
        store.seed_demo().unwrap();
        let hit = store.search("alquiler").unwrap().remove(0);
        let document = store.document(hit.id).unwrap().unwrap();
        assert_eq!(document.id, hit.id);
        assert_eq!(document.page, Some(2));
        assert_eq!(document.tags, ["contratos"]);
        assert!(store.document(-1).unwrap().is_none());
        store.0.execute("INSERT INTO chunks(file_id,ordinal,text,page,locator) VALUES(?1,1,'otra cita',8,'página 8')", [hit.id]).unwrap();
        assert_eq!(store.document(hit.id).unwrap().unwrap().page, Some(2));
    }

    #[test]
    fn search_limits_input_and_results() {
        let mut store = Store::memory().unwrap();
        store.seed_demo().unwrap();
        assert!(store.search(&"a".repeat(513)).is_err());
        for ordinal in 1..40 {
            store.0.execute("INSERT INTO chunks(file_id,ordinal,text,locator) VALUES(1,?1,'electricidad','extra')", [ordinal]).unwrap();
        }
        assert_eq!(store.search("electricidad").unwrap().len(), 30);
    }

    #[test]
    fn search_returns_citations_with_literal_safe_queries() {
        let mut store = Store::memory().unwrap();
        store.seed_demo().unwrap();
        let hits = store.search("electricidad 42").unwrap();
        assert_eq!(hits.len(), 1);
        let hit = &hits[0];
        assert_eq!(hit.title, "Factura de electricidad");
        assert_eq!(hit.page, Some(1));
        assert_eq!(hit.locator, "página 1");
        assert!(hit.path.starts_with("demo/"));
        assert!(hit.excerpt.contains("42 euros"));
        assert_eq!(hit.tags, ["facturas"]);
        assert!(hit.score.is_finite());
        assert_eq!(store.search("\"aviso\" 30 dias").unwrap()[0].page, Some(2));
        assert_eq!(store.search("filtro mensual").unwrap()[0].page, Some(3));
        for query in [
            "",
            "   ",
            "***",
            "\"",
            "OR",
            "electricidad OR alquiler",
            "NEAR(foo)",
            "'; DROP TABLE files;--",
        ] {
            assert!(store.search(query).unwrap().is_empty(), "{query}");
        }
        assert_eq!(store.count().unwrap(), 3);
    }

    #[test]
    fn demo_seeding_adds_three_files_once() {
        let mut store = Store::memory().unwrap();
        assert_eq!(store.count().unwrap(), 0);
        assert_eq!(store.seed_demo().unwrap(), 3);
        assert_eq!(store.seed_demo().unwrap(), 0);
        assert_eq!(store.count().unwrap(), 3);
        let vectors: i64 = store
            .0
            .query_row("SELECT count(*) FROM embeddings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(vectors, 0);
    }

    #[test]
    fn memory_opens_a_versioned_fts_database() {
        let store = Store::memory().unwrap();
        let version: i64 = store
            .0
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 1);
        store.0.prepare("SELECT text FROM chunks_fts").unwrap();
    }
}
