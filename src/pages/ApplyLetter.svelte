<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { href, router } from '$lib/router.svelte';
  import { writeLetter } from '$lib/ai/engine';
  import { fileNames, letterPdf } from '$lib/documents';
  import type { Application, LetterLength, Tone } from '$lib/types';
  import ApplyHeader from '../components/ApplyHeader.svelte';
  import Icon from '../components/Icon.svelte';

  let { id }: { id: string } = $props();
  const stored = store.applications.find((a) => a.id === id);
  let app = $state<Application | null>(stored ? structuredClone($state.snapshot(stored)) : null);
  let busy = $state(false);
  let previous = $state<string | null>(null);
  const profile = store.profile!;

  const analysis = $derived(app ? store.analyses[app.offerId] : undefined);
  const pointChoices = $derived([
    ...new Set([...(analysis?.keywords ?? []).slice(0, 4), ...profile.languages.slice(0, 1)])
  ]);
  const words = $derived(app?.letter.trim() ? app.letter.trim().split(/\s+/).length : 0);

  async function persist() {
    if (app) app = structuredClone($state.snapshot(await store.saveApplication(app)));
  }

  async function run() {
    if (!app) return;
    busy = true;
    try {
      const tpl = store.letters.find((l) => l.id === app!.letterOptions.templateId);
      const r = await writeLetter(store.aiContext(), profile, app.offer, analysis ?? null, $state.snapshot(app.letterOptions), tpl?.text);
      previous = app.letter || null;
      app.letter = r.letter;
      app.mail.subject = r.mailSubject || app.mail.subject;
      app.mail.body = r.mailBody || app.mail.body;
      app.history.push({ at: new Date().toISOString(), label: 'Lettre rédigée par Claude' });
      if (tpl) await store.saveLetterTemplate({ ...tpl, uses: tpl.uses + 1 });
      await persist();
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (app && !app.letter && store.aiReady) {
      if (!app.letterOptions.points.length) app.letterOptions.points = pointChoices.slice(0, 2);
      void run();
    }
  });

  function undo() {
    if (!app || previous === null) return;
    app.letter = previous;
    previous = null;
    void persist();
  }

  const togglePoint = (p: string) => {
    if (!app) return;
    const pts = app.letterOptions.points;
    app.letterOptions.points = pts.includes(p) ? pts.filter((x) => x !== p) : [...pts, p];
  };

  async function preview() {
    if (!app) return;
    await persist();
    const bytes = await letterPdf(app, profile);
    const names = fileNames(app, profile);
    const path = await store.backend.saveDocument(names.folder, names.letter, bytes);
    await store.backend.openFile(path);
  }

  const tones: [Tone, string][] = [['professionnel', 'Professionnel'], ['chaleureux', 'Chaleureux'], ['direct', 'Direct']];
  const lengths: [LetterLength, string][] = [['courte', 'Courte'], ['standard', 'Standard'], ['detaillee', 'Détaillée']];
</script>

{#if !app}
  <div class="page"><div class="card empty"><h2>Candidature introuvable</h2><a class="btn" href={href('/offres')}>Retour aux offres</a></div></div>
{:else}
  <div class="page">
    <ApplyHeader {app} step="lettre" />

    <div class="cols">
      <section class="card editor" aria-label="Lettre de motivation">
        <div class="toolbar">
          {#if busy}<span class="row meta" role="status"><span class="spinner"></span>Claude rédige la lettre…</span>
          {:else if previous !== null}<button class="btn sm ghost" onclick={undo}>Annuler la dernière réécriture</button>{/if}
          <span class="meta" style="margin-left:auto">{words} mots</span>
        </div>
        <label class="sr-only" for="letter">Texte de la lettre</label>
        <textarea id="letter" class="letter" bind:value={app.letter} onblur={persist} placeholder={store.aiReady ? 'La lettre apparaîtra ici.' : 'Écris ta lettre ici, ou ajoute ta clé Claude pour la faire rédiger.'}></textarea>
      </section>

      <aside class="card stack" style="--gap:20px; flex:1 1 300px; min-width:0">
        <h2>Réglages de Claude</h2>
        <div class="field">Ton
          <div class="row" style="--gap:6px; font-weight:400" role="group" aria-label="Ton">
            {#each tones as [v, l]}<button class="chip" aria-pressed={app.letterOptions.tone === v} onclick={() => (app!.letterOptions.tone = v)}>{l}</button>{/each}
          </div>
        </div>
        <div class="field">Longueur
          <div class="row" style="--gap:6px; font-weight:400" role="group" aria-label="Longueur">
            {#each lengths as [v, l]}<button class="chip" aria-pressed={app.letterOptions.length === v} onclick={() => (app!.letterOptions.length = v)}>{l}</button>{/each}
          </div>
        </div>
        {#if pointChoices.length}
          <fieldset class="stack" style="--gap:4px; border:0; padding:0; margin:0">
            <legend class="field" style="margin-bottom:8px">Points à mettre en avant</legend>
            {#each pointChoices as p}
              <label class="check"><input type="checkbox" checked={app.letterOptions.points.includes(p)} onchange={() => togglePoint(p)} />{p}</label>
            {/each}
          </fieldset>
        {/if}
        <label class="field">Consigne en plus
          <textarea class="textarea" rows="3" placeholder="ex. Mentionne que je peux commencer en décembre" bind:value={app.letterOptions.instruction}></textarea>
        </label>
        {#if store.letters.length}
          <label class="field">Partir d'un modèle
            <select class="select input" bind:value={app.letterOptions.templateId}>
              <option value={undefined}>Aucun</option>
              {#each store.letters as l}<option value={l.id}>{l.name}</option>{/each}
            </select>
          </label>
        {/if}
        <button class="btn lg" onclick={run} disabled={busy || !store.aiReady}><Icon name="sparkle" size={16} />{app.letter ? 'Réécrire la lettre' : 'Rédiger la lettre'}</button>
      </aside>
    </div>

    <footer class="spread foot">
      <a class="btn" href={href(`/candidature/${app.id}/cv`)}>← Retour au CV</a>
      <div class="row">
        <button class="btn" onclick={preview} disabled={!app.letter}>Aperçu PDF</button>
        <button class="btn primary lg" onclick={async () => { await persist(); router.go(`/candidature/${app!.id}/envoi`); }}>Suivant : l'envoi →</button>
      </div>
    </footer>
  </div>
{/if}

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .editor { flex: 999 1 520px; min-width: 0; padding: 0; display: flex; flex-direction: column; }
  .toolbar { display: flex; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--line-soft); align-items: center; min-height: 50px; }
  .letter { border: 0; outline: 0; resize: vertical; min-height: 520px; padding: 32px 44px; font-family: Georgia, 'Times New Roman', serif; font-size: 15.5px; line-height: 1.7; color: var(--ink-2); border-radius: 0 0 14px 14px; }
  .letter:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .foot { border-top: 1px solid var(--line); padding-top: 18px; }
</style>
