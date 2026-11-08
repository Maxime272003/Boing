//! Boing — côté Rust : stockage local, coffre de clés, réseau (offres, Claude, SMTP), fichiers.

mod claude;
mod db;
mod error;
mod mail;
mod secrets;
mod sources;

use base64::Engine;
use db::Db;
use error::{AppError, AppResult};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::Manager;

pub struct AppState {
    db: Db,
    http: reqwest::Client,
    data_dir: PathBuf,
}

// ---------- Stockage ----------

#[tauri::command]
fn db_list(state: tauri::State<AppState>, collection: String) -> AppResult<Vec<Value>> {
    state.db.list(&collection)
}

#[tauri::command]
fn db_get(state: tauri::State<AppState>, collection: String, id: String) -> AppResult<Option<Value>> {
    state.db.get(&collection, &id)
}

#[tauri::command]
fn db_put(state: tauri::State<AppState>, collection: String, id: String, data: Value) -> AppResult<Value> {
    state.db.put(&collection, &id, data)
}

#[tauri::command]
fn db_insert_new(state: tauri::State<AppState>, collection: String, docs: Vec<Value>) -> AppResult<usize> {
    state.db.insert_new(&collection, docs)
}

#[tauri::command]
fn db_delete(state: tauri::State<AppState>, collection: String, id: String) -> AppResult<()> {
    state.db.delete(&collection, &id)
}

#[tauri::command]
fn backup_export(state: tauri::State<AppState>, path: String) -> AppResult<()> {
    let dump = state.db.export_all()?;
    std::fs::write(path, serde_json::to_vec_pretty(&dump)?)?;
    Ok(())
}

#[tauri::command]
fn backup_import(state: tauri::State<AppState>, path: String) -> AppResult<usize> {
    let raw = std::fs::read(path)?;
    let data: Value = serde_json::from_slice(&raw)?;
    state.db.import_all(&data)
}

#[tauri::command]
fn data_wipe(state: tauri::State<AppState>) -> AppResult<()> {
    state.db.clear_all()?;
    for name in secrets::SECRET_NAMES {
        let _ = secrets::delete(name);
    }
    Ok(())
}

#[tauri::command]
fn data_dir(state: tauri::State<AppState>) -> String {
    state.data_dir.display().to_string()
}

// ---------- Secrets ----------

#[tauri::command]
fn secret_set(name: String, value: String) -> AppResult<()> {
    secrets::set(&name, &value)
}

#[tauri::command]
fn secret_status() -> BTreeMap<String, bool> {
    secrets::status()
}

// ---------- Offres ----------

#[tauri::command]
async fn search_communes(state: tauri::State<'_, AppState>, query: String) -> AppResult<Vec<sources::Commune>> {
    sources::search_communes(&state.http, &query).await
}

#[tauri::command]
async fn fetch_offers(
    state: tauri::State<'_, AppState>,
    source: String,
    criteria: sources::Criteria,
) -> AppResult<Vec<sources::Offer>> {
    match source.as_str() {
        "france_travail" => {
            let id = secrets::require("ft_client_id", "Identifiant France Travail")?;
            let secret = secrets::require("ft_client_secret", "Clé secrète France Travail")?;
            sources::fetch_france_travail(&state.http, &id, &secret, &criteria).await
        }
        "adzuna" => {
            let id = secrets::require("adzuna_app_id", "App ID Adzuna")?;
            let key = secrets::require("adzuna_app_key", "App Key Adzuna")?;
            sources::fetch_adzuna(&state.http, &id, &key, &criteria).await
        }
        other => Err(AppError::msg(format!("Source inconnue : {other}"))),
    }
}

// ---------- Claude ----------

#[tauri::command]
async fn claude_complete(
    state: tauri::State<'_, AppState>,
    request: claude::CompletionRequest,
) -> AppResult<claude::Completion> {
    let key = secrets::require("claude_api_key", "Clé API Claude")?;
    claude::complete(&state.http, &key, &request).await
}

// ---------- E-mail ----------

#[tauri::command]
async fn send_mail(smtp: mail::SmtpSettings, mail: mail::OutgoingMail) -> AppResult<()> {
    let password = secrets::require("smtp_password", "Mot de passe d'application")?;
    mail::send(&smtp, &password, &mail).await
}

// ---------- Fichiers ----------

fn safe_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || "-_. ".contains(c) { c } else { '_' })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() { "document.pdf".into() } else { cleaned }
}

/// Enregistre un document généré (CV, lettre) dans le dossier de l'app et renvoie son chemin.
#[tauri::command]
fn save_document(state: tauri::State<AppState>, folder: String, filename: String, content_base64: String) -> AppResult<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(content_base64)
        .map_err(|_| AppError::msg("Contenu du document illisible"))?;
    let dir = state.data_dir.join("documents").join(safe_filename(&folder));
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(safe_filename(&filename));
    std::fs::write(&path, bytes)?;
    Ok(path.display().to_string())
}

/// Copie un fichier choisi par l'utilisatrice (ex. son CV) et renvoie son contenu en base64.
#[tauri::command]
fn read_file_base64(path: String) -> AppResult<String> {
    let bytes = std::fs::read(path)?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err(AppError::msg("Fichier trop gros (20 Mo maximum)"));
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("boing.db"))?;
            let http = reqwest::Client::builder()
                .user_agent(concat!("Boing/", env!("CARGO_PKG_VERSION")))
                .timeout(std::time::Duration::from_secs(90))
                .build()?;
            app.manage(AppState { db, http, data_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_list,
            db_get,
            db_put,
            db_insert_new,
            db_delete,
            backup_export,
            backup_import,
            data_wipe,
            data_dir,
            secret_set,
            secret_status,
            search_communes,
            fetch_offers,
            claude_complete,
            send_mail,
            save_document,
            read_file_base64,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Boing");
}

#[cfg(test)]
mod tests {
    use super::safe_filename;

    #[test]
    fn sanitizes_filenames() {
        assert_eq!(safe_filename("../../etc/passwd"), "_.._etc_passwd");
        assert_eq!(safe_filename("CV Camille.pdf"), "CV Camille.pdf");
        assert_eq!(safe_filename(""), "document.pdf");
    }
}
