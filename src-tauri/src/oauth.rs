//! Connexion à Gmail ou Outlook (OAuth 2 + PKCE) pour envoyer les candidatures
//! sans mot de passe d'application. Le navigateur s'ouvre, l'utilisatrice se connecte,
//! Google/Microsoft redirige vers un petit serveur local qui récupère le code.

use crate::error::{AppError, AppResult};
use base64::Engine;
use rand::RngCore;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Provider {
    Google,
    Microsoft,
}

impl Provider {
    pub fn parse(s: &str) -> AppResult<Self> {
        match s {
            "gmail" | "google" => Ok(Provider::Google),
            "outlook" | "microsoft" => Ok(Provider::Microsoft),
            _ => Err(AppError::msg(format!("Fournisseur inconnu : {s}"))),
        }
    }
    fn auth_url(self) -> &'static str {
        match self {
            Provider::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            Provider::Microsoft => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        }
    }
    fn token_url(self) -> &'static str {
        match self {
            Provider::Google => "https://oauth2.googleapis.com/token",
            Provider::Microsoft => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        }
    }
    fn scope(self) -> &'static str {
        match self {
            Provider::Google => "https://mail.google.com/",
            Provider::Microsoft => "https://outlook.office.com/SMTP.Send offline_access",
        }
    }
    fn redirect_host(self) -> &'static str {
        // Google accepte l'adresse IP de bouclage, Microsoft attend « localhost ».
        match self {
            Provider::Google => "127.0.0.1",
            Provider::Microsoft => "localhost",
        }
    }
    /// Identifiant d'application fourni au moment de la compilation (secrets du dépôt), à défaut des Paramètres.
    pub fn builtin_client(self) -> (Option<&'static str>, Option<&'static str>) {
        match self {
            Provider::Google => (option_env!("BOING_GOOGLE_CLIENT_ID"), option_env!("BOING_GOOGLE_CLIENT_SECRET")),
            Provider::Microsoft => (option_env!("BOING_MICROSOFT_CLIENT_ID"), None),
        }
    }
}

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn random_token() -> String {
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    b64url(&b)
}

/// PKCE (RFC 7636) : défi S256 calculé à partir du vérificateur.
pub fn pkce_challenge(verifier: &str) -> String {
    b64url(&Sha256::digest(verifier.as_bytes()))
}

pub fn build_auth_url(p: Provider, client_id: &str, redirect_uri: &str, state: &str, challenge: &str) -> String {
    let mut params = vec![
        ("client_id", client_id),
        ("response_type", "code"),
        ("redirect_uri", redirect_uri),
        ("scope", p.scope()),
        ("state", state),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
    ];
    if p == Provider::Google {
        params.push(("access_type", "offline"));
        params.push(("prompt", "consent"));
    }
    let q: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
        .collect();
    format!("{}?{}", p.auth_url(), q.join("&"))
}

#[derive(Debug, PartialEq)]
pub struct Callback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Lit la première ligne de la requête HTTP reçue (« GET /?code=…&state=… HTTP/1.1 »).
pub fn parse_callback(request: &str) -> Option<Callback> {
    let line = request.lines().next()?;
    let target = line.split_whitespace().nth(1)?;
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut cb = Callback { code: None, state: None, error: None };
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = urlencoding::decode(&v.replace('+', " ")).ok()?.into_owned();
        match k {
            "code" => cb.code = Some(v),
            "state" => cb.state = Some(v),
            "error" => cb.error = Some(v),
            _ => {}
        }
    }
    if cb.code.is_none() && cb.error.is_none() {
        return None; // ex. requête de favicon
    }
    Some(cb)
}

const PAGE_OK: &str = "<!doctype html><meta charset=utf-8><title>Boing</title><body style=\"font-family:system-ui;padding:48px\"><h1>C'est bon !</h1><p>Boing est connecté. Tu peux fermer cet onglet et revenir à l'application.</p>";
const PAGE_KO: &str = "<!doctype html><meta charset=utf-8><title>Boing</title><body style=\"font-family:system-ui;padding:48px\"><h1>Connexion annulée</h1><p>Reviens dans Boing pour réessayer.</p>";

pub struct PendingLogin {
    pub url: String,
    listener: TcpListener,
    verifier: String,
    state: String,
    redirect_uri: String,
    provider: Provider,
    client_id: String,
    client_secret: Option<String>,
}

/// Prépare la connexion : serveur local sur un port libre et adresse à ouvrir dans le navigateur.
pub async fn start(p: Provider, client_id: &str, client_secret: Option<&str>) -> AppResult<PendingLogin> {
    if client_id.trim().is_empty() {
        return Err(AppError::msg(
            "Identifiant d'application OAuth manquant : renseigne-le dans Paramètres › Envoi d'e-mails (voir le README).",
        ));
    }
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://{}:{port}/", p.redirect_host());
    let verifier = random_token();
    let state = random_token();
    let url = build_auth_url(p, client_id.trim(), &redirect_uri, &state, &pkce_challenge(&verifier));
    Ok(PendingLogin {
        url,
        listener,
        verifier,
        state,
        redirect_uri,
        provider: p,
        client_id: client_id.trim().to_string(),
        client_secret: client_secret.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
    })
}

/// Attend le retour du navigateur (3 minutes au plus), puis échange le code contre un jeton de rafraîchissement.
pub async fn finish(http: &reqwest::Client, login: PendingLogin) -> AppResult<String> {
    let cb = tokio::time::timeout(Duration::from_secs(180), async {
        loop {
            let (mut sock, _) = login.listener.accept().await?;
            let mut buf = vec![0u8; 8192];
            let n = sock.read(&mut buf).await?;
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            match parse_callback(&req) {
                Some(cb) => {
                    let page = if cb.code.is_some() { PAGE_OK } else { PAGE_KO };
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}",
                        page.len()
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                    return Ok::<Callback, AppError>(cb);
                }
                None => {
                    let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
                }
            }
        }
    })
    .await
    .map_err(|_| AppError::msg("Connexion expirée : reviens dans Paramètres pour réessayer."))??;

    if let Some(err) = cb.error {
        return Err(AppError::msg(format!("Connexion refusée ({err}).")));
    }
    if cb.state.as_deref() != Some(login.state.as_str()) {
        return Err(AppError::msg("Réponse de connexion inattendue (state différent)."));
    }
    let code = cb.code.unwrap_or_default();
    let mut form = vec![
        ("client_id", login.client_id.clone()),
        ("grant_type", "authorization_code".into()),
        ("code", code),
        ("code_verifier", login.verifier.clone()),
        ("redirect_uri", login.redirect_uri.clone()),
    ];
    if let Some(sec) = &login.client_secret {
        form.push(("client_secret", sec.clone()));
    }
    if login.provider == Provider::Microsoft {
        form.push(("scope", login.provider.scope().into()));
    }
    let body: Value = http.post(login.provider.token_url()).form(&form).send().await?.json().await?;
    body.get("refresh_token")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| {
            let msg = body.get("error_description").or(body.get("error")).and_then(|v| v.as_str()).unwrap_or("pas de jeton");
            AppError::msg(format!("Connexion impossible : {msg}"))
        })
}

/// Jeton d'accès frais (valable environ une heure) à partir du jeton de rafraîchissement.
pub async fn access_token(
    http: &reqwest::Client,
    p: Provider,
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> AppResult<String> {
    let mut form = vec![
        ("client_id", client_id.to_string()),
        ("grant_type", "refresh_token".into()),
        ("refresh_token", refresh_token.to_string()),
    ];
    if let Some(sec) = client_secret.filter(|s| !s.is_empty()) {
        form.push(("client_secret", sec.to_string()));
    }
    if p == Provider::Microsoft {
        form.push(("scope", p.scope().into()));
    }
    let body: Value = http.post(p.token_url()).form(&form).send().await?.json().await?;
    body.get("access_token")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| AppError::msg("Connexion à la messagerie expirée : reconnecte-toi dans Paramètres."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_base64url_sha256() {
        // Valeur de référence calculée indépendamment (Python : hashlib.sha256 + urlsafe_b64encode sans « = »).
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mJ92K9fhIIO6KOxrbOGwXcO_ENZ_bE"),
            "ZjdnOLtiggXpM8XvNqe7uNy1P2By99_ByOauOc1TCR8"
        );
        assert_eq!(random_token().len(), 43);
    }

    #[test]
    fn builds_google_url() {
        let url = build_auth_url(Provider::Google, "abc.apps", "http://127.0.0.1:5555/", "st", "ch");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?client_id=abc.apps"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2F"));
        assert!(url.contains("scope=https%3A%2F%2Fmail.google.com%2F"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("access_type=offline"));
    }

    #[test]
    fn builds_microsoft_url() {
        let url = build_auth_url(Provider::Microsoft, "id", "http://localhost:1/", "s", "c");
        assert!(url.contains("SMTP.Send%20offline_access"));
        assert!(!url.contains("access_type"));
    }

    #[test]
    fn parses_callbacks() {
        assert_eq!(
            parse_callback("GET /?code=4%2F0Ab&state=xyz&scope=mail HTTP/1.1\r\nHost: x\r\n"),
            Some(Callback { code: Some("4/0Ab".into()), state: Some("xyz".into()), error: None })
        );
        assert_eq!(parse_callback("GET /?error=access_denied&state=s HTTP/1.1").unwrap().error.as_deref(), Some("access_denied"));
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1"), None);
    }

    #[tokio::test]
    async fn local_server_receives_the_code() {
        let login = start(Provider::Google, "id", None).await.unwrap();
        let port = login.listener.local_addr().unwrap().port();
        let state = login.state.clone();
        // Simule le navigateur qui revient avec le code ; l'échange de jeton échoue ensuite (pas de réseau), c'est attendu.
        let browser = tokio::spawn(async move {
            let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            s.write_all(format!("GET /?code=abc&state={state} HTTP/1.1\r\n\r\n").as_bytes()).await.unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).await.unwrap();
            out
        });
        let http = reqwest::Client::builder().timeout(Duration::from_millis(300)).build().unwrap();
        let _ = finish(&http, login).await;
        assert!(browser.await.unwrap().contains("Boing est connecté"));
    }

    #[tokio::test]
    async fn rejects_wrong_state() {
        let login = start(Provider::Google, "id", None).await.unwrap();
        let port = login.listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            s.write_all(b"GET /?code=abc&state=pirate HTTP/1.1\r\n\r\n").await.unwrap();
        });
        let err = finish(&reqwest::Client::new(), login).await.unwrap_err();
        assert!(err.to_string().contains("state"));
    }
}
