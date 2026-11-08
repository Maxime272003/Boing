//! Stockage local : une petite base de documents JSON dans SQLite.
//! Chaque document appartient à une collection (profil, offres, candidatures…).

use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{Map, Value};
use std::path::Path;
use std::sync::Mutex;

pub const COLLECTIONS: &[&str] = &[
    "profile",
    "settings",
    "searches",
    "offers",
    "analyses",
    "applications",
    "letters",
    "meta",
];

pub struct Db {
    conn: Mutex<Connection>,
}

fn check_collection(c: &str) -> AppResult<()> {
    if COLLECTIONS.contains(&c) {
        Ok(())
    } else {
        Err(AppError::msg(format!("Collection inconnue : {c}")))
    }
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    #[allow(dead_code)]
    pub fn open_in_memory() -> AppResult<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> AppResult<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS docs (
                collection TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (collection, id)
             );
             CREATE INDEX IF NOT EXISTS docs_by_collection ON docs(collection, updated_at DESC);",
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn list(&self, collection: &str) -> AppResult<Vec<Value>> {
        check_collection(collection)?;
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT data FROM docs WHERE collection = ?1 ORDER BY updated_at DESC, id ASC",
        )?;
        let rows = stmt.query_map(params![collection], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row?)?);
        }
        Ok(out)
    }

    pub fn get(&self, collection: &str, id: &str) -> AppResult<Option<Value>> {
        check_collection(collection)?;
        let conn = self.lock();
        let data: Option<String> = conn
            .query_row(
                "SELECT data FROM docs WHERE collection = ?1 AND id = ?2",
                params![collection, id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(match data {
            Some(s) => Some(serde_json::from_str(&s)?),
            None => None,
        })
    }

    /// Enregistre (ou remplace) un document. L'identifiant est recopié dans le champ `id`.
    pub fn put(&self, collection: &str, id: &str, mut data: Value) -> AppResult<Value> {
        check_collection(collection)?;
        if id.trim().is_empty() {
            return Err(AppError::msg("Identifiant vide"));
        }
        if let Value::Object(ref mut m) = data {
            m.insert("id".into(), Value::String(id.to_string()));
        } else {
            return Err(AppError::msg("Un document doit être un objet JSON"));
        }
        let conn = self.lock();
        conn.execute(
            "INSERT INTO docs (collection, id, data, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            params![collection, id, serde_json::to_string(&data)?, now()],
        )?;
        Ok(data)
    }

    /// Ajoute plusieurs documents d'un coup, sans écraser ceux qui existent déjà.
    /// Renvoie le nombre de nouveaux documents.
    pub fn insert_new(&self, collection: &str, docs: Vec<Value>) -> AppResult<usize> {
        check_collection(collection)?;
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let mut added = 0;
        {
            let mut stmt = tx.prepare(
                "INSERT OR IGNORE INTO docs (collection, id, data, updated_at) VALUES (?1, ?2, ?3, ?4)",
            )?;
            let ts = now();
            for doc in docs {
                let id = doc
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| AppError::msg("Document sans id"))?
                    .to_string();
                added += stmt.execute(params![collection, id, serde_json::to_string(&doc)?, ts])?;
            }
        }
        tx.commit()?;
        Ok(added)
    }

    pub fn delete(&self, collection: &str, id: &str) -> AppResult<()> {
        check_collection(collection)?;
        self.lock().execute(
            "DELETE FROM docs WHERE collection = ?1 AND id = ?2",
            params![collection, id],
        )?;
        Ok(())
    }

    pub fn export_all(&self) -> AppResult<Value> {
        let mut out = Map::new();
        for c in COLLECTIONS {
            out.insert((*c).to_string(), Value::Array(self.list(c)?));
        }
        Ok(Value::Object(out))
    }

    pub fn import_all(&self, data: &Value) -> AppResult<usize> {
        let obj = data
            .as_object()
            .ok_or_else(|| AppError::msg("Sauvegarde invalide"))?;
        let mut n = 0;
        for (c, docs) in obj {
            if !COLLECTIONS.contains(&c.as_str()) {
                continue;
            }
            for doc in docs.as_array().cloned().unwrap_or_default() {
                if let Some(id) = doc.get("id").and_then(|v| v.as_str()).map(String::from) {
                    self.put(c, &id, doc)?;
                    n += 1;
                }
            }
        }
        Ok(n)
    }

    pub fn clear_all(&self) -> AppResult<()> {
        self.lock().execute("DELETE FROM docs", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn put_get_list_delete() {
        let db = Db::open_in_memory().unwrap();
        db.put("offers", "a", json!({"title": "Assistante"})).unwrap();
        db.put("offers", "b", json!({"title": "Accueil"})).unwrap();
        assert_eq!(db.list("offers").unwrap().len(), 2);
        let a = db.get("offers", "a").unwrap().unwrap();
        assert_eq!(a["id"], "a");
        assert_eq!(a["title"], "Assistante");
        db.put("offers", "a", json!({"title": "Modifiée"})).unwrap();
        assert_eq!(db.get("offers", "a").unwrap().unwrap()["title"], "Modifiée");
        db.delete("offers", "a").unwrap();
        assert!(db.get("offers", "a").unwrap().is_none());
    }

    #[test]
    fn insert_new_keeps_existing() {
        let db = Db::open_in_memory().unwrap();
        db.put("offers", "x", json!({"title": "déjà vue", "hidden": true})).unwrap();
        let n = db
            .insert_new("offers", vec![json!({"id": "x", "title": "nouvelle"}), json!({"id": "y"})])
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(db.get("offers", "x").unwrap().unwrap()["hidden"], true);
    }

    #[test]
    fn rejects_unknown_collection() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.list("passwords").is_err());
        assert!(db.put("offers", "a", json!([1, 2])).is_err());
    }

    #[test]
    fn export_import_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        db.put("profile", "me", json!({"name": "Camille"})).unwrap();
        db.put("applications", "1", json!({"status": "sent"})).unwrap();
        let dump = db.export_all().unwrap();
        let db2 = Db::open_in_memory().unwrap();
        assert_eq!(db2.import_all(&dump).unwrap(), 2);
        assert_eq!(db2.get("profile", "me").unwrap().unwrap()["name"], "Camille");
    }
}
