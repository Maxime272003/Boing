<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { router } from '$lib/router.svelte';
  import { formatTokens } from '$lib/format';
  import type { SecretName, Settings, SmtpSettings, UpdateInfo } from '$lib/types';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';

  // Champs de saisie des secrets : jamais pré-remplis (les valeurs ne quittent pas le coffre).
  let drafts = $state<Record<SecretName, string>>({
    claude_api_key: '',
    ft_client_id: '',
    ft_client_secret: '',
    adzuna_app_id: '',
    adzuna_app_key: '',
    smtp_password: '',
    smtp_oauth_refresh: ''
  });
  let connecting = $state(false);

  async function connectOAuth() {
    if (smtp.provider === 'autre') return;
    connecting = true;
    try {
      await store.saveSettings({ smtp: $state.snapshot(smtp) });
      await store.backend.oauthConnect(smtp.provider, smtp.oauthClientId, smtp.oauthClientSecret);
      store.secrets = { ...store.secrets, ...(await store.backend.secretStatus()) };
      store.toast(`Connecté à ${smtp.provider === 'gmail' ? 'Gmail' : 'Outlook'}`, 'success');
    } catch (e) {
      store.toast(store.errorText(e), 'error');
      connecting = false;
      return;
    }
    connecting = false;
  }
  let smtp = $state<SmtpSettings>(structuredClone($state.snapshot(store.settings.smtp)));
  let s = $state<Settings>(structuredClone($state.snapshot(store.settings)));
  let dataDir = $state('');
  let encrypted = $state(false);
  let version = $state('');
  let update = $state<UpdateInfo | null>(null);
  let checking = $state(false);
  let confirmWipe = $state(false);

  onMount(async () => {
    dataDir = await store.backend.dataDir();
    encrypted = await store.backend.dataEncrypted();
    version = await store.backend.appVersion();
  });

  const PRESETS: Record<SmtpSettings['provider'], { host: string; port: number }> = {
    gmail: { host: 'smtp.gmail.com', port: 587 },
    outlook: { host: 'smtp-mail.outlook.com', port: 587 },
    autre: { host: '', port: 587 }
  };

  async function saveSecrets(names: SecretName[], label: string) {
    try {
      for (const n of names) if (drafts[n].trim()) await store.setSecret(n, drafts[n]);
      for (const n of names) drafts[n] = '';
      store.toast(`${label} enregistrée`, 'success');
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  async function removeSecrets(names: SecretName[]) {
    for (const n of names) await store.setSecret(n, '');
  }

  async function testClaude() {
    try {
      const r = await store.backend.claude({
        model: s.modelFast,
        system: 'Réponds uniquement par le mot OK.',
        messages: [{ role: 'user', content: 'Test de connexion' }],
        maxTokens: 5
      });
      store.toast(r.text ? 'Connexion à Claude réussie' : 'Claude a répondu', 'success');
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  async function saveGeneral() {
    await store.saveSettings({
      modelFast: s.modelFast.trim(),
      modelBest: s.modelBest.trim(),
      monthlyTokenCap: Number(s.monthlyTokenCap) || 0,
      blockOverCap: s.blockOverCap,
      autoAnalyse: s.autoAnalyse,
      maxAutoAnalyse: Number(s.maxAutoAnalyse) || 25,
      fetchEvery: s.fetchEvery,
      archiveAfterDays: Number(s.archiveAfterDays) || 0,
      defaultFollowUpDays: Number(s.defaultFollowUpDays) || 7
    });
    store.toast('Réglages enregistrés', 'success');
  }

  async function saveSmtp() {
    if (smtp.provider === 'autre') smtp.auth = 'password';
    await store.saveSettings({ smtp: $state.snapshot(smtp) });
    if (drafts.smtp_password.trim()) await saveSecrets(['smtp_password'], "Mot de passe d'application");
    else store.toast("Réglages d'envoi enregistrés", 'success');
  }

  async function testMail() {
    try {
      await store.saveSettings({ smtp: $state.snapshot(smtp) });
      await store.backend.sendMail($state.snapshot(smtp), {
        to: smtp.username,
        subject: 'Boing — e-mail de test',
        body: "Si tu lis ce message, l'envoi des candidatures depuis Boing fonctionne.",
        attachments: []
      });
      store.toast(`E-mail de test envoyé à ${smtp.username}`, 'success');
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  async function check() {
    checking = true;
    try {
      update = await store.backend.checkUpdate();
      if (!update) store.toast('Boing est à jour', 'success');
    } catch (e) {
      store.toast(`Vérification impossible : ${store.errorText(e)}`, 'error');
    } finally {
      checking = false;
    }
  }

  async function exportData() {
    try {
      if (await store.backend.exportBackup()) store.toast('Sauvegarde exportée', 'success');
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  async function importData() {
    try {
      const n = await store.backend.importBackup();
      if (n !== null) {
        await store.reload();
        store.toast(`${n} éléments restaurés`, 'success');
      }
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  async function wipe() {
    await store.backend.wipe();
    confirmWipe = false;
    await store.reload();
    router.go('/bienvenue', true);
  }

  const used = $derived(store.settings.usage.inputTokens + store.settings.usage.outputTokens);
  const pct = $derived(store.settings.monthlyTokenCap ? Math.min(100, Math.round((used / store.settings.monthlyTokenCap) * 100)) : 0);
</script>

{#snippet status(ok: boolean)}
  {#if ok}<span class="badge good">● Configurée</span>{:else}<span class="badge muted">○ Non configurée</span>{/if}
{/snippet}

<div class="page">
  <header class="page-head">
    <div>
      <h1>Paramètres</h1>
      <p class="meta">Les clés sont rangées dans le coffre-fort de Windows, jamais dans un fichier ni sur GitHub.</p>
    </div>
  </header>

  <div class="cols">
    <nav class="subnav" aria-label="Sections des paramètres">
      <a href="#cles" onclick={(e) => { e.preventDefault(); document.getElementById('cles')?.scrollIntoView(); }}>Clés API</a>
      <a href="#ia" onclick={(e) => { e.preventDefault(); document.getElementById('ia')?.scrollIntoView(); }}>Claude</a>
      <a href="#mail" onclick={(e) => { e.preventDefault(); document.getElementById('mail')?.scrollIntoView(); }}>Envoi d'e-mails</a>
      <a href="#collecte" onclick={(e) => { e.preventDefault(); document.getElementById('collecte')?.scrollIntoView(); }}>Collecte des offres</a>
      <a href="#donnees" onclick={(e) => { e.preventDefault(); document.getElementById('donnees')?.scrollIntoView(); }}>Données</a>
      <a href="#maj" onclick={(e) => { e.preventDefault(); document.getElementById('maj')?.scrollIntoView(); }}>Mises à jour</a>
    </nav>

    <div class="stack" style="--gap:20px; flex:999 1 520px; min-width:0">
      <section id="cles" class="card stack" style="--gap:18px" aria-labelledby="h-cles">
        <h2 id="h-cles">Clés API</h2>

        <div class="block">
          <div class="spread"><strong>Claude (Anthropic)</strong>{@render status(store.secrets.claude_api_key)}</div>
          <div class="row" style="align-items:flex-end">
            <label class="field grow" style="min-width:260px">Clé API<input class="input" type="password" autocomplete="off" placeholder={store.secrets.claude_api_key ? '•••••••• (enregistrée — saisir pour remplacer)' : 'sk-ant-…'} bind:value={drafts.claude_api_key} /></label>
            <button class="btn" style="height:44px" disabled={!drafts.claude_api_key.trim()} onclick={() => saveSecrets(['claude_api_key'], 'Clé Claude')}>Enregistrer</button>
            <button class="btn" style="height:44px" disabled={!store.secrets.claude_api_key} onclick={testClaude}>Tester</button>
            {#if store.secrets.claude_api_key}<button class="btn ghost" style="height:44px" onclick={() => removeSecrets(['claude_api_key'])}>Retirer</button>{/if}
          </div>
        </div>

        <div class="block">
          <div class="spread"><strong>France Travail</strong>{@render status(store.secrets.ft_client_id && store.secrets.ft_client_secret)}</div>
          <div class="grid2">
            <label class="field">Identifiant client<input class="input" autocomplete="off" placeholder={store.secrets.ft_client_id ? '•••••••• (enregistré)' : 'PAR_…'} bind:value={drafts.ft_client_id} /></label>
            <label class="field">Clé secrète<input class="input" type="password" autocomplete="off" placeholder={store.secrets.ft_client_secret ? '•••••••• (enregistrée)' : ''} bind:value={drafts.ft_client_secret} /></label>
          </div>
          <div class="spread">
            <button class="link" onclick={() => store.backend.openUrl('https://francetravail.io/data/api/offres-emploi')}>Obtenir une clé gratuite sur francetravail.io</button>
            <div class="row">
              {#if store.secrets.ft_client_id}<button class="btn ghost" onclick={() => removeSecrets(['ft_client_id', 'ft_client_secret'])}>Retirer</button>{/if}
              <button class="btn" disabled={!drafts.ft_client_id.trim() && !drafts.ft_client_secret.trim()} onclick={() => saveSecrets(['ft_client_id', 'ft_client_secret'], 'Clé France Travail')}>Enregistrer</button>
            </div>
          </div>
        </div>

        <div class="block last">
          <div class="spread"><strong>Adzuna</strong>{@render status(store.secrets.adzuna_app_id && store.secrets.adzuna_app_key)}</div>
          <div class="grid2">
            <label class="field">App ID<input class="input" autocomplete="off" placeholder={store.secrets.adzuna_app_id ? '•••••••• (enregistré)' : 'ex. 1a2b3c4d'} bind:value={drafts.adzuna_app_id} /></label>
            <label class="field">App Key<input class="input" type="password" autocomplete="off" placeholder={store.secrets.adzuna_app_key ? '•••••••• (enregistrée)' : 'Colle ta clé ici'} bind:value={drafts.adzuna_app_key} /></label>
          </div>
          <div class="spread">
            <button class="link" onclick={() => store.backend.openUrl('https://developer.adzuna.com/')}>Obtenir une clé gratuite sur developer.adzuna.com</button>
            <div class="row">
              {#if store.secrets.adzuna_app_id}<button class="btn ghost" onclick={() => removeSecrets(['adzuna_app_id', 'adzuna_app_key'])}>Retirer</button>{/if}
              <button class="btn" disabled={!drafts.adzuna_app_id.trim() && !drafts.adzuna_app_key.trim()} onclick={() => saveSecrets(['adzuna_app_id', 'adzuna_app_key'], 'Clé Adzuna')}>Enregistrer</button>
            </div>
          </div>
        </div>
      </section>

      <section id="ia" class="card stack" style="--gap:14px" aria-labelledby="h-ia">
        <h2 id="h-ia">Claude</h2>
        <div class="grid2">
          <label class="field">Modèle pour le score (rapide)<input class="input" bind:value={s.modelFast} /></label>
          <label class="field">Modèle pour CV et lettre (précis)<input class="input" bind:value={s.modelBest} /></label>
        </div>
        <div class="stack" style="--gap:8px">
          <div class="spread" style="font-size:13px"><span>Utilisation ce mois-ci : {store.settings.usage.calls} appels{store.settings.usage.cacheReadTokens ? ` · ${formatTokens(store.settings.usage.cacheReadTokens)} tokens relus en cache (10 fois moins chers)` : ''}</span><span><strong>{formatTokens(used)}</strong> tokens sur un plafond de {formatTokens(store.settings.monthlyTokenCap)}</span></div>
          <div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Utilisation du plafond"><div style="width:{pct}%"></div></div>
        </div>
        <div class="grid2">
          <label class="field">Plafond mensuel (tokens)<input class="input" type="number" min="0" step="100000" bind:value={s.monthlyTokenCap} /></label>
          <label class="check" style="align-self:end"><input type="checkbox" bind:checked={s.blockOverCap} />Bloquer les appels au-delà du plafond</label>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn primary" onclick={saveGeneral}>Enregistrer</button></div>
      </section>

      <section id="mail" class="card stack" style="--gap:14px" aria-labelledby="h-mail">
        <div class="spread"><h2 id="h-mail">Envoi d'e-mails</h2>{@render status(store.mailReady)}</div>
        <div class="grid3">
          <label class="field">Messagerie
            <select class="select input" bind:value={smtp.provider} onchange={() => { if (smtp.provider !== 'autre') { smtp.host = PRESETS[smtp.provider].host; smtp.port = PRESETS[smtp.provider].port; } }}>
              <option value="gmail">Gmail</option><option value="outlook">Outlook</option><option value="autre">Autre (SMTP)</option>
            </select>
          </label>
          <label class="field">Adresse<input class="input" type="email" bind:value={smtp.username} placeholder="toi@exemple.fr" /></label>
          <label class="field">Nom affiché<input class="input" bind:value={smtp.fromName} placeholder="Camille Martin" /></label>
          {#if smtp.provider === 'autre'}
            <label class="field">Serveur SMTP<input class="input" bind:value={smtp.host} placeholder="smtp.exemple.fr" /></label>
            <label class="field">Port<input class="input" type="number" bind:value={smtp.port} /></label>
          {/if}
          {#if smtp.auth === 'password' || smtp.provider === 'autre'}
            <label class="field">Mot de passe d'application<input class="input" type="password" autocomplete="off" placeholder={store.secrets.smtp_password ? '•••••••• (enregistré)' : ''} bind:value={drafts.smtp_password} /></label>
          {/if}
        </div>
        {#if smtp.provider !== 'autre'}
          <div class="field">Connexion
            <div class="row" style="font-weight:400" role="radiogroup" aria-label="Mode de connexion">
              <button type="button" role="radio" class="chip" class:on={smtp.auth === 'oauth'} aria-checked={smtp.auth === 'oauth'} onclick={() => (smtp.auth = 'oauth')}>Se connecter avec {smtp.provider === 'gmail' ? 'Google' : 'Microsoft'}</button>
              <button type="button" role="radio" class="chip" class:on={smtp.auth === 'password'} aria-checked={smtp.auth === 'password'} onclick={() => (smtp.auth = 'password')}>Mot de passe d'application</button>
            </div>
          </div>
        {/if}
        {#if smtp.auth === 'oauth' && smtp.provider !== 'autre'}
          <div class="oauth stack" style="--gap:10px">
            <div class="spread">
              <span style="font-size:14px">{#if store.secrets.smtp_oauth_refresh}<span class="badge good">● Compte connecté</span>{:else}Pas encore connecté{/if}</span>
              <div class="row">
                {#if store.secrets.smtp_oauth_refresh}<button class="btn ghost" onclick={() => removeSecrets(['smtp_oauth_refresh'])}>Déconnecter</button>{/if}
                <button class="btn primary" onclick={connectOAuth} disabled={connecting || !smtp.username}>
                  {#if connecting}<span class="spinner"></span>En attente du navigateur…{:else}Se connecter avec {smtp.provider === 'gmail' ? 'Google' : 'Microsoft'}{/if}
                </button>
              </div>
            </div>
            <details>
              <summary class="hint" style="cursor:pointer">Identifiants de l'application (à créer une seule fois, voir le README)</summary>
              <div class="grid2" style="margin-top:10px">
                <label class="field">Identifiant client OAuth<input class="input" autocomplete="off" bind:value={smtp.oauthClientId} placeholder={smtp.provider === 'gmail' ? '….apps.googleusercontent.com' : 'GUID de l’application Azure'} /></label>
                {#if smtp.provider === 'gmail'}<label class="field">Secret client (Google)<input class="input" type="password" autocomplete="off" bind:value={smtp.oauthClientSecret} /></label>{/if}
              </div>
            </details>
          </div>
        {:else}
          <p class="hint">Gmail et Outlook demandent un « mot de passe d'application » (pas ton mot de passe habituel), à créer dans la sécurité de ton compte.</p>
        {/if}
        <div class="spread">
          <button class="btn" onclick={testMail} disabled={!(smtp.auth === 'oauth' ? store.secrets.smtp_oauth_refresh : store.secrets.smtp_password) || !smtp.username}>M'envoyer un e-mail de test</button>
          <button class="btn primary" onclick={saveSmtp}>Enregistrer</button>
        </div>
      </section>

      <section id="collecte" class="card stack" style="--gap:8px" aria-labelledby="h-col">
        <h2 id="h-col">Collecte des offres</h2>
        <label class="spread line">Récupérer les nouvelles offres
          <select class="select input" style="width:auto;height:40px" bind:value={s.fetchEvery}>
            <option value="daily">Une fois par jour</option>
            <option value="4h">Toutes les 4 heures</option>
            <option value="manual">À la main uniquement</option>
          </select>
        </label>
        <label class="spread line">Analyser automatiquement les nouvelles offres avec Claude<input type="checkbox" bind:checked={s.autoAnalyse} style="width:18px;height:18px" /></label>
        <label class="spread line">Nombre maximum d'offres analysées par collecte<input class="input" type="number" min="1" max="200" style="width:100px;height:40px" bind:value={s.maxAutoAnalyse} /></label>
        <label class="spread line">Archiver les offres publiées depuis plus de (jours, 0 = jamais)<input class="input" type="number" min="0" max="365" style="width:100px;height:40px" bind:value={s.archiveAfterDays} /></label>
        <label class="spread line">Délai de relance par défaut (jours)<input class="input" type="number" min="1" max="60" style="width:100px;height:40px" bind:value={s.defaultFollowUpDays} /></label>
        <p class="hint">La collecte se fait quand Boing est ouvert.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn primary" onclick={saveGeneral}>Enregistrer</button></div>
      </section>

      <section id="donnees" class="card stack" style="--gap:12px" aria-labelledby="h-don">
        <h2 id="h-don">Données</h2>
        <div class="spread"><span style="font-size:14px">Dossier : <code>{dataDir}</code></span><button class="btn" onclick={() => store.backend.reveal(dataDir)}>Ouvrir le dossier</button></div>
        {#if encrypted}
          <p class="row" style="--gap:8px;font-size:14px" data-testid="encrypted"><Icon name="lock" size={16} />Profil, offres et candidatures sont chiffrés (AES-256) avec une clé rangée dans le coffre de Windows.</p>
        {/if}
        <p class="hint">La sauvegarde exportée n'est pas chiffrée, pour pouvoir la restaurer sur un autre PC : range-la en lieu sûr.</p>
        <div class="row">
          <button class="btn" onclick={exportData}><Icon name="download" size={16} />Exporter une sauvegarde</button>
          <button class="btn" onclick={importData}><Icon name="upload" size={16} />Restaurer</button>
          <button class="btn danger" onclick={() => (confirmWipe = true)}><Icon name="trash" size={16} />Tout effacer</button>
        </div>
      </section>

      <section id="maj" class="card stack" style="--gap:12px" aria-labelledby="h-maj">
        <h2 id="h-maj">Mises à jour</h2>
        {#if update}
          <div class="banner info"><span class="grow"><strong>Version {update.version} disponible</strong> · tu as la {version}</span><button class="btn primary sm" onclick={() => store.backend.installUpdate()}>Installer et redémarrer</button></div>
        {:else}
          <div class="spread"><span style="font-size:14px">Version installée : <strong>{version}</strong></span><button class="btn" onclick={check} disabled={checking}>{#if checking}<span class="spinner"></span>{/if}Vérifier les mises à jour</button></div>
        {/if}
        <button class="link" onclick={() => store.backend.openUrl('https://github.com/Maxime272003/Boing/releases')}>Voir les nouveautés sur GitHub</button>
      </section>
    </div>
  </div>
</div>

{#if confirmWipe}
  <Modal title="Tout effacer ?" onclose={() => (confirmWipe = false)}>
    <p>Profil, offres, candidatures, réglages et clés seront supprimés de ce PC. Pense à exporter une sauvegarde avant. Cette action est définitive.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirmWipe = false)}>Annuler</button>
      <button class="btn danger" onclick={wipe}>Tout effacer</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  .subnav { flex: 1 1 180px; max-width: 220px; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 28px; }
  .subnav a { display: flex; align-items: center; height: 40px; padding: 0 12px; border-radius: 8px; color: var(--ink-3); text-decoration: none; font-size: 14px; }
  .subnav a:hover { background: var(--hover); color: var(--ink); }
  .block { display: flex; flex-direction: column; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--line-soft); }
  .block.last { border-bottom: 0; padding-bottom: 0; }
  .oauth { border: 1px solid var(--line); border-radius: 10px; padding: 14px; background: var(--side); }
  .bar { height: 8px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
  .bar div { height: 100%; background: var(--accent); }
  .line { font-size: 14px; min-height: 44px; }
  .link { border: 0; background: none; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; font-size: 14px; align-self: flex-start; }
  code { font-size: 13px; background: var(--bg); padding: 2px 6px; border-radius: 4px; }
</style>
