<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { href } from '$lib/router.svelte';
  import { ago, cleanTitle, tier, tierLabel } from '$lib/format';
  import type { Offer } from '$lib/types';
  import Icon from '../components/Icon.svelte';
  import ScoreBadge from '../components/ScoreBadge.svelte';

  type Filter = 'all' | 'new' | 'good' | 'fav' | 'hidden';
  let filter = $state<Filter>('all');
  let sort = $state<'match' | 'date'>('match');
  let q = $state('');

  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const score = (o: Offer) => store.analyses[o.id]?.score ?? null;

  const counts = $derived({
    all: store.visibleOffers.length,
    new: store.visibleOffers.filter((o) => !o.seen).length,
    good: store.visibleOffers.filter((o) => (score(o) ?? 0) >= 70).length,
    fav: store.visibleOffers.filter((o) => o.favorite).length,
    hidden: store.offers.filter((o) => o.hidden).length
  });

  const list = $derived.by(() => {
    let l = filter === 'hidden' ? store.offers.filter((o) => o.hidden) : store.visibleOffers;
    if (filter === 'new') l = l.filter((o) => !o.seen);
    if (filter === 'good') l = l.filter((o) => (score(o) ?? 0) >= 70);
    if (filter === 'fav') l = l.filter((o) => o.favorite);
    if (q.trim()) {
      const n = norm(q.trim());
      l = l.filter((o) => norm(`${o.title} ${o.company} ${o.location}`).includes(n));
    }
    const date = (o: Offer) => new Date(o.publishedAt ?? o.fetchedAt ?? 0).getTime();
    return [...l].sort((a, b) =>
      sort === 'date' ? date(b) - date(a) : (score(b) ?? -1) - (score(a) ?? -1) || date(b) - date(a)
    );
  });

  const filters: [Filter, string][] = [
    ['all', 'Toutes'],
    ['new', 'Nouvelles'],
    ['good', 'Match ≥ 70 %'],
    ['fav', 'Favoris'],
    ['hidden', 'Masquées']
  ];

  async function refresh() {
    const { added, errors } = await store.refreshOffers();
    if (!errors.length) store.toast(added ? `${added} nouvelle${added > 1 ? 's' : ''} offre${added > 1 ? 's' : ''}` : 'Pas de nouvelle offre pour le moment', 'success');
  }

  const pending = $derived(store.pendingAnalysis.length);
  const toggle = (o: Offer, key: 'favorite' | 'hidden') => store.updateOffer({ ...o, [key]: !o[key] });
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Offres</h1>
      <p class="meta">{counts.all} offre{counts.all > 1 ? 's' : ''} · {counts.new} pas encore ouverte{counts.new > 1 ? 's' : ''} · triées par {sort === 'match' ? 'match' : 'date'}</p>
    </div>
    <div class="row">
      <label class="searchbox">
        <Icon name="search" size={16} />
        <span class="sr-only">Filtrer les offres</span>
        <input placeholder="Filtrer par mot-clé, entreprise…" bind:value={q} />
      </label>
      <button class="btn" onclick={refresh} disabled={store.fetching}>
        {#if store.fetching}<span class="spinner"></span>{:else}<Icon name="refresh" size={16} />{/if}Actualiser
      </button>
    </div>
  </header>

  <div class="spread">
    <div class="row" role="group" aria-label="Filtres rapides">
      {#each filters as [id, label]}
        <button class="chip" aria-pressed={filter === id} onclick={() => (filter = id)}>{label} · {counts[id]}</button>
      {/each}
    </div>
    <label class="meta row">Trier par
      <select class="select input" style="height:36px;width:auto" bind:value={sort}>
        <option value="match">Match</option>
        <option value="date">Date</option>
      </select>
    </label>
  </div>

  {#if store.analysing}
    <div class="banner info" role="status"><span class="spinner"></span><span class="grow">Claude analyse les offres… {store.analysing.done}/{store.analysing.total}</span></div>
  {:else if pending && store.aiReady}
    <div class="banner info">
      <Icon name="sparkle" />
      <span class="grow">{pending} offre{pending > 1 ? 's' : ''} pas encore analysée{pending > 1 ? 's' : ''} par Claude.</span>
      <button class="btn primary sm" onclick={() => store.analyse(store.pendingAnalysis.map((o) => o.id))}>Analyser {pending > 1 ? `les ${pending}` : "l'offre"}</button>
    </div>
  {:else if pending && !store.aiReady}
    <div class="banner note"><Icon name="sparkle" /><span class="grow">Ajoute ta clé Claude pour obtenir un score de match sur chaque offre.</span><a class="btn sm" href={href('/parametres')}>Paramètres</a></div>
  {/if}

  {#if !store.offers.length}
    <div class="card empty">
      <Icon name="briefcase" size={32} />
      <h2>Pas encore d'offres</h2>
      {#if !store.activeSources.length}
        <p>Ajoute une clé France Travail ou Adzuna pour que Boing récupère les offres.</p>
        <a class="btn primary" href={href('/parametres')}>Ajouter une clé</a>
      {:else if !store.searches.some((s) => s.active)}
        <p>Aucune recherche active.</p>
        <a class="btn primary" href={href('/documents')}>Gérer mes recherches</a>
      {:else}
        <p>Lance une première collecte.</p>
        <button class="btn primary" onclick={refresh} disabled={store.fetching}>Chercher des offres</button>
      {/if}
    </div>
  {:else if !list.length}
    <div class="card empty"><p>Aucune offre ne correspond à ce filtre.</p></div>
  {:else}
    <ul class="list stack" style="--gap:10px" aria-label="Liste des offres">
      {#each list as o (o.id)}
        {@const s = score(o)}
        <li class="offer" data-testid="offer">
          <ScoreBadge score={s} />
          <div class="offer-info">
            <div class="row" style="--gap:8px">
              <a class="title" href={href(`/offres/${o.id}`)}>{cleanTitle(o.title)}</a>
              {#if !o.seen}<span class="badge">NOUVEAU</span>{/if}
              {#if store.applicationFor(o.id)}<span class="badge good">Candidature</span>{/if}
            </div>
            <div class="meta row" style="--gap:6px 14px"><span>{o.company}</span><span>{o.location}</span>{#if o.contractLabel}<span>{o.contractLabel}{o.workingTime ? ` · ${o.workingTime.toLowerCase()}` : ''}</span>{/if}<span>{o.source} · {ago(o.publishedAt ?? o.fetchedAt)}</span></div>
            <div class="reason">{store.analyses[o.id]?.summary ?? 'Pas encore analysée par Claude.'}</div>
          </div>
          <div class="row" style="--gap:6px; flex-wrap:nowrap">
            {#if s !== null}<span class="tier {tier(s)}">{tierLabel[tier(s)]}</span>{/if}
            <button class="btn icon-btn" aria-label={o.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={!!o.favorite} onclick={() => toggle(o, 'favorite')}>
              <span style:color={o.favorite ? '#b7791f' : 'inherit'}><Icon name="star" /></span>
            </button>
            <button class="btn icon-btn" aria-label={o.hidden ? "Ré-afficher l'offre" : "Masquer l'offre"} onclick={() => toggle(o, 'hidden')}>
              <Icon name={o.hidden ? 'eye' : 'eyeoff'} />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .searchbox { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid var(--field); border-radius: 8px; background: #fff; min-width: 260px; color: var(--muted); }
  .searchbox input { border: 0; outline: 0; font: inherit; font-size: 14px; flex: 1; background: transparent; color: var(--ink); }
  .offer { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
  .offer-info { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .title { font-size: 16px; font-weight: 600; color: var(--ink); text-decoration: none; }
  .title:hover { color: var(--accent); text-decoration: underline; }
  .reason { font-size: 13px; color: var(--ink-3); }
  .tier { font-size: 12px; font-weight: 600; margin-right: 4px; }
  .tier.high { color: var(--good); }
  .tier.mid { color: var(--warn); }
  .tier.low { color: #52525b; }
</style>
