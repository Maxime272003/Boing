<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Commune, Search } from '$lib/types';
  import ChipsInput from './ChipsInput.svelte';

  let { search = $bindable(), suggestions = [] }: { search: Search; suggestions?: string[] } = $props();

  const CONTRACTS = [
    { id: 'CDI', label: 'CDI' },
    { id: 'CDD', label: 'CDD' },
    { id: 'MIS', label: 'Intérim' },
    { id: 'SAI', label: 'Saisonnier' }
  ];

  let cityQuery = $state(search.city?.name ?? '');
  let results = $state<Commune[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  function onCityInput() {
    clearTimeout(timer);
    search.city = null;
    timer = setTimeout(async () => {
      try {
        results = await store.backend.searchCommunes(cityQuery);
        open = results.length > 0;
      } catch {
        results = [];
      }
    }, 250);
  }

  function pick(c: Commune) {
    search.city = { name: c.name, insee: c.insee, postalCode: c.postalCode, department: c.department };
    cityQuery = c.name;
    open = false;
  }

  const toggle = (id: string) =>
    (search.contracts = search.contracts.includes(id) ? search.contracts.filter((c) => c !== id) : [...search.contracts, id]);
  const toggleSource = (id: 'france_travail' | 'adzuna') =>
    (search.sources = search.sources.includes(id) ? search.sources.filter((c) => c !== id) : [...search.sources, id]);
</script>

<div class="stack" style="--gap:22px">
  <ChipsInput bind:values={search.keywords} label="Métiers visés" placeholder="ex. Assistante administrative" {suggestions} />

  <div class="grid2">
    <div class="field" style="position:relative">
      <label for="city">Ville</label>
      <input
        id="city"
        class="input"
        autocomplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="city-list"
        bind:value={cityQuery}
        oninput={onCityInput}
        placeholder="ex. Lyon"
      />
      {#if open}
        <ul id="city-list" role="listbox" class="list options">
          {#each results as c (c.insee)}
            <li role="option" aria-selected="false">
              <button type="button" onclick={() => pick(c)}>{c.name} <span class="meta">({c.department ?? c.postalCode})</span></button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if search.city}<span class="hint">✓ {search.city.name} ({search.city.department})</span>{/if}
    </div>
    <label class="field">Rayon
      <select class="select input" bind:value={search.distanceKm}>
        {#each [5, 10, 20, 30, 50, 100] as d}<option value={d}>{d} km</option>{/each}
      </select>
    </label>
  </div>

  <div class="field">Type de contrat
    <div class="row" style="font-weight:400">
      {#each CONTRACTS as c}
        <button type="button" class="chip soft" aria-pressed={search.contracts.includes(c.id)} onclick={() => toggle(c.id)}>{c.label}</button>
      {/each}
    </div>
    <span class="hint">Aucun choisi = tous les contrats.</span>
  </div>

  <div class="grid2">
    <div class="field">Temps de travail
      <div class="row" style="font-weight:400">
        <button type="button" class="chip soft" aria-pressed={search.fullTime === true} onclick={() => (search.fullTime = search.fullTime === true ? null : true)}>Temps plein</button>
        <button type="button" class="chip soft" aria-pressed={search.fullTime === false} onclick={() => (search.fullTime = search.fullTime === false ? null : false)}>Temps partiel</button>
      </div>
    </div>
    <label class="field">Salaire minimum (brut annuel, pour info)
      <input class="input" type="number" min="0" step="500" placeholder="ex. 24000" bind:value={search.salaryMin} />
    </label>
  </div>

  <div class="field">Sources d'offres
    <label class="check"><input type="checkbox" checked={search.sources.includes('france_travail')} onchange={() => toggleSource('france_travail')} /> France Travail <span class="hint">— API officielle, clé gratuite</span></label>
    <label class="check"><input type="checkbox" checked={search.sources.includes('adzuna')} onchange={() => toggleSource('adzuna')} /> Adzuna <span class="hint">— agrégateur, clé gratuite</span></label>
  </div>
</div>

<style>
  .options { position: absolute; top: 74px; left: 0; right: 0; background: #fff; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12); z-index: 10; padding: 4px; }
  .options button { width: 100%; text-align: left; border: 0; background: none; padding: 10px 12px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; color: var(--ink); }
  .options button:hover { background: var(--accent-soft); }
</style>
