use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Msg(String),
    #[error("Base de données : {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Réseau : {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON : {0}")]
    Json(#[from] serde_json::Error),
    #[error("Fichier : {0}")]
    Io(#[from] std::io::Error),
    #[error("Coffre de clés : {0}")]
    Keyring(#[from] keyring::Error),
}

impl AppError {
    pub fn msg(s: impl Into<String>) -> Self {
        AppError::Msg(s.into())
    }
}

// Les erreurs remontent au front sous forme de texte lisible.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
