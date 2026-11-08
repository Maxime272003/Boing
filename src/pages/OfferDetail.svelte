<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { href, router } from '$lib/router.svelte';
  import { ago, cleanTitle } from '$lib/format';
  import Icon from '../components/Icon.svelte';
  import ScoreRing from '../components/ScoreRing.svelte';

  let { id }: { id: string } = $props();
  const offer = $derived(store.offers.find((o) => o.id === id));
  const analysis = $derived(store.analyses[id]);
  const app = $derived(store.applicationFor(id));
  let starting = $state(false);

  onMount(() => {
    if (offer && !offer.seen) void store.updateOffer({ ...offer, seen: true });
  });

  async function prepare() {
    starting = true;
    try {
      const a = await store.createApplication(id);
      router.go(`/candidature/${a.id}/cv`);
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    } finally {
      starting = false;
    }
  }

  const initials = $derived(
    (offer?.company ?? '?')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('')
  );
</script>

{#if !offer}
  <div class="page"><div class="card empty"><h2>Offre introuvable</h2><a class="btn" href={href('/offres')}>Retour aux offres</a></div></div>
{:else}
  <div class="page">
    <a href={href('/offres')} class="row back" style="--gap:6px"><Icon name="arrowLeft" size={16} />Toutes les offres</a>

    <header class="page-head" style="align-items:flex-start">
      <div class="row" style="--gap:16px; flex-wrap:nowrap; min-width:0">
        <div class="logo-co" aria-hidden="true">{initials || '?'}</div>
        <div class="stack" style="--gap:6px; min-width:0">
          <h1 style="font-size:28px">{cleanTitle(offer.title)}</h1>
          <div class="meta row" style="--gap:6px 14px; font-size:14px">
            <span>{offer.company}</span><span>{offer.location}</span>
            {#if offer.contractLabel}<span>{offer.contractLabel}{offer.workingTime ? ` · ${offer.workingTime.toLowerCase()}` : ''}</span>{/if}
            {#if offer.salary}<span>{offer.salary}</span>{/if}
            <span>{offer.source} · publiée {ago(offer.publishedAt ?? offer.fetchedAt)}</span>
          </div>
        </div>
      </div>
      <div class="row">
        {#if offer.url}<button class="btn" onclick={() => store.backend.openUrl(offer.url!)}>Voir l'offre d'origine <Icon name="external" size={14} /></button>{/if}
        <button class="btn" aria-pressed={!!offer.favorite} onclick={() => store.updateOffer({ ...offer, favorite: !offer.favorite })}>
          <span style:color={offer.favorite ? '#b7791f' : 'inherit'}><Icon name="star" size={16} /></span>{offer.favorite ? 'Favori' : 'Ajouter aux favoris'}
        </button>
        {#if app}
          <a class="btn primary" href={href(`/candidature/${app.id}/${app.status === 'draft' ? 'cv' : 'envoi'}`)}>Voir ma candidature</a>
        {:else}
          <button class="btn primary" onclick={prepare} disabled={starting}>Préparer ma candidature</button>
        {/if}
      </div>
    </header>

    <div class="cols">
      <article class="card stack desc" style="--gap:16px">
        <h2>L'offre</h2>
        <div class="text">{offer.description}</div>
        {#if offer.skills.length}
          <div class="row" style="--gap:8px">{#each offer.skills as s}<span class="chip small">{s}</span>{/each}</div>
        {/if}
        {#if offer.experience}<p class="meta">Expérience demandée : {offer.experience}</p>{/if}
        <p class="meta">
          Candidature :
          {#if offer.applyEmail}par e-mail à {offer.applyEmail}{:else if offer.applyUrl || offer.url}sur le site de l'employeur{:else}voir l'offre d'origine{/if}
        </p>
      </article>

      <aside class="stack" style="--gap:16px; flex: 1 1 340px; min-width:0">
        <section class="card stack" style="--gap:18px" aria-labelledby="ana">
          {#if analysis}
            <div class="row" style="--gap:16px; flex-wrap:nowrap">
              <ScoreRing score={analysis.score} />
              <div class="stack" style="--gap:4px">
                <h2 id="ana">{analysis.verdict}</h2>
                <span class="meta">Analysé par Claude · {ago(analysis.analysedAt)}</span>
              </div>
            </div>
            {#if analysis.summary}<p style="font-size:14px">{analysis.summary}</p>{/if}
            {#if analysis.strengths.length}
              <div class="stack" style="--gap:8px">
                <h3 style="color:var(--good)">Tes points forts</h3>
                <ul class="bul">{#each analysis.strengths as s}<li>{s}</li>{/each}</ul>
              </div>
            {/if}
            {#if analysis.gaps.length}
              <div class="stack" style="--gap:8px">
                <h3 style="color:var(--warn)">À renforcer</h3>
                <ul class="bul">{#each analysis.gaps as s}<li>{s}</li>{/each}</ul>
              </div>
            {/if}
            {#if analysis.keywords.length}
              <div class="stack" style="--gap:8px">
                <h3>Mots-clés à mettre en avant</h3>
                <div class="row" style="--gap:6px">{#each analysis.keywords as k}<span class="chip small">{k}</span>{/each}</div>
              </div>
            {/if}
            {#if !app}
              <button class="btn primary lg" onclick={prepare} disabled={starting}><Icon name="sparkle" size={16} />Adapter CV et lettre avec Claude</button>
            {/if}
            <button class="btn" onclick={() => store.analyse([id])} disabled={!!store.analysing}>Relancer l'analyse</button>
          {:else}
            <h2 id="ana">Match pas encore calculé</h2>
            <p class="meta">Claude compare l'offre avec ta fiche profil et explique ses points forts et ses manques.</p>
            <button class="btn primary" onclick={() => store.analyse([id])} disabled={!!store.analysing || !store.aiReady}>
              {#if store.analysing}<span class="spinner"></span>Analyse en cours…{:else}<Icon name="sparkle" size={16} />Analyser avec Claude{/if}
            </button>
            {#if !store.aiReady}<a class="meta" href={href('/parametres')}>Ajouter ma clé Claude</a>{/if}
          {/if}
        </section>
        <button class="btn ghost" onclick={() => { store.updateOffer({ ...offer, hidden: !offer.hidden }); if (!offer.hidden) router.go('/offres'); }}>
          <Icon name={offer.hidden ? 'eye' : 'eyeoff'} size={16} />{offer.hidden ? 'Ré-afficher cette offre' : 'Masquer cette offre'}
        </button>
      </aside>
    </div>
  </div>
{/if}

<style>
  .back { font-size: 14px; font-weight: 600; text-decoration: none; min-height: 32px; }
  .logo-co { width: 56px; height: 56px; border-radius: 12px; background: #ededE8; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk'; font-weight: 700; font-size: 20px; color: var(--ink-3); flex: none; }
  .cols { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .desc { flex: 999 1 460px; min-width: 0; padding: 24px 28px; }
  .text { white-space: pre-line; font-size: 15px; line-height: 1.65; color: var(--ink-2); }
  .bul { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.55; display: flex; flex-direction: column; gap: 4px; }
</style>
