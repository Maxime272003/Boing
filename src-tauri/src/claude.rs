//! Appel à l'API Claude (Anthropic). La clé ne quitte jamais le côté Rust.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub model: String,
    pub system: String,
    pub messages: Vec<Message>,
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub cache_system: Option<bool>,
}

#[derive(Debug, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Completion {
    pub text: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

pub fn build_body(req: &CompletionRequest) -> Value {
    // Consignes en cache : réutilisées d'un appel à l'autre (moins cher, plus rapide).
    let system = if req.cache_system.unwrap_or(false) {
        json!([{ "type": "text", "text": req.system, "cache_control": { "type": "ephemeral" } }])
    } else {
        json!(req.system)
    };
    json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "system": system,
        "messages": req.messages,
    })
}

pub fn parse_response(body: &Value) -> AppResult<Completion> {
    if let Some(err) = body.get("error") {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("erreur inconnue");
        return Err(AppError::msg(format!("Claude : {msg}")));
    }
    let text = body
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    let usage = body.get("usage").cloned().unwrap_or(Value::Null);
    Ok(Completion {
        text,
        input_tokens: usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        output_tokens: usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        cache_read_tokens: usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        cache_write_tokens: usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
    })
}

pub async fn complete(client: &reqwest::Client, api_key: &str, req: &CompletionRequest) -> AppResult<Completion> {
    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&build_body(req))
        .send()
        .await?;
    let status = res.status();
    let body: Value = res.json().await.unwrap_or(Value::Null);
    if status.as_u16() == 401 {
        return Err(AppError::msg("Clé Claude refusée : vérifie-la dans Paramètres."));
    }
    if !status.is_success() && body.get("error").is_none() {
        return Err(AppError::msg(format!("Claude : erreur {status}")));
    }
    parse_response(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_text_and_usage() {
        let body = json!({
            "content": [{"type": "text", "text": "{\"score\":"}, {"type": "text", "text": " 90}"}],
            "usage": {"input_tokens": 1200, "output_tokens": 80, "cache_read_input_tokens": 3000}
        });
        let c = parse_response(&body).unwrap();
        assert_eq!(c.text, "{\"score\": 90}");
        assert_eq!(c.input_tokens, 1200);
        assert_eq!(c.cache_read_tokens, 3000);
    }

    #[test]
    fn surfaces_api_errors() {
        let body = json!({"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}});
        assert!(parse_response(&body).unwrap_err().to_string().contains("Overloaded"));
    }

    #[test]
    fn builds_body() {
        let req = CompletionRequest {
            model: "claude-haiku-5-5".into(),
            system: "sys".into(),
            messages: vec![Message {
                role: "user".into(),
                content: json!([{"type": "text", "text": "profil", "cache_control": {"type": "ephemeral"}}, {"type": "text", "text": "offre"}]),
            }],
            max_tokens: None,
            cache_system: Some(true),
        };
        let b = build_body(&req);
        assert_eq!(b["max_tokens"], 4096);
        assert_eq!(b["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(b["messages"][0]["content"][1]["text"], "offre");
    }
}
