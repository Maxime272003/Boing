<p align="center"><img src="assets/app-icon.png" width="96" alt=""></p>

# Boing

**Trouver un travail plus vite.** Boing est une application de bureau (Windows) qui :

1. **récupère les offres d'emploi** selon tes critères (métiers, ville et rayon, contrat, temps de travail) sur **France Travail** et **Adzuna** ;
2. **calcule un score de match** entre ton CV et chaque offre, avec tes points forts, ce qui manque et les mots-clés à mettre en avant (Claude) ;
3. **adapte ton CV et ta lettre de motivation** à chaque offre, modification par modification, **sans jamais rien inventer** ;
4. **envoie la candidature** (depuis l'app par e-mail, via ta messagerie, ou en te guidant sur le site de l'employeur) ;
5. **suit tes candidatures** (à envoyer → envoyée → relancée → entretien → clôturée) et te rappelle de relancer, avec un brouillon prêt.

**Métier et job alimentaire.** En plus du métier visé (ex. concept artist), Boing peut chercher un **job alimentaire** en attendant (vente, caisse, service…). Ces offres sont notées sur la chance d'être prise vite et de tenir le poste avec tes contraintes (horaires, temps partiel), le CV est recentré sur ce qui compte pour le poste (missions trop spécialisées masquées, rien d'inventé) et la lettre est courte et directe. Un filtre « Mon métier / Jobs alimentaires » sépare les offres et les candidatures.

**Mode sombre** automatique, selon le thème de Windows.

Et aussi : doublons entre France Travail et Adzuna fusionnés, offres anciennes archivées, statistiques de suivi (taux de réponse par type d'offre et par source), CV modifiable d'un clic dans l'aperçu, trois modèles de PDF (sobre, moderne, deux colonnes).

Tout est stocké **sur ton PC** (SQLite), **chiffré** (AES-256-GCM) avec une clé rangée dans le **coffre-fort de Windows** (Gestionnaire d'identification), comme les clés API.

## Installer

Télécharge le dernier `Boing_x.y.z_x64-setup.exe` dans les [Releases](https://github.com/Maxime272003/Boing/releases) et lance-le. Les mises à jour arrivent ensuite toutes seules (Paramètres › Mises à jour).

### Les clés à prévoir

| Service | À quoi ça sert | Où l'obtenir |
|---|---|---|
| **Claude** (Anthropic) | Lire le CV, noter les offres, rédiger | [console.anthropic.com](https://console.anthropic.com) |
| **France Travail** | Offres d'emploi (API officielle, gratuite) | [francetravail.io](https://francetravail.io/data/api/offres-emploi) — créer une application avec l'API « Offres d'emploi v2 » |
| **Adzuna** (facultatif) | Offres d'autres sites (gratuit) | [developer.adzuna.com](https://developer.adzuna.com/) |
| **Connexion Gmail / Outlook** ou **mot de passe d'application** (facultatif) | Envoyer les candidatures depuis l'app | Voir « Connexion Gmail / Outlook » plus bas, ou créer un mot de passe d'application dans la sécurité du compte. |

Un plafond mensuel de tokens (Paramètres › Claude) évite les mauvaises surprises.

### Connexion Gmail / Outlook (OAuth)

Plutôt qu'un mot de passe d'application, Boing peut se connecter au compte Google ou Microsoft (le navigateur s'ouvre, on accepte, c'est fini). Il faut pour cela un **identifiant d'application**, à créer une seule fois par le développeur :

- **Google** : [console.cloud.google.com](https://console.cloud.google.com) › API et services › Identifiants › Créer un ID client OAuth › type « Application de bureau ». Ajouter le champ d'application `https://mail.google.com/` à l'écran de consentement. Récupérer l'ID client et le secret client.
- **Microsoft** : [portal.azure.com](https://portal.azure.com) › Inscriptions d'applications › Nouvelle inscription (comptes personnels et professionnels) › Authentification › plateforme « Applications mobiles et de bureau » avec l'URI `http://localhost`. Autorisations : `SMTP.Send` (Office 365 Exchange Online) et `offline_access`. Récupérer l'ID d'application.

Deux façons de les donner à Boing : les saisir dans Paramètres › Envoi d'e-mails › Identifiants de l'application, ou les ajouter aux secrets GitHub (`BOING_GOOGLE_CLIENT_ID`, `BOING_GOOGLE_CLIENT_SECRET`, `BOING_MICROSOFT_CLIENT_ID`) pour qu'ils soient intégrés à l'installeur.

## Comment ça marche

```
src/                     Interface (Svelte 5 + TypeScript)
  pages/                 Les 9 écrans : accueil, offres, détail, CV, lettre, envoi, suivi, documents, paramètres
  lib/ai/                Consignes envoyées à Claude et contrôle de ses réponses
  lib/backend/           Accès au « système » : Tauri en vrai, simulation dans le navigateur
  lib/pdf/               Lecture du CV (pdf.js) et génération des PDF (pdf-lib)
src-tauri/src/           Backend Rust
  db.rs                  Stockage local (SQLite), chiffré AES-256-GCM
  oauth.rs               Connexion Gmail / Outlook (OAuth 2 + PKCE, serveur de redirection local)
  secrets.rs             Coffre de clés du système
  sources.rs             France Travail, Adzuna, recherche de communes
  claude.rs              Appel à l'API Claude (la clé ne quitte jamais Rust)
  mail.rs                Envoi SMTP
```

**Coût et vitesse.** Les consignes et le profil sont mis en cache côté API (identiques d'une offre à l'autre) et les offres sont analysées trois à la fois.

**Offres piégées.** Le texte des offres est traité comme une donnée, jamais comme une consigne. Tout lien, adresse e-mail ou numéro de téléphone qui n'apparaît ni dans le profil ni dans l'offre est signalé dans la lettre et l'e-mail, et l'envoi demande une confirmation.

**Garde-fous sur l'IA.** Claude ne peut proposer que des opérations précises sur le CV (reformuler l'accroche ou une mission, masquer une mission, réordonner les compétences). Le code rejette toute compétence absente de ta fiche profil et toute référence à une expérience qui n'existe pas. Chaque modification s'accepte ou se refuse une par une.

## Développer

Prérequis : [Node 22](https://nodejs.org), [Rust](https://rustup.rs) et, sous Windows, les [prérequis Tauri](https://v2.tauri.app/start/prerequisites/) (WebView2 et Build Tools).

```bash
npm install
npm run tauri dev     # l'application, avec rechargement à chaud
npm run dev           # l'interface seule dans le navigateur, en mode simulé (voir plus bas)
```

### Mode simulé (navigateur)

Hors de Tauri, l'interface utilise un backend simulé : stockage dans le navigateur, offres d'exemple (entreprises fictives) et **un Claude simulé** dont les réponses ont été écrites à la main pour ces offres, dans le format exact demandé à la vraie API. Aucune clé n'est nécessaire (n'importe quelle valeur suffit). C'est ce mode que testent les tests de bout en bout.

### Tests

```bash
npm run check         # types (svelte-check)
npm test              # tests unitaires (Vitest) : moteur IA, garde-fous, PDF
npm run test:e2e      # parcours complets dans un navigateur (Playwright)
cd src-tauri && cargo test   # backend Rust : stockage, parsing des offres, Claude, e-mail
```

Pour Playwright avec le Chrome déjà installé plutôt qu'un Chromium téléchargé : `PW_CHANNEL=chrome npm run test:e2e`.

## Publier une version

1. Changer `version` dans `package.json` (c'est la seule source de vérité).
2. Committer, puis : `git tag v0.2.0 && git push origin v0.2.0`.
3. Le workflow **Release** construit l'installeur Windows, le signe pour les mises à jour et crée la Release GitHub avec `latest.json`.

### Mises à jour automatiques : la clé de signature

Les mises à jour sont signées. La clé publique est dans `src-tauri/tauri.conf.json`. La clé privée ne doit **jamais** être committée : ajoute-la dans GitHub › Settings › Secrets and variables › Actions :

- `TAURI_SIGNING_PRIVATE_KEY` : le contenu du fichier de clé privée ;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : vide si la clé n'a pas de mot de passe.

Pour en générer une nouvelle : `npx tauri signer generate -w ~/.tauri/boing.key` (et remplacer `pubkey` dans `tauri.conf.json`).

## Licence

MIT
