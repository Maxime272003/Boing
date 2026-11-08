<script lang="ts">
  import { store, emptyProfile, newId } from '$lib/store.svelte';
  import { router } from '$lib/router.svelte';
  import { parseCv } from '$lib/ai/engine';
  import { extractText } from '$lib/pdf/extract';
  import type { Profile, Search } from '$lib/types';
  import Logo from '../components/Logo.svelte';
  import Icon from '../components/Icon.svelte';
  import SearchEditor from '../components/SearchEditor.svelte';
  import ProfileEditor from '../components/ProfileEditor.svelte';

  let step = $state(1);
  let claudeKey = $state('');
  let ftId = $state('');
  let ftSecret = $state('');
  let azId = $state('');
  let azKey = $state('');
  let showSources = $state(true);

  let profile = $state<Profile>(store.profile ? structuredClone($state.snapshot(store.profile)) : emptyProfile());
  let reading = $state(false);
  let readError = $state('');
  let editing = $state(false);
  let finishing = $state(false);

  let search = $state<Search>({
    id: newId('s-'),
    name: 'Ma recherche',
    kind: 'career',
    keywords: [],
    city: null,
    distanceKm: 30,
    contracts: ['CDI', 'CDD'],
    fullTime: true,
    salaryMin: null,
    sources: ['france_travail', 'adzuna'],
    active: true
  });

  // Job alimentaire en attendant : une deuxième recherche, plus large et plus proche.
  let wantStopgap = $state(false);
  let stopgap = $state<Search>({
    id: newId('s-'),
    name: 'Job alimentaire',
    kind: 'stopgap',
    keywords: [],
    city: null,
    distanceKm: 10,
    contracts: [],
    fullTime: null,
    salaryMin: null,
    sources: ['france_travail', 'adzuna'],
    active: true
  });

  function toggleStopgap() {
    wantStopgap = !wantStopgap;
    if (wantStopgap) {
      if (!stopgap.keywords.length) stopgap.keywords = profile.stopgapJobs.slice(0, 2);
      if (!stopgap.city) stopgap.city = search.city;
    }
  }

  const hasCv = $derived(!!profile.cvText || !!profile.firstName);

  async function saveKeys() {
    const pairs: [Parameters<typeof store.setSecret>[0], string][] = [
      ['claude_api_key', claudeKey],
      ['ft_client_id', ftId],
      ['ft_client_secret', ftSecret],
      ['adzuna_app_id', azId],
      ['adzuna_app_key', azKey]
    ];
    for (const [name, value] of pairs) if (value.trim()) await store.setSecret(name, value);
    step = 2;
  }

  async function readCvText(text: string, fileName: string) {
    readError = '';
    reading = true;
    try {
      if (store.aiReady) {
        const parsed = await parseCv(store.aiContext(), text);
        profile = { ...emptyProfile(), ...parsed, cvText: text, cvFileName: fileName };
        editing = false;
      } else {
        profile = { ...profile, cvText: text, cvFileName: fileName };
        editing = true;
      }
      search.keywords = profile.suggestedJobs.slice(0, 3);
      stopgap.keywords = [];
    } catch (e) {
      readError = store.errorText(e);
    } finally {
      reading = false;
    }
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await extractText(file);
      await readCvText(text, file.name);
    } catch (err) {
      readError = store.errorText(err);
    }
  }

  async function useSample() {
    const { SAMPLE_CV_TEXT } = await import('$lib/backend/fixtures');
    await readCvText(SAMPLE_CV_TEXT, 'CV_exemple.txt');
  }

  async function finish() {
    finishing = true;
    try {
      search.name = search.keywords.slice(0, 2).join(', ') + (search.city ? ` · ${search.city.name}` : '');
      if (!profile.careerGoal) profile.careerGoal = search.keywords[0] ?? '';
      await store.saveProfile(profile);
      await store.saveSearch(search);
      if (wantStopgap && stopgap.keywords.length) {
        stopgap.name = `Job alimentaire · ${stopgap.keywords.slice(0, 2).join(', ')}`;
        await store.saveSearch(stopgap);
      }
      await store.saveSettings({ onboarded: true });
      router.go('/offres', true);
      if (store.activeSources.length) void store.refreshOffers();
    } catch (e) {
      store.toast(store.errorText(e), 'error');
    } finally {
      finishing = false;
    }
  }

  const steps = ['Tes clés', 'Ton CV', 'Ce que tu cherches'];
</script>

<div class="wrap">
  <div class="top">
    <Logo size={36} />
    <ol class="steps" aria-label="Étapes">
      {#each steps as label, i}
        <li class="st" class:done={step > i + 1} class:cur={step === i + 1} aria-current={step === i + 1 ? 'step' : undefined}>
          {#if step > i + 1}<Icon name="check" size={16} stroke={2.5} />{/if}{i + 1}. {label}
        </li>
      {/each}
    </ol>
  </div>

  <div class="body">
    <section class="card main stack" style="--gap:26px">
      {#if step === 1}
        <div class="stack" style="--gap:8px">
          <h1>Bienvenue sur Boing</h1>
          <p class="lead">Boing récupère les offres d'emploi, calcule ton match et prépare un CV et une lettre adaptés à chaque offre. Pour ça, il a besoin de quelques clés.</p>
        </div>
        <label class="field">Clé API Claude
          <input class="input" type="password" autocomplete="off" placeholder="sk-ant-…" bind:value={claudeKey} />
          <span class="hint">Sert à lire ton CV, noter les offres et rédiger. À créer sur console.anthropic.com.</span>
        </label>
        <details bind:open={showSources} class="stack" style="--gap:14px">
          <summary>Sources d'offres (gratuites, facultatives pour l'instant)</summary>
          <div class="grid2" style="margin-top:14px">
            <label class="field">France Travail — identifiant client<input class="input" autocomplete="off" bind:value={ftId} /></label>
            <label class="field">France Travail — clé secrète<input class="input" type="password" autocomplete="off" bind:value={ftSecret} /></label>
            <label class="field">Adzuna — App ID<input class="input" autocomplete="off" bind:value={azId} /></label>
            <label class="field">Adzuna — App Key<input class="input" type="password" autocomplete="off" bind:value={azKey} /></label>
          </div>
          <span class="hint">Clés à créer sur francetravail.io (API « Offres d'emploi v2 ») et developer.adzuna.com.</span>
        </details>
        <div class="spread foot">
          <span class="meta">Les clés vont dans le coffre-fort de Windows, jamais dans un fichier.</span>
          <button class="btn primary lg" onclick={saveKeys}>Continuer <Icon name="arrowRight" size={16} /></button>
        </div>
      {:else if step === 2}
        <div class="stack" style="--gap:8px">
          <h1>Ton CV</h1>
          <p class="lead">{store.aiReady ? 'Claude le lit et en tire ta fiche profil. Tu pourras tout corriger.' : 'Sans clé Claude, tu remplis ta fiche profil à la main.'}</p>
        </div>
        <label class="drop">
          <Icon name="upload" size={22} />
          <span><strong>Choisir mon CV</strong> (PDF ou .txt)</span>
          <input type="file" accept=".pdf,.txt,application/pdf,text/plain" class="sr-only" onchange={onFile} data-testid="cv-input" />
        </label>
        {#if store.backend.kind === 'mock'}
          <button class="btn" onclick={useSample}>Essayer avec un CV d'exemple</button>
        {/if}
        {#if reading}<p class="row" role="status"><span class="spinner"></span> Claude lit ton CV…</p>{/if}
        {#if readError}<p class="banner warn" role="alert">{readError}</p>{/if}

        {#if hasCv && !reading}
          {#if !editing}
            <div class="summary stack" style="--gap:12px">
              <div class="spread">
                <h2>Ce que Claude a compris</h2>
                <button class="btn sm" onclick={() => (editing = true)}><Icon name="edit" size={16} />Corriger</button>
              </div>
              <dl>
                <div><dt>Nom</dt><dd>{profile.firstName} {profile.lastName} · {profile.title}</dd></div>
                <div><dt>Expérience</dt><dd>{profile.experiences.map((e) => `${e.role} (${e.company})`).join(' · ') || '—'}</dd></div>
                <div><dt>Compétences</dt><dd>{profile.skills.join(', ') || '—'}</dd></div>
                <div><dt>Langues</dt><dd>{profile.languages.join(', ') || '—'}</dd></div>
              </dl>
            </div>
          {:else}
            <ProfileEditor bind:profile />
          {/if}
        {/if}
        {#if !hasCv && !reading}
          <button class="btn ghost" onclick={() => (editing = true) && (profile.cvText = ' ')}>Je n'ai pas de CV sous la main : remplir à la main</button>
        {/if}
        <div class="spread foot">
          <button class="btn" onclick={() => (step = 1)}>Retour</button>
          <button class="btn primary lg" disabled={!profile.firstName || reading} onclick={() => (step = 3)}>Continuer <Icon name="arrowRight" size={16} /></button>
        </div>
      {:else}
        <div class="stack" style="--gap:8px">
          <h1>Quel travail cherches-tu ?</h1>
          <p class="lead">Ces critères servent à récupérer les offres. Tu pourras les changer à tout moment.</p>
        </div>
        <SearchEditor bind:search suggestions={profile.suggestedJobs} />

        <div class="stopgap stack" style="--gap:18px">
          <label class="check toggle">
            <input type="checkbox" checked={wantStopgap} onchange={toggleStopgap} />
            <span><strong>J'ai aussi besoin d'un job alimentaire en attendant</strong><br /><span class="hint">Une deuxième recherche, plus proche et plus large. Claude note ces offres sur la chance d'être prise vite et de tenir le poste, et prépare un CV adapté.</span></span>
          </label>
          {#if wantStopgap}
            <SearchEditor bind:search={stopgap} suggestions={profile.stopgapJobs} />
            <label class="field">Tes contraintes pour ce job
              <input class="input" bind:value={profile.stopgapConstraints} placeholder="ex. temps partiel, pas le dimanche, soirs OK" />
              <span class="hint">Claude en tient compte pour noter les offres et rédiger.</span>
            </label>
          {/if}
        </div>

        {#if !store.activeSources.length}
          <p class="banner note">Aucune source d'offres configurée : ajoute une clé France Travail ou Adzuna dans Paramètres pour recevoir des offres.</p>
        {/if}
        <div class="spread foot">
          <button class="btn" onclick={() => (step = 2)}>Retour</button>
          <button class="btn primary lg" disabled={!search.keywords.length || finishing} onclick={finish}>
            {#if finishing}<span class="spinner"></span>{/if}Voir les offres <Icon name="arrowRight" size={16} />
          </button>
        </div>
      {/if}
    </section>

    <aside class="side-note">
      <Icon name="lock" />
      <p>Tout reste sur ce PC. Seuls ton CV et les offres sont envoyés à Claude quand une analyse est lancée.</p>
    </aside>
  </div>
</div>

<style>
  .wrap { min-height: 100vh; padding: 40px 24px; display: flex; flex-direction: column; align-items: center; gap: 32px; }
  .top, .body { width: 100%; max-width: 1040px; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
  .steps { list-style: none; margin: 0; padding: 0; display: flex; gap: 8px; flex-wrap: wrap; font-size: 14px; }
  .st { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--panel); border: 1px solid var(--field); color: var(--ink-4); }
  .st.cur { background: var(--ink); border-color: var(--ink); color: var(--on-ink); font-weight: 600; }
  .st.done { background: var(--good-soft); border-color: var(--good-soft); color: var(--good); font-weight: 600; }
  .body { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  .main { flex: 999 1 560px; min-width: 0; padding: 32px; border-radius: 16px; }
  .lead { color: var(--ink-4); font-size: 15px; }
  .foot { border-top: 1px solid var(--line-soft); padding-top: 22px; }
  .drop { border: 1.5px dashed var(--field-strong); border-radius: 12px; padding: 28px; display: flex; gap: 12px; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-3); }
  .drop:hover { border-color: var(--accent); background: var(--accent-soft); }
  .drop:focus-within { outline: 2px solid var(--accent); }
  summary { cursor: pointer; font-weight: 600; font-size: 14px; }
  .summary { background: var(--bg); border-radius: 12px; padding: 18px; }
  dl { margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
  dt { color: var(--muted); font-size: 13px; }
  dd { margin: 0; }
  .stopgap { border: 1px solid var(--line); border-radius: 14px; padding: 18px; background: var(--side); }
  .toggle { align-items: flex-start; }
  .toggle input { margin-top: 3px; }
  .side-note { flex: 1 1 260px; display: flex; gap: 10px; align-items: flex-start; padding: 16px; border-radius: 12px; background: var(--sunken); font-size: 13px; color: var(--ink-3); }
</style>
