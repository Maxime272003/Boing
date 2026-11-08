//! Récupération des offres d'emploi : France Travail (API officielle) et Adzuna.
//! Les offres sont ramenées à un format commun (`Offer`).

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Criteria {
    /// Métiers ou mots-clés recherchés (une requête par mot-clé).
    pub keywords: Vec<String>,
    /// Code INSEE de la commune (France Travail).
    pub commune_insee: Option<String>,
    /// Nom de la ville (Adzuna).
    pub city: Option<String>,
    pub distance_km: Option<u32>,
    /// Codes France Travail : CDI, CDD, MIS (intérim), SAI (saisonnier)…
    pub contracts: Vec<String>,
    /// Some(true) temps plein, Some(false) temps partiel, None indifférent.
    pub full_time: Option<bool>,
    /// Ne garder que les offres publiées depuis N jours (1, 3, 7, 14 ou 31).
    pub published_since_days: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub id: String,
    pub source: String,
    pub source_id: String,
    pub title: String,
    pub company: String,
    pub location: String,
    pub postal_code: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub contract: Option<String>,
    pub contract_label: Option<String>,
    pub working_time: Option<String>,
    pub salary: Option<String>,
    pub description: String,
    pub url: Option<String>,
    pub apply_email: Option<String>,
    pub apply_url: Option<String>,
    pub published_at: Option<String>,
    pub skills: Vec<String>,
    pub experience: Option<String>,
}

fn s(v: &Value, path: &[&str]) -> Option<String> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    match cur {
        Value::String(x) if !x.trim().is_empty() => Some(x.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn f(v: &Value, path: &[&str]) -> Option<f64> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    cur.as_f64().or_else(|| cur.as_str().and_then(|x| x.parse().ok()))
}

/// Supprime les balises HTML éventuelles (Adzuna en renvoie parfois).
pub fn strip_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for c in input.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&nbsp;", " ")
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
        .trim()
        .to_string()
}

pub fn parse_france_travail(json: &Value) -> Vec<Offer> {
    let items = json.get("resultats").and_then(|r| r.as_array()).cloned().unwrap_or_default();
    items
        .iter()
        .filter_map(|o| {
            let source_id = s(o, &["id"])?;
            let title = s(o, &["intitule"])?;
            let skills = o
                .get("competences")
                .and_then(|c| c.as_array())
                .map(|a| a.iter().filter_map(|c| s(c, &["libelle"])).collect())
                .unwrap_or_default();
            Some(Offer {
                id: format!("ft-{source_id}"),
                source: "France Travail".into(),
                url: s(o, &["origineOffre", "urlOrigine"]).or_else(|| {
                    Some(format!(
                        "https://candidat.francetravail.fr/offres/recherche/detail/{source_id}"
                    ))
                }),
                source_id,
                title,
                company: s(o, &["entreprise", "nom"]).unwrap_or_else(|| "Entreprise non communiquée".into()),
                location: s(o, &["lieuTravail", "libelle"]).unwrap_or_default(),
                postal_code: s(o, &["lieuTravail", "codePostal"]),
                latitude: f(o, &["lieuTravail", "latitude"]),
                longitude: f(o, &["lieuTravail", "longitude"]),
                contract: s(o, &["typeContrat"]),
                contract_label: s(o, &["typeContratLibelle"]),
                working_time: s(o, &["dureeTravailLibelleConverti"]).or_else(|| s(o, &["dureeTravailLibelle"])),
                salary: s(o, &["salaire", "libelle"]),
                description: s(o, &["description"]).unwrap_or_default(),
                apply_email: s(o, &["contact", "courriel"]).filter(|e| e.contains('@')),
                apply_url: s(o, &["contact", "urlPostulation"]),
                published_at: s(o, &["dateCreation"]),
                skills,
                experience: s(o, &["experienceLibelle"]),
            })
        })
        .collect()
}

pub fn parse_adzuna(json: &Value) -> Vec<Offer> {
    let items = json.get("results").and_then(|r| r.as_array()).cloned().unwrap_or_default();
    items
        .iter()
        .filter_map(|o| {
            let source_id = s(o, &["id"])?;
            let title = strip_html(&s(o, &["title"])?);
            let contract = match (s(o, &["contract_type"]).as_deref(), s(o, &["contract_time"]).as_deref()) {
                (Some("permanent"), _) => Some("CDI".to_string()),
                (Some("contract"), _) => Some("CDD".to_string()),
                _ => None,
            };
            let salary = match (f(o, &["salary_min"]), f(o, &["salary_max"])) {
                (Some(a), Some(b)) if a > 0.0 => Some(format!("{:.0} – {:.0} € / an", a, b)),
                _ => None,
            };
            Some(Offer {
                id: format!("az-{source_id}"),
                source: "Adzuna".into(),
                source_id,
                title,
                company: s(o, &["company", "display_name"]).unwrap_or_else(|| "Entreprise non communiquée".into()),
                location: s(o, &["location", "display_name"]).unwrap_or_default(),
                postal_code: None,
                latitude: f(o, &["latitude"]),
                longitude: f(o, &["longitude"]),
                contract_label: contract.clone(),
                contract,
                working_time: match s(o, &["contract_time"]).as_deref() {
                    Some("full_time") => Some("Temps plein".into()),
                    Some("part_time") => Some("Temps partiel".into()),
                    _ => None,
                },
                salary,
                description: strip_html(&s(o, &["description"]).unwrap_or_default()),
                url: s(o, &["redirect_url"]),
                apply_email: None,
                apply_url: s(o, &["redirect_url"]),
                published_at: s(o, &["created"]),
                skills: vec![],
                experience: None,
            })
        })
        .collect()
}

fn dedupe(offers: Vec<Offer>) -> Vec<Offer> {
    let mut seen = HashSet::new();
    offers.into_iter().filter(|o| seen.insert(o.id.clone())).collect()
}

const FT_TOKEN_URL: &str =
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const FT_SEARCH_URL: &str = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";

async fn france_travail_token(client: &reqwest::Client, id: &str, secret: &str) -> AppResult<String> {
    let res = client
        .post(FT_TOKEN_URL)
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_id", id),
            ("client_secret", secret),
            ("scope", "api_offresdemploiv2 o2dsoffre"),
        ])
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(AppError::msg(format!(
            "France Travail a refusé les identifiants ({}). Vérifie-les dans Paramètres.",
            res.status()
        )));
    }
    let body: Value = res.json().await?;
    s(&body, &["access_token"]).ok_or_else(|| AppError::msg("Jeton France Travail absent"))
}

pub fn france_travail_query(c: &Criteria, keyword: &str) -> Vec<(String, String)> {
    let mut q = vec![("motsCles".to_string(), keyword.to_string()), ("range".into(), "0-49".into())];
    if let Some(code) = &c.commune_insee {
        q.push(("commune".into(), code.clone()));
        q.push(("distance".into(), c.distance_km.unwrap_or(30).to_string()));
    }
    let contracts: Vec<&str> = c
        .contracts
        .iter()
        .map(|x| x.as_str())
        .filter(|x| ["CDI", "CDD", "MIS", "SAI", "LIB", "FRA"].contains(x))
        .collect();
    if !contracts.is_empty() {
        q.push(("typeContrat".into(), contracts.join(",")));
    }
    if let Some(ft) = c.full_time {
        q.push(("tempsPlein".into(), ft.to_string()));
    }
    if let Some(d) = c.published_since_days {
        let allowed = [1, 3, 7, 14, 31];
        let d = *allowed.iter().find(|a| **a >= d).unwrap_or(&31);
        q.push(("publieeDepuis".into(), d.to_string()));
    }
    q
}

pub async fn fetch_france_travail(client: &reqwest::Client, id: &str, secret: &str, c: &Criteria) -> AppResult<Vec<Offer>> {
    let token = france_travail_token(client, id, secret).await?;
    let mut all = Vec::new();
    for kw in c.keywords.iter().filter(|k| !k.trim().is_empty()) {
        let res = client
            .get(FT_SEARCH_URL)
            .bearer_auth(&token)
            .query(&france_travail_query(c, kw))
            .send()
            .await?;
        // 204 = aucun résultat, 206 = résultats partiels (normal)
        if res.status().as_u16() == 204 {
            continue;
        }
        if !res.status().is_success() {
            return Err(AppError::msg(format!("France Travail : erreur {} pour « {kw} »", res.status())));
        }
        let body: Value = res.json().await?;
        all.extend(parse_france_travail(&body));
    }
    Ok(dedupe(all))
}

pub async fn fetch_adzuna(client: &reqwest::Client, app_id: &str, app_key: &str, c: &Criteria) -> AppResult<Vec<Offer>> {
    let mut all = Vec::new();
    for kw in c.keywords.iter().filter(|k| !k.trim().is_empty()) {
        let mut q: Vec<(String, String)> = vec![
            ("app_id".into(), app_id.into()),
            ("app_key".into(), app_key.into()),
            ("what".into(), kw.clone()),
            ("results_per_page".into(), "50".into()),
            ("content-type".into(), "application/json".into()),
        ];
        if let Some(city) = &c.city {
            q.push(("where".into(), city.clone()));
            q.push(("distance".into(), c.distance_km.unwrap_or(30).to_string()));
        }
        if c.contracts.len() == 1 && c.contracts[0] == "CDI" {
            q.push(("permanent".into(), "1".into()));
        }
        match c.full_time {
            Some(true) => q.push(("full_time".into(), "1".into())),
            Some(false) => q.push(("part_time".into(), "1".into())),
            None => {}
        }
        if let Some(d) = c.published_since_days {
            q.push(("max_days_old".into(), d.to_string()));
        }
        let res = client
            .get("https://api.adzuna.com/v1/api/jobs/fr/search/1")
            .query(&q)
            .send()
            .await?;
        if !res.status().is_success() {
            return Err(AppError::msg(format!("Adzuna : erreur {} pour « {kw} »", res.status())));
        }
        let body: Value = res.json().await?;
        all.extend(parse_adzuna(&body));
    }
    Ok(dedupe(all))
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Commune {
    pub name: String,
    pub insee: String,
    pub postal_code: Option<String>,
    pub department: Option<String>,
}

pub fn parse_communes(json: &Value) -> Vec<Commune> {
    json.as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|c| {
            Some(Commune {
                name: s(c, &["nom"])?,
                insee: s(c, &["code"])?,
                postal_code: c.get("codesPostaux").and_then(|p| p.get(0)).and_then(|p| p.as_str()).map(String::from),
                department: s(c, &["codeDepartement"]),
            })
        })
        .collect()
}

/// Recherche de communes françaises (API publique geo.api.gouv.fr).
pub async fn search_communes(client: &reqwest::Client, query: &str) -> AppResult<Vec<Commune>> {
    let q = query.trim();
    if q.len() < 2 {
        return Ok(vec![]);
    }
    let res = client
        .get("https://geo.api.gouv.fr/communes")
        .query(&[
            ("nom", q),
            ("fields", "nom,code,codesPostaux,codeDepartement"),
            ("boost", "population"),
            ("limit", "8"),
        ])
        .send()
        .await?;
    let body: Value = res.json().await?;
    Ok(parse_communes(&body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_france_travail() {
        let body = json!({"resultats": [{
            "id": "178KQZX",
            "intitule": "Assistant administratif / Assistante administrative (H/F)",
            "description": "Accueil physique et téléphonique...",
            "dateCreation": "2026-11-08T07:12:00.000Z",
            "lieuTravail": {"libelle": "69 - LYON 03", "codePostal": "69003", "latitude": 45.75, "longitude": 4.85},
            "entreprise": {"nom": "CABINET VAUBAN"},
            "typeContrat": "CDI",
            "typeContratLibelle": "Contrat à durée indéterminée",
            "dureeTravailLibelleConverti": "Temps plein",
            "salaire": {"libelle": "Annuel de 24000 Euros à 27000 Euros"},
            "contact": {"courriel": "recrutement@exemple.fr"},
            "competences": [{"libelle": "Gérer un agenda"}, {"libelle": "Facturation"}],
            "experienceLibelle": "3 An(s)"
        }, {"intitule": "sans id"}]});
        let offers = parse_france_travail(&body);
        assert_eq!(offers.len(), 1);
        let o = &offers[0];
        assert_eq!(o.id, "ft-178KQZX");
        assert_eq!(o.company, "CABINET VAUBAN");
        assert_eq!(o.apply_email.as_deref(), Some("recrutement@exemple.fr"));
        assert_eq!(o.skills, vec!["Gérer un agenda", "Facturation"]);
        assert_eq!(o.working_time.as_deref(), Some("Temps plein"));
        assert!(o.url.as_deref().unwrap().contains("178KQZX"));
    }

    #[test]
    fn parses_adzuna() {
        let body = json!({"results": [{
            "id": "4455", "title": "<strong>Chargée</strong> d'accueil",
            "company": {"display_name": "Clinique"}, "location": {"display_name": "Villeurbanne, Rhône"},
            "contract_type": "permanent", "contract_time": "full_time",
            "salary_min": 22000, "salary_max": 24000,
            "description": "Accueil &amp; standard", "redirect_url": "https://www.adzuna.fr/land/ad/4455",
            "created": "2026-11-07T10:00:00Z"
        }]});
        let offers = parse_adzuna(&body);
        assert_eq!(offers[0].title, "Chargée d'accueil");
        assert_eq!(offers[0].contract.as_deref(), Some("CDI"));
        assert_eq!(offers[0].description, "Accueil & standard");
        assert_eq!(offers[0].salary.as_deref(), Some("22000 – 24000 € / an"));
    }

    #[test]
    fn builds_france_travail_query() {
        let c = Criteria {
            keywords: vec!["assistante".into()],
            commune_insee: Some("69123".into()),
            distance_km: Some(30),
            contracts: vec!["CDI".into(), "CDD".into(), "XXX".into()],
            full_time: Some(true),
            published_since_days: Some(5),
            ..Default::default()
        };
        let q = france_travail_query(&c, "assistante");
        let get = |k: &str| q.iter().find(|(a, _)| a == k).map(|(_, b)| b.clone());
        assert_eq!(get("commune").as_deref(), Some("69123"));
        assert_eq!(get("typeContrat").as_deref(), Some("CDI,CDD"));
        assert_eq!(get("publieeDepuis").as_deref(), Some("7"));
        assert_eq!(get("tempsPlein").as_deref(), Some("true"));
    }

    #[test]
    fn parses_communes() {
        let body = json!([{"nom": "Lyon", "code": "69123", "codesPostaux": ["69001", "69002"], "codeDepartement": "69"}]);
        let c = parse_communes(&body);
        assert_eq!(c[0].insee, "69123");
        assert_eq!(c[0].postal_code.as_deref(), Some("69001"));
    }

    #[test]
    fn dedupes_offers() {
        let a = Offer { id: "ft-1".into(), ..Default::default() };
        assert_eq!(dedupe(vec![a.clone(), a]).len(), 1);
    }
}
