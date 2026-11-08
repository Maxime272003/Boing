<script lang="ts">
  import { store, newId } from '$lib/store.svelte';
  import { href } from '$lib/router.svelte';
  import { addDays, ago, cleanTitle, dateTime, shortDate } from '$lib/format';
  import { followUp } from '$lib/ai/engine';
  import type { Application, AppStatus, SearchKind } from '$lib/types';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import Stats from '../components/Stats.svelte';

  const COLS: { id: AppStatus; name: string; dot: string }[] = [
    { id: 'draft', name: 'À envoyer', dot: '#71717a' },
    { id: 'sent', name: 'Envoyée', dot: '#3442c4' },
    { id: 'followup', name: 'Relancée', dot: '#b7791f' },
    { id: 'interview', name: 'Entretien', dot: '#1e7a46' },
    { id: 'closed', name: 'Clôturée', dot: '#a1a1aa' }
  ];

  let kindFilter = $state<'all' | SearchKind>('all');
  const hasStopgap = $derived(store.applications.some((a) => a.kind === 'stopgap'));
  const shown = $derived(kindFilter === 'all' ? store.applications : store.applications.filter((a) => a.kind === kindFilter));
  const by = (s: AppStatus) => shown.filter((a) => a.status === s);
  const stats = $derived({
    sent: store.applications.filter((a) => a.status !== 'draft').length,
    answers: store.applications.filter((a) => a.status === 'interview' || (a.status === 'closed' && a.outcome && a.outcome !== 'sans_reponse')).length,
    interviews: store.applications.filter((a) => a.status === 'interview' || a.outcome === 'accepte').length,
    due: store.followUpsDue.length
  });

  let dragId = $state<string | null>(null);
  let over = $state<AppStatus | null>(null);

  async function move(a: Application, status: AppStatus) {
    if (a.status === status) return;
    const label = COLS.find((c) => c.id === status)!.name;
    const next: Application = { ...$state.snapshot(a), status, history: [...a.history, { at: new Date().toISOString(), label: `Statut : ${label}` }] };
    if (status === 'sent' && !next.sentAt) next.sentAt = new Date().toISOString();
    if (status === 'closed' && !next.outcome) next.outcome = 'sans_reponse';
    await store.saveApplication(next);
  }

  async function update(a: Application, patch: Partial<Application>) {
    await store.saveApplication({ ...$state.snapshot(a), ...patch });
  }

  // ----- Relance -----
  let relance = $state<{ app: Application; subject: string; body: string; loading: boolean } | null>(null);

  async function openRelance(a: Application) {
    relance = { app: a, subject: a.followUpDraft?.subject ?? '', body: a.followUpDraft?.body ?? '', loading: !a.followUpDraft && store.aiReady };
    if (!a.followUpDraft && store.aiReady && store.profile) {
      try {
        const r = await followUp(store.aiContext(), store.profile, a);
        if (relance) {
          relance.subject = r.subject;
          relance.body = r.body;
          await update(a, { followUpDraft: r });
        }
      } catch (e) {
        store.toast(store.errorText(e), 'error');
      } finally {
        if (relance) relance.loading = false;
      }
    }
  }

  async function sendRelance(viaApp: boolean) {
    if (!relance) return;
    const a = relance.app;
    try {
      if (viaApp) {
        await store.backend.sendMail($state.snapshot(store.settings.smtp), { to: a.mail.to, subject: relance.subject, body: relance.body, attachments: [] });
      } else {
        await store.backend.openUrl(`mailto:${encodeURIComponent(a.mail.to)}?subject=${encodeURIComponent(relance.subject)}&body=${encodeURIComponent(relance.body)}`);
      }
      const fresh = store.applications.find((x) => x.id === a.id)!;
      await update(fresh, {
        status: 'followup',
        followUpDone: true,
        history: [...fresh.history, { at: new Date().toISOString(), label: 'Relance envoyée' }]
      });
      store.toast('Relance envoyée', 'success');
      relance = null;
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    }
  }

  async function later(a: Application) {
    await update(a, { followUpAt: addDays(new Date().toISOString(), 3) });
    store.toast('Rappel décalé de 3 jours');
  }

  // ----- Candidature faite ailleurs -----
  let external = $state<{ title: string; company: string; to: string; kind: SearchKind } | null>(null);
  async function addExternal() {
    if (!external || !external.title.trim() || !external.company.trim()) return;
    const now = new Date().toISOString();
    const id = newId('ext-');
    await store.saveApplication({
      id: newId('app-'),
      offerId: id,
      offer: { id, source: 'Autre', sourceId: id, title: external.title, company: external.company, location: '', description: '', skills: [] },
      kind: external.kind,
      score: null,
      status: 'sent',
      cvChanges: [],
      cvTemplate: 'sobre',
      letter: '',
      letterOptions: { tone: 'professionnel', length: 'standard', points: [], instruction: '' },
      mail: { to: external.to, subject: '', body: '' },
      mode: 'site',
      checks: { cv: true, letter: true, company: true },
      followUpDays: store.settings.defaultFollowUpDays,
      createdAt: now,
      sentAt: now,
      followUpAt: addDays(now, store.settings.defaultFollowUpDays),
      notes: '',
      history: [{ at: now, label: 'Ajoutée à la main' }]
    });
    external = null;
  }

  function cardLink(a: Application) {
    return a.status === 'draft' ? href(`/candidature/${a.id}/cv`) : a.offer.source !== 'Autre' && store.offers.some((o) => o.id === a.offerId) ? href(`/offres/${a.offerId}`) : undefined;
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Candidatures</h1>
      <p class="meta">Fais glisser une carte ou change son statut pour la déplacer.</p>
    </div>
    <button class="btn" onclick={() => (external = { title: '', company: '', to: '', kind: 'career' })}><Icon name="plus" size={16} />Ajouter une candidature faite ailleurs</button>
  </header>

  <div class="grid4">
    <div class="card tight stat"><span class="meta">Envoyées</span><strong data-testid="stat-sent">{stats.sent}</strong></div>
    <div class="card tight stat"><span class="meta">Réponses reçues</span><strong>{stats.answers}</strong></div>
    <div class="card tight stat"><span class="meta">Entretiens</span><strong>{stats.interviews}</strong></div>
    <div class="card tight stat" class:warn={stats.due}><span class="meta" style:color={stats.due ? "inherit" : undefined}>Relances à faire</span><strong>{stats.due}</strong></div>
  </div>

  {#if hasStopgap}
    <div class="seg" role="radiogroup" aria-label="Type de candidatures">
      <button role="radio" aria-checked={kindFilter === 'all'} onclick={() => (kindFilter = 'all')}>Tout</button>
      <button role="radio" aria-checked={kindFilter === 'career'} onclick={() => (kindFilter = 'career')}>Mon métier</button>
      <button role="radio" aria-checked={kindFilter === 'stopgap'} onclick={() => (kindFilter = 'stopgap')}>Jobs alimentaires</button>
    </div>
  {/if}

  {#each store.followUpsDue as a (a.id)}
    <div class="banner warn">
      <span style="color:var(--warn)"><Icon name="clock" /></span>
      <span class="grow"><strong>{a.offer.company}</strong> : envoyée {ago(a.sentAt)}, sans réponse.</span>
      <button class="btn sm" onclick={() => later(a)}>Plus tard</button>
      <button class="btn sm primary" onclick={() => openRelance(a)}>Préparer la relance</button>
    </div>
  {/each}

  {#if !store.applications.length}
    <div class="card empty">
      <Icon name="kanban" size={32} />
      <h2>Aucune candidature pour l'instant</h2>
      <p>Ouvre une offre et clique « Préparer ma candidature ».</p>
      <a class="btn primary" href={href('/offres')}>Voir les offres</a>
    </div>
  {:else}
    <div class="board-wrap">
      <div class="board">
        {#each COLS as col (col.id)}
          <section
            class="col"
            class:over={over === col.id}
            aria-label={col.name}
            data-testid="col-{col.id}"
            ondragover={(e) => { e.preventDefault(); over = col.id; }}
            ondragleave={() => (over = over === col.id ? null : over)}
            ondrop={(e) => {
              e.preventDefault();
              over = null;
              const a = store.applications.find((x) => x.id === dragId);
              if (a) move(a, col.id);
            }}
          >
            <div class="row" style="--gap:8px; padding:2px 4px">
              <span class="dot" style="background:{col.dot}" aria-hidden="true"></span>
              <h2 style="font-size:14px; font-family:Inter">{col.name}</h2>
              <span class="meta" style="margin-left:auto">{by(col.id).length}</span>
            </div>
            {#each by(col.id) as a (a.id)}
              <article class="kcard" draggable="true" ondragstart={() => (dragId = a.id)} ondragend={() => (dragId = null)} data-testid="app-card">
                {#if cardLink(a)}<a class="t" href={cardLink(a)}>{cleanTitle(a.offer.title)}</a>{:else}<strong class="t">{cleanTitle(a.offer.title)}</strong>{/if}
                <span class="co">{a.offer.company}</span>
                {#if a.kind === 'stopgap'}<span class="badge warn" style="align-self:flex-start">Job alimentaire</span>{/if}
                <div class="spread meta" style="gap:6px">
                  <span>
                    {#if a.status === 'draft'}Préparée {ago(a.createdAt)}
                    {:else if a.status === 'interview' && a.interviewAt}{dateTime(a.interviewAt)}
                    {:else if a.sentAt}Envoyée le {shortDate(a.sentAt)}{/if}
                  </span>
                  {#if a.score !== null}<span style="font-weight:600;color:var(--good)">{a.score} %</span>{/if}
                </div>
                {#if a.status === 'draft' && a.cvChanges.length && a.letter}<span class="tag info">CV et lettre prêts</span>{/if}
                {#if store.followUpsDue.some((x) => x.id === a.id)}<span class="tag warn">Relance à faire</span>{/if}
                {#if a.status === 'interview'}
                  <label class="meta stack" style="--gap:4px">Date de l'entretien
                    <input type="datetime-local" class="input" style="height:34px;font-size:13px" value={a.interviewAt?.slice(0, 16) ?? ''} onchange={(e) => update(a, { interviewAt: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : undefined })} />
                  </label>
                {/if}
                {#if a.status === 'closed'}
                  <select class="select input" style="height:34px;font-size:13px" aria-label="Issue" value={a.outcome ?? 'sans_reponse'} onchange={(e) => update(a, { outcome: e.currentTarget.value as Application['outcome'] })}>
                    <option value="sans_reponse">Sans réponse</option>
                    <option value="refus">Refus</option>
                    <option value="accepte">Acceptée</option>
                  </select>
                {/if}
                <select class="select input status" aria-label="Statut de « {cleanTitle(a.offer.title)} »" value={a.status} onchange={(e) => move(a, e.currentTarget.value as AppStatus)}>
                  {#each COLS as c}<option value={c.id}>{c.name}</option>{/each}
                </select>
              </article>
            {/each}
          </section>
        {/each}
      </div>
    </div>
    {#if stats.sent}<Stats apps={store.applications} />{/if}
  {/if}
</div>

{#if relance}
  <Modal title="Relance — {relance.app.offer.company}" onclose={() => (relance = null)}>
    {#if relance.loading}
      <p class="row" role="status"><span class="spinner"></span>Claude prépare un brouillon de relance…</p>
    {:else}
      <label class="field">Objet<input class="input" bind:value={relance.subject} /></label>
      <label class="field">Message<textarea class="textarea" rows="8" bind:value={relance.body}></textarea></label>
      {#if !relance.app.mail.to}<p class="banner note">Pas d'adresse e-mail connue pour cette candidature : copie le texte et relance par le site ou par téléphone.</p>{/if}
    {/if}
    {#snippet actions()}
      <button class="btn" onclick={() => (relance = null)}>Fermer</button>
      {#if relance && relance.app.mail.to}
        <button class="btn" disabled={relance.loading} onclick={() => sendRelance(false)}>Ouvrir dans ma messagerie</button>
        <button class="btn primary" disabled={relance.loading || !store.mailReady} onclick={() => sendRelance(true)}>Envoyer</button>
      {/if}
    {/snippet}
  </Modal>
{/if}

{#if external}
  <Modal title="Candidature faite ailleurs" onclose={() => (external = null)}>
    <label class="field">Poste<input class="input" bind:value={external.title} /></label>
    <label class="field">Entreprise<input class="input" bind:value={external.company} /></label>
    <label class="field">E-mail du recruteur (facultatif, pour la relance)<input class="input" type="email" bind:value={external.to} /></label>
    <label class="check"><input type="checkbox" checked={external.kind === 'stopgap'} onchange={(e) => (external!.kind = e.currentTarget.checked ? 'stopgap' : 'career')} />C'est un job alimentaire</label>
    {#snippet actions()}
      <button class="btn" onclick={() => (external = null)}>Annuler</button>
      <button class="btn primary" onclick={addExternal}>Ajouter</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .seg { display: inline-flex; align-self: flex-start; background: var(--hover); border-radius: 10px; padding: 4px; gap: 4px; }
  .seg button { border: 0; background: transparent; height: 36px; padding: 0 14px; border-radius: 7px; font-size: 14px; font-weight: 600; color: var(--ink-3); cursor: pointer; }
  .seg button[aria-checked='true'] { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
  .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .stat { display: flex; flex-direction: column; gap: 4px; }
  .stat strong { font-family: 'Space Grotesk'; font-size: 28px; }
  .stat.warn { background: var(--warn-soft); border-color: var(--warn-line); color: var(--warn); }
  .board-wrap { overflow-x: auto; padding-bottom: 6px; }
  .board { display: grid; grid-template-columns: repeat(5, minmax(220px, 1fr)); gap: 12px; min-width: 1140px; }
  .col { background: var(--sunken); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 380px; outline: 2px dashed transparent; }
  .col.over { outline-color: var(--accent); background: var(--accent-soft); }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .kcard { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; cursor: grab; }
  .t { font-size: 14px; font-weight: 600; color: var(--ink); text-decoration: none; }
  a.t:hover { color: var(--accent); text-decoration: underline; }
  .co { color: var(--ink-3); }
  .tag { padding: 6px 8px; border-radius: 6px; font-weight: 600; }
  .tag.info { background: var(--accent-soft); color: var(--accent-ink); }
  .tag.warn { background: var(--warn-soft); color: var(--warn-ink); }
  .status { height: 32px; font-size: 13px; margin-top: 4px; }
</style>
