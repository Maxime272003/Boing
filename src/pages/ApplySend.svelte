<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { href, router } from '$lib/router.svelte';
  import { addDays, cleanTitle, posteDe } from '$lib/format';
  import { buildFiles, fileNames } from '$lib/documents';
  import { toBase64 } from '$lib/bytes';
  import type { Application, SendMode } from '$lib/types';
  import ApplyHeader from '../components/ApplyHeader.svelte';
  import Icon from '../components/Icon.svelte';

  let { id }: { id: string } = $props();
  const stored = store.applications.find((a) => a.id === id);
  const profile = store.profile!;
  function initial(): Application | null {
    if (!stored) return null;
    const a = structuredClone($state.snapshot(stored)) as Application;
    if (!a.mail.subject) a.mail.subject = `Candidature — ${cleanTitle(a.offer.title)}`;
    if (!a.mail.body) {
      a.mail.body = `Madame, Monsieur,\n\nJe vous adresse ma candidature au poste ${posteDe(a.offer.title)}. Vous trouverez ci-joint mon CV et ma lettre de motivation.\n\nBien cordialement,\n${profile.firstName} ${profile.lastName}\n${profile.phone}`;
    }
    return a;
  }
  let app = $state<Application | null>(initial());
  let sending = $state(false);

  const names = $derived(app ? fileNames(app, profile) : null);
  const smtpReady = $derived(!!store.settings.smtp.username && store.secrets.smtp_password);
  const alreadySent = $derived(app ? app.status !== 'draft' : false);

  const modes: { id: SendMode; title: string; desc: string }[] = [
    { id: 'smtp', title: "Envoyer depuis l'app", desc: 'Envoi par ta boîte mail (SMTP), après ta validation.' },
    { id: 'client', title: 'Ouvrir dans ma messagerie', desc: 'Le mail s’ouvre pré-rempli ; tu joins les 2 PDF (dossier ouvert) et tu envoies.' },
    { id: 'site', title: 'Postuler sur le site', desc: "Pour les offres sans e-mail : formulaire de l'employeur." }
  ];
  const cta: Record<SendMode, string> = {
    smtp: 'Envoyer la candidature',
    client: 'Ouvrir dans ma messagerie',
    site: "C'est envoyé, ajouter au suivi"
  };

  async function persist() {
    if (app) app = structuredClone($state.snapshot(await store.saveApplication(app)));
  }

  async function markSent(label: string) {
    if (!app) return;
    const now = new Date().toISOString();
    app.status = 'sent';
    app.sentAt = now;
    app.followUpAt = app.followUpDays ? addDays(now, app.followUpDays) : undefined;
    app.history.push({ at: now, label });
    await persist();
    store.toast('Candidature ajoutée à ton suivi', 'success');
    router.go('/suivi');
  }

  async function download() {
    if (!app) return;
    const files = await buildFiles(store.backend, app, profile);
    app.files = { cv: files.cvPath, letter: files.letterPath };
    await persist();
    await store.backend.reveal(files.cvPath);
    return files;
  }

  async function submit() {
    if (!app) return;
    sending = true;
    try {
      if (app.mode === 'smtp') {
        const files = await buildFiles(store.backend, app, profile);
        app.files = { cv: files.cvPath, letter: files.letterPath };
        const attachments = [{ filename: files.names.cv, contentBase64: toBase64(files.cvBytes), mime: 'application/pdf' }];
        if (files.letterBytes) attachments.push({ filename: files.names.letter, contentBase64: toBase64(files.letterBytes), mime: 'application/pdf' });
        await store.backend.sendMail($state.snapshot(store.settings.smtp), { to: app.mail.to.trim(), subject: app.mail.subject, body: app.mail.body, attachments });
        await markSent(`Envoyée par e-mail à ${app.mail.to}`);
      } else if (app.mode === 'client') {
        await download();
        const url = `mailto:${encodeURIComponent(app.mail.to.trim())}?subject=${encodeURIComponent(app.mail.subject)}&body=${encodeURIComponent(app.mail.body)}`;
        await store.backend.openUrl(url);
        await markSent('Envoyée depuis ma messagerie');
      } else {
        if (!app.files?.cv) {
          const files = await buildFiles(store.backend, app, profile);
          app.files = { cv: files.cvPath, letter: files.letterPath };
        }
        await markSent("Envoyée sur le site de l'employeur");
      }
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    } finally {
      sending = false;
    }
  }

  const canSubmit = $derived(
    !!app &&
      !sending &&
      (app.mode !== 'smtp' || (smtpReady && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(app.mail.to.trim()))) &&
      (app.mode === 'site' || !!app.mail.to.trim())
  );
</script>

{#if !app || !names}
  <div class="page"><div class="card empty"><h2>Candidature introuvable</h2><a class="btn" href={href('/offres')}>Retour aux offres</a></div></div>
{:else}
  <div class="page">
    <ApplyHeader {app} step="envoi" />

    {#if alreadySent}
      <div class="banner info"><Icon name="check" /><span class="grow">Cette candidature a déjà été envoyée. Tu peux la suivre dans Candidatures.</span><a class="btn sm" href={href('/suivi')}>Voir le suivi</a></div>
    {/if}

    <div class="grid3" role="radiogroup" aria-label="Mode d'envoi">
      {#each modes as m}
        <button type="button" role="radio" aria-checked={app.mode === m.id} class="mode" class:on={app.mode === m.id} onclick={() => { app!.mode = m.id; persist(); }}>
          <strong>{m.title}</strong>
          <span>{m.desc}</span>
        </button>
      {/each}
    </div>

    <div class="cols">
      {#if app.mode !== 'site'}
        <section class="card mail" aria-label="E-mail de candidature">
          <label class="line"><span>À</span><input bind:value={app.mail.to} onblur={persist} placeholder="adresse du recruteur" /></label>
          <label class="line"><span>Objet</span><input bind:value={app.mail.subject} onblur={persist} /></label>
          <label class="sr-only" for="mail-body">Message</label>
          <textarea id="mail-body" class="body" bind:value={app.mail.body} onblur={persist}></textarea>
          <div class="row atts">
            <span class="chip small"><b class="pdf">PDF</b>{names.cv}</span>
            {#if app.letter}<span class="chip small"><b class="pdf">PDF</b>{names.letter}</span>{:else}<span class="meta">Pas de lettre (étape 2 vide)</span>{/if}
          </div>
          {#if app.mode === 'smtp' && !smtpReady}
            <p class="banner warn" style="margin:0 20px 20px">Envoi depuis l'app pas encore configuré. <a href={href('/parametres')}>Régler l'envoi d'e-mails</a></p>
          {/if}
        </section>
      {:else}
        <section class="card stack" style="--gap:14px; flex:999 1 520px">
          <h2>Postuler sur le site de l'employeur</h2>
          <ol class="stack" style="--gap:6px; margin:0; padding-left:20px">
            <li>Enregistre ton CV et ta lettre adaptés.</li>
            <li>Ouvre le formulaire de candidature et joins-les.</li>
            <li>Reviens ici et clique « C'est envoyé » pour suivre la candidature.</li>
          </ol>
          <div class="row">
            <button class="btn" onclick={download}><Icon name="download" size={16} />Enregistrer les PDF</button>
            {#if app.offer.applyUrl || app.offer.url}
              <button class="btn" onclick={() => store.backend.openUrl((app!.offer.applyUrl ?? app!.offer.url)!)}>Ouvrir le formulaire <Icon name="external" size={14} /></button>
            {/if}
          </div>
        </section>
      {/if}

      <aside class="stack" style="--gap:14px; flex:1 1 300px; min-width:0">
        <div class="card stack" style="--gap:8px">
          <h2>Avant d'envoyer</h2>
          <label class="check"><input type="checkbox" bind:checked={app.checks.cv} onchange={persist} />J'ai relu le CV adapté</label>
          <label class="check"><input type="checkbox" bind:checked={app.checks.letter} onchange={persist} />J'ai relu la lettre</label>
          <label class="check"><input type="checkbox" bind:checked={app.checks.company} onchange={persist} />Le nom de l'entreprise est le bon partout</label>
        </div>
        <div class="card stack" style="--gap:10px">
          <label class="check spread"><strong>Me rappeler de relancer</strong><input type="checkbox" checked={!!app.followUpDays} onchange={(e) => { app!.followUpDays = e.currentTarget.checked ? store.settings.defaultFollowUpDays : null; persist(); }} /></label>
          {#if app.followUpDays}
            <select class="select input" aria-label="Délai de relance" bind:value={app.followUpDays} onchange={persist}>
              {#each [5, 7, 10, 14] as d}<option value={d}>Dans {d} jours</option>{/each}
            </select>
            <span class="meta">Claude préparera un brouillon de relance le moment venu.</span>
          {/if}
        </div>
        <button class="btn primary lg" onclick={submit} disabled={!canSubmit}>
          {#if sending}<span class="spinner"></span>{/if}{cta[app.mode]}
        </button>
        <span class="meta" style="text-align:center">La candidature sera ajoutée à ton suivi.</span>
      </aside>
    </div>
  </div>
{/if}

<style>
  .mode { text-align: left; cursor: pointer; color: var(--ink); background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 6px; min-height: 96px; box-shadow: inset 0 0 0 1px transparent; }
  .mode.on { background: var(--accent-soft); border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .mode span { font-size: 13px; color: #52525b; line-height: 1.45; }
  .cols { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .mail { flex: 999 1 520px; min-width: 0; padding: 0; display: flex; flex-direction: column; }
  .line { display: flex; align-items: center; gap: 12px; padding: 0 20px; height: 52px; border-bottom: 1px solid var(--line-soft); font-size: 14px; }
  .line span { width: 56px; color: var(--muted); }
  .line input { flex: 1; border: 0; outline: 0; font: inherit; }
  .body { border: 0; outline: 0; resize: vertical; min-height: 220px; padding: 20px; font: inherit; font-size: 15px; line-height: 1.6; }
  .atts { padding: 14px 20px; border-top: 1px solid var(--line-soft); }
  .pdf { font-size: 11px; color: var(--bad); }
</style>
