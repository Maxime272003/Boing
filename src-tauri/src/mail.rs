//! Envoi des candidatures par e-mail (SMTP), toujours déclenché par l'utilisatrice.

use crate::error::{AppError, AppResult};
use base64::Engine;
use lettre::message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SmtpSettings {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub from_name: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MailAttachment {
    pub filename: String,
    pub content_base64: String,
    pub mime: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingMail {
    pub to: String,
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub attachments: Vec<MailAttachment>,
}

pub fn build_message(smtp: &SmtpSettings, mail: &OutgoingMail) -> AppResult<Message> {
    let from: Mailbox = match &smtp.from_name {
        Some(n) if !n.trim().is_empty() => format!("{} <{}>", n.trim(), smtp.username.trim()),
        _ => smtp.username.trim().to_string(),
    }
    .parse()
    .map_err(|_| AppError::msg("Adresse d'expédition invalide (Paramètres › Envoi d'e-mails)"))?;
    let to: Mailbox = mail
        .to
        .trim()
        .parse()
        .map_err(|_| AppError::msg(format!("Adresse du destinataire invalide : {}", mail.to)))?;

    let mut parts = MultiPart::mixed().singlepart(SinglePart::plain(mail.body.clone()));
    for a in &mail.attachments {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&a.content_base64)
            .map_err(|_| AppError::msg(format!("Pièce jointe illisible : {}", a.filename)))?;
        let ct = ContentType::parse(a.mime.as_deref().unwrap_or("application/pdf"))
            .map_err(|_| AppError::msg("Type de pièce jointe invalide"))?;
        parts = parts.singlepart(Attachment::new(a.filename.clone()).body(bytes, ct));
    }
    Message::builder()
        .from(from)
        .to(to)
        .subject(mail.subject.clone())
        .multipart(parts)
        .map_err(|e| AppError::msg(format!("E-mail invalide : {e}")))
}

pub async fn send(smtp: &SmtpSettings, password: &str, mail: &OutgoingMail) -> AppResult<()> {
    let message = build_message(smtp, mail)?;
    let creds = Credentials::new(smtp.username.trim().to_string(), password.to_string());
    let builder = if smtp.port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp.host)
    }
    .map_err(|e| AppError::msg(format!("Serveur SMTP invalide : {e}")))?;
    let transport = builder.port(smtp.port).credentials(creds).build();
    transport
        .send(message)
        .await
        .map_err(|e| AppError::msg(format!("Envoi impossible : {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn smtp() -> SmtpSettings {
        SmtpSettings { host: "smtp.gmail.com".into(), port: 587, username: "camille@exemple.fr".into(), from_name: Some("Camille Martin".into()) }
    }

    #[test]
    fn builds_mail_with_attachment() {
        let mail = OutgoingMail {
            to: "rh@exemple.fr".into(),
            subject: "Candidature".into(),
            body: "Bonjour".into(),
            attachments: vec![MailAttachment { filename: "CV.pdf".into(), content_base64: "JVBERi0=".into(), mime: None }],
        };
        let m = build_message(&smtp(), &mail).unwrap();
        let raw = String::from_utf8(m.formatted()).unwrap();
        assert!(raw.contains("Subject: Candidature"));
        assert!(raw.contains("filename=\"CV.pdf\""));
        assert!(raw.contains("Camille Martin"));
    }

    #[test]
    fn rejects_bad_recipient() {
        let mail = OutgoingMail { to: "pas-une-adresse".into(), subject: "x".into(), body: "y".into(), attachments: vec![] };
        assert!(build_message(&smtp(), &mail).is_err());
    }
}
