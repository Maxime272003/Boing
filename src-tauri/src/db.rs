//! Stockage local : une petite base de documents JSON dans SQLite.
//! Chaque document appartient à une collection (profil, offres, candidatures…).

use crate::error::{AppError, AppResult};
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
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
    /// Chiffrement AES-256-GCM de chaque document (la clé vient du coffre du système).
    cipher: Option<Aes256Gcm>,
}

const ENC_PREFIX: &str = "enc1:";
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

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
    /// Ouvre la base. Avec une clé, les documents sont chiffrés, et ceux encore en clair
    /// (anciennes versions) sont chiffrés au passage.
    pub fn open(path: &Path, key: Option<&[u8; 32]>) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        Self::init(conn, key)
    }

    #[allow(dead_code)]
    pub fn open_in_memory(key: Option<&[u8; 32]>) -> AppResult<Self> {
        Self::init(Connection::open_in_memory()?, key)
    }

    pub fn is_encrypted(&self) -> bool {
        self.cipher.is_some()
    }

    fn seal(&self, plain: &str) -> AppResult<String> {
        match &self.cipher {
            None => Ok(plain.to_string()),
            Some(c) => {
                let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
                let ct = c
                    .encrypt(&nonce, plain.as_bytes())
                    .map_err(|_| AppError::msg("Chiffrement impossible"))?;
                let mut out = nonce.to_vec();
                out.extend(ct);
                Ok(format!("{ENC_PREFIX}{}", B64.encode(out)))
            }
        }
    }

    fn open_value(&self, stored: &str) -> AppResult<Value> {
        let Some(b64) = stored.strip_prefix(ENC_PREFIX) else {
            return Ok(serde_json::from_str(stored)?);
        };
        let c = self
            .cipher
            .as_ref()
            .ok_or_else(|| AppError::msg("Données chiffrées mais clé absente du coffre"))?;
        let raw = B64.decode(b64).map_err(|_| AppError::msg("Donnée chiffrée illisible"))?;
        if raw.len() < 12 {
            return Err(AppError::msg("Donnée chiffrée tronquée"));
        }
        let (nonce, ct) = raw.split_at(12);
        let plain = c
            .decrypt(Nonce::from_slice(nonce), ct)
            .map_err(|_| AppError::msg("Déchiffrement impossible : la clé ne correspond pas"))?;
        Ok(serde_json::from_slice(&plain)?)
    }

    fn init(conn: Connection, key: Option<&[u8; 32]>) -> AppResult<Self> {
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
        let cipher = key.map(|k| Aes256Gcm::new_from_slice(k).expect("clé de 32 octets"));
        let db = Self { conn: Mutex::new(conn), cipher };
        db.encrypt_plain_rows()?;
        Ok(db)
    }

    /// Chiffre les documents encore stockés en clair.
    fn encrypt_plain_rows(&self) -> AppResult<usize> {
        if self.cipher.is_none() {
            return Ok(0);
        }
        let rows: Vec<(String, String, String)> = {
            let conn = self.lock();
            let mut stmt = conn.prepare("SELECT collection, id, data FROM docs WHERE data NOT LIKE 'enc1:%'")?;
            let it = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
            it.collect::<Result<_, _>>()?
        };
        let conn = self.lock();
        for (c, id, data) in &rows {
            conn.execute(
                "UPDATE docs SET data = ?1 WHERE collection = ?2 AND id = ?3",
                params![self.seal(data)?, c, id],
            )?;
        }
        Ok(rows.len())
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
            out.push(self.open_value(&row?)?);
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
            Some(s) => Some(self.open_value(&s)?),
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
        let sealed = self.seal(&serde_json::to_string(&data)?)?;
        let conn = self.lock();
        conn.execute(
            "INSERT INTO docs (collection, id, data, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            params![collection, id, sealed, now()],
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
                added += stmt.execute(params![collection, id, self.seal(&serde_json::to_string(&doc)?)?, ts])?;
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
        let db = Db::open_in_memory(None).unwrap();
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
        let db = Db::open_in_memory(None).unwrap();
        db.put("offers", "x", json!({"title": "déjà vue", "hidden": true})).unwrap();
        let n = db
            .insert_new("offers", vec![json!({"id": "x", "title": "nouvelle"}), json!({"id": "y"})])
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(db.get("offers", "x").unwrap().unwrap()["hidden"], true);
    }

    #[test]
    fn rejects_unknown_collection() {
        let db = Db::open_in_memory(None).unwrap();
        assert!(db.list("passwords").is_err());
        assert!(db.put("offers", "a", json!([1, 2])).is_err());
    }

    #[test]
    fn encrypts_documents_at_rest() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.db");
        let key = [7u8; 32];
        {
            let db = Db::open(&path, Some(&key)).unwrap();
            assert!(db.is_encrypted());
            db.put("profile", "me", json!({"name": "Camille", "cv": "texte confidentiel"})).unwrap();
            db.insert_new("offers", vec![json!({"id": "o1", "title": "Assistante"})]).unwrap();
        }
        // Sur le disque : rien de lisible
        let raw: Vec<String> = {
            let conn = Connection::open(&path).unwrap();
            let mut st = conn.prepare("SELECT data FROM docs").unwrap();
            let v = st.query_map([], |r| r.get(0)).unwrap().map(|x| x.unwrap()).collect();
            v
        };
        assert!(raw.iter().all(|d| d.starts_with("enc1:") && !d.contains("Camille") && !d.contains("Assistante")));
        // Avec la bonne clé, tout se relit
        let db = Db::open(&path, Some(&key)).unwrap();
        assert_eq!(db.get("profile", "me").unwrap().unwrap()["cv"], "texte confidentiel");
        assert_eq!(db.list("offers").unwrap().len(), 1);
        // Avec une autre clé : erreur claire, pas de données corrompues renvoyées
        let other = Db::open(&path, Some(&[9u8; 32])).unwrap();
        assert!(other.get("profile", "me").is_err());
    }

    #[test]
    fn migrates_plaintext_rows() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.db");
        Db::open(&path, None).unwrap().put("profile", "me", json!({"name": "Camille"})).unwrap();
        let key = [3u8; 32];
        let db = Db::open(&path, Some(&key)).unwrap();
        assert_eq!(db.get("profile", "me").unwrap().unwrap()["name"], "Camille");
        let conn = Connection::open(&path).unwrap();
        let d: String = conn.query_row("SELECT data FROM docs", [], |r| r.get(0)).unwrap();
        assert!(d.starts_with("enc1:"));
    }

    #[test]
    fn export_import_roundtrip() {
        let db = Db::open_in_memory(None).unwrap();
        db.put("profile", "me", json!({"name": "Camille"})).unwrap();
        db.put("applications", "1", json!({"status": "sent"})).unwrap();
        let dump = db.export_all().unwrap();
        let db2 = Db::open_in_memory(None).unwrap();
        assert_eq!(db2.import_all(&dump).unwrap(), 2);
        assert_eq!(db2.get("profile", "me").unwrap().unwrap()["name"], "Camille");
    }
}
