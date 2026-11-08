//! Clés API et mots de passe : rangés dans le coffre-fort du système
//! (Gestionnaire d'identification sous Windows). Jamais renvoyés au front.

use crate::error::{AppError, AppResult};
use keyring::Entry;
use std::collections::BTreeMap;

const SERVICE: &str = "app.boing.desktop";

pub const SECRET_NAMES: &[&str] = &[
    "claude_api_key",
    "ft_client_id",
    "ft_client_secret",
    "adzuna_app_id",
    "adzuna_app_key",
    "smtp_password",
];

fn entry(name: &str) -> AppResult<Entry> {
    if !SECRET_NAMES.contains(&name) {
        return Err(AppError::msg(format!("Secret inconnu : {name}")));
    }
    Ok(Entry::new(SERVICE, name)?)
}

pub fn set(name: &str, value: &str) -> AppResult<()> {
    let value = value.trim();
    if value.is_empty() {
        return delete(name);
    }
    entry(name)?.set_password(value)?;
    Ok(())
}

pub fn get(name: &str) -> AppResult<Option<String>> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn require(name: &str, label: &str) -> AppResult<String> {
    get(name)?.ok_or_else(|| AppError::msg(format!("{label} manquante : renseigne-la dans Paramètres.")))
}

pub fn delete(name: &str) -> AppResult<()> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Pour chaque secret : est-il renseigné ? (sans jamais exposer la valeur)
pub fn status() -> BTreeMap<String, bool> {
    SECRET_NAMES
        .iter()
        .map(|n| (n.to_string(), matches!(get(n), Ok(Some(_)))))
        .collect()
}
