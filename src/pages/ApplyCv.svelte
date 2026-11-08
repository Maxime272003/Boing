<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { href, router } from '$lib/router.svelte';
  import { adaptCv } from '$lib/ai/engine';
  import { afterOf, applyChanges, applyChangesTraced, baseCv, beforeOf, editAt, type EditTarget } from '$lib/cv';
  import { cvPdf, fileNames } from '$lib/documents';
  import type { Application, CvChange } from '$lib/types';
  import ApplyHeader from '../components/ApplyHeader.svelte';
  import CvPreview from '../components/CvPreview.svelte';
  import Icon from '../components/Icon.svelte';

  let { id }: { id: string } = $props();
  const stored = store.applications.find((a) => a.id === id);
  let app = $state<Application | null>(stored ? structuredClone($state.snapshot(stored)) : null);
  let busy = $state(false);
  let editingId = $state<string | null>(null);
  const profile = store.profile!;

  const original = $derived(baseCv(profile));
  const adapted = $derived(app ? applyChanges(profile, app.cvChanges) : original);

  // Repères pour surligner ce qui change de part et d'autre.
  const marks = $derived.by(() => {
    const changed = new Set<string>();
    const removed = new Set<string>();
    if (!app) return { changed, removed };
    const { trace } = applyChangesTraced(profile, app.cvChanges);
    if (trace.title) changed.add('title'), removed.add('title');
    if (trace.summary) changed.add('summary'), removed.add('summary');
    trace.bullets.forEach((row, i) => row.forEach((b, j) => b.changeId && changed.add(`b-${i}-${j}`)));
    for (const c of app.cvChanges.filter((c) => c.accepted)) {
      const op = c.op;
      if (op.kind === 'skills') changed.add('skills');
      if (op.kind === 'hide_bullet' || (op.kind === 'bullet' && op.index !== null)) removed.add(`b-${op.exp}-${op.index}`);
    }
    return { changed, removed };
  });

  async function persist() {
    if (app) app = structuredClone($state.snapshot(await store.saveApplication(app)));
  }

  async function run() {
    if (!app) return;
    busy = true;
    try {
      const offer = app.offer;
      app.cvChanges = await adaptCv(store.aiContext(), profile, offer, store.analyses[offer.id] ?? null, app.kind);
      app.history.push({ at: new Date().toISOString(), label: 'CV adapté par Claude' });
      await persist();
      if (!app.cvChanges.length) store.toast("Claude n'a pas proposé de modification.", 'info');
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (app && !app.cvChanges.length && store.aiReady) void run();
  });

  async function inlineEdit(target: EditTarget, value: string) {
    if (!app) return;
    app.cvChanges = editAt(profile, $state.snapshot(app.cvChanges) as CvChange[], target, value);
    await persist();
  }

  async function setAll(v: boolean) {
    if (!app) return;
    app.cvChanges = app.cvChanges.map((c) => ({ ...c, accepted: v }));
    await persist();
  }

  async function setOne(c: CvChange, v: boolean) {
    c.accepted = v;
    await persist();
  }

  async function saveEdit(c: CvChange, value: string) {
    if (c.op.kind === 'hide_bullet') return;
    if (c.op.kind === 'skills') {
      const allowed = profile.skills;
      c.op.value = value.split(',').map((s) => s.trim()).filter((s) => allowed.includes(s));
    } else {
      c.op.value = value.trim();
    }
    editingId = null;
    await persist();
  }

  async function preview() {
    if (!app) return;
    try {
      const bytes = await cvPdf(app, profile);
      const names = fileNames(app, profile);
      const path = await store.backend.saveDocument(names.folder, names.cv, bytes);
      await store.backend.openFile(path);
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  const exp = (c: CvChange) => (c.op.kind === 'bullet' || c.op.kind === 'hide_bullet' ? profile.experiences[c.op.exp] : null);
</script>

{#if !app}
  <div class="page"><div class="card empty"><h2>Candidature introuvable</h2><a class="btn" href={href('/offres')}>Retour aux offres</a></div></div>
{:else}
  <div class="page">
    <ApplyHeader {app} step="cv" />

    {#if busy}
      <div class="banner info" role="status"><span class="spinner"></span><span class="grow">Claude adapte ton CV à l'offre…</span></div>
    {:else if app.cvChanges.length}
      <div class="banner" style="background: var(--panel);border:1px solid var(--line)">
        <span style="color:var(--accent)"><Icon name="sparkle" /></span>
        <span class="grow"><strong>{app.cvChanges.length} modification{app.cvChanges.length > 1 ? 's' : ''} proposée{app.cvChanges.length > 1 ? 's' : ''}.</strong> {app.kind === 'stopgap' ? 'Version « job alimentaire » : Claude met en avant ce qui compte pour ce poste et résume ton métier, sans rien inventer.' : 'Claude a reformulé et réordonné ton CV à partir de ta fiche profil, sans rien inventer.'}</span>
        <button class="btn sm" onclick={() => setAll(false)}>Tout refuser</button>
        <button class="btn sm" onclick={() => setAll(true)}>Tout accepter</button>
      </div>
    {:else}
      <div class="banner note">
        <span class="grow">{store.aiReady ? 'Aucune modification pour le moment.' : 'Ajoute ta clé Claude pour adapter ton CV automatiquement. Tu peux aussi envoyer ton CV tel quel.'}</span>
        {#if store.aiReady}<button class="btn primary sm" onclick={run}><Icon name="sparkle" size={16} />Adapter avec Claude</button>{/if}
      </div>
    {/if}

    <div class="cols">
      <section class="col" aria-labelledby="orig">
        <h2 id="orig" class="section-title">Ton CV d'origine</h2>
        <CvPreview cv={original} removed={marks.removed} />
      </section>
      <section class="col" aria-labelledby="adap">
        <div class="spread"><h2 id="adap" class="section-title" style="color:var(--good)">Version adaptée</h2><span class="meta">Clique sur un texte pour le modifier</span></div>
        <CvPreview cv={adapted} changed={marks.changed} accent onedit={inlineEdit} />
      </section>
      <aside class="col narrow" aria-labelledby="mods">
        <h2 id="mods" class="section-title">Modifications</h2>
        {#each app.cvChanges as c (c.id)}
          <div class="mod" class:off={!c.accepted} data-testid="cv-change">
            <strong>{c.title}</strong>
            <span class="why">{c.why}</span>
            {#if exp(c)}<span class="meta">{exp(c)?.role} — {exp(c)?.company}</span>{/if}
            {#if editingId === c.id}
              <textarea class="textarea" rows="3" id="edit-{c.id}" aria-label="Texte de la modification">{afterOf(c)}</textarea>
              <div class="row" style="--gap:6px">
                <button class="btn sm" onclick={() => (editingId = null)}>Annuler</button>
                <button class="btn sm primary" onclick={() => saveEdit(c, (document.getElementById(`edit-${c.id}`) as HTMLTextAreaElement).value)}>Enregistrer</button>
              </div>
            {:else}
              {#if c.op.kind === 'skills'}
                <span class="small">Nouvel ordre : <span class="ins">{afterOf(c)}</span></span>
              {:else if c.op.kind === 'hide_bullet'}
                <span class="small">Masquée sur ce CV : <span class="del">{beforeOf(profile, c)}</span></span>
              {:else}
                {#if beforeOf(profile, c)}<span class="del small">{beforeOf(profile, c)}</span>{/if}
                <span class="ins small">{afterOf(c)}</span>
              {/if}
              <div class="row" style="--gap:6px; flex-wrap:nowrap">
                <button class="btn sm grow" aria-pressed={!c.accepted} onclick={() => setOne(c, false)}>Refuser</button>
                <button class="btn sm grow" class:good={c.accepted} aria-pressed={c.accepted} onclick={() => setOne(c, true)}>{c.accepted ? 'Acceptée' : 'Accepter'}</button>
                {#if c.op.kind !== 'hide_bullet'}<button class="btn sm icon-btn" style="width:34px" aria-label="Modifier « {c.title} »" onclick={() => (editingId = c.id)}><Icon name="edit" size={15} /></button>{/if}
              </div>
            {/if}
          </div>
        {/each}
        {#if store.analyses[app.offerId]?.gaps.length}
          <div class="banner" style="background:var(--warn-soft);color:var(--warn-ink);font-size:13px">
            Points de l'offre absents de ta fiche profil : {store.analyses[app.offerId].gaps.join(' · ')}. Claude ne les ajoute pas ; complète ta fiche si c'est le cas.
          </div>
        {/if}
      </aside>
    </div>

    <footer class="spread foot">
      <div class="row">
        <label class="meta row">Modèle
          <select class="select input" style="height:40px;width:auto" bind:value={app.cvTemplate} onchange={persist}>
            <option value="sobre">Sobre</option>
            <option value="moderne">Moderne</option>
            <option value="colonnes">Deux colonnes</option>
          </select>
        </label>
        <button class="btn" onclick={run} disabled={busy || !store.aiReady}>Régénérer</button>
        <button class="btn" onclick={preview}>Aperçu PDF</button>
      </div>
      <button class="btn primary lg" onclick={() => router.go(`/candidature/${app!.id}/lettre`)}>Suivant : la lettre →</button>
    </footer>
  </div>
{/if}

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .col { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .col.narrow { flex: 1 1 260px; }
  .mod { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .mod.off { opacity: 0.65; }
  .mod strong { font-size: 14px; }
  .why { color: var(--ink-4); line-height: 1.45; }
  .small { font-size: 13px; padding: 2px 4px; }
  .foot { border-top: 1px solid var(--line); padding-top: 18px; }
</style>
