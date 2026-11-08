<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { router, href } from '$lib/router.svelte';
  import { ago } from '$lib/format';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  const section = $derived(
    ['offres', 'offre', 'cv', 'lettre', 'envoi'].includes(router.route.name) ? 'offres' : router.route.name
  );
  const fresh = $derived(store.visibleOffers.filter((o) => !o.seen).length);
  const due = $derived(store.followUpsDue.length);
</script>

<nav class="side" aria-label="Navigation principale">
  <div class="brand"><Logo size={30} /></div>
  <a class="nav" href={href('/offres')} aria-current={section === 'offres' ? 'page' : undefined}>
    <Icon name="briefcase" />Offres{#if fresh}<span class="badge" title="Offres pas encore ouvertes">{fresh}</span>{/if}
  </a>
  <a class="nav" href={href('/suivi')} aria-current={section === 'suivi' ? 'page' : undefined}>
    <Icon name="kanban" />Candidatures{#if due}<span class="badge warn">{due} relance{due > 1 ? 's' : ''}</span>{/if}
  </a>
  <a class="nav" href={href('/documents')} aria-current={section === 'documents' ? 'page' : undefined}>
    <Icon name="file" />Mes documents
  </a>
  <a class="nav" href={href('/parametres')} aria-current={section === 'parametres' ? 'page' : undefined}>
    <Icon name="gear" />Paramètres
  </a>

  <div class="foot">
    {#if store.fetching}
      <span class="row" style="--gap:8px"><span class="spinner" aria-hidden="true"></span>Collecte en cours…</span>
    {:else if store.analysing}
      <span class="row" style="--gap:8px"><span class="spinner" aria-hidden="true"></span>Analyse {store.analysing.done}/{store.analysing.total}</span>
    {:else}
      <span>Dernière collecte : {store.settings.lastFetchAt ? ago(store.settings.lastFetchAt) : 'jamais'}</span>
    {/if}
    <span class="meta">Données stockées sur ce PC</span>
  </div>
</nav>

<style>
  .side { width: 236px; flex: none; padding: 20px 14px; border-right: 1px solid var(--line); background: var(--side); display: flex; flex-direction: column; gap: 4px; height: 100vh; position: sticky; top: 0; }
  .brand { padding: 10px 10px 24px; }
  .nav { display: flex; align-items: center; gap: 10px; padding: 0 12px; height: 44px; border-radius: 8px; color: var(--ink-3); text-decoration: none; font-size: 14px; font-weight: 500; }
  .nav:hover { background: var(--hover); color: var(--ink); }
  .nav[aria-current='page'] { background: var(--ink); color: var(--on-ink); }
  .nav .badge { margin-left: auto; }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); font-size: 13px; color: var(--ink-3); }
</style>
