<script lang="ts">
  import { store, emptyProfile, newId } from '$lib/store.svelte';
  import { href } from '$lib/router.svelte';
  import { parseCv } from '$lib/ai/engine';
  import { extractText } from '$lib/pdf/extract';
  import { cleanTitle, shortDate } from '$lib/format';
  import type { LetterTemplate, Profile, Search } from '$lib/types';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import ProfileEditor from '../components/ProfileEditor.svelte';
  import SearchEditor from '../components/SearchEditor.svelte';

  let editingProfile = $state<Profile | null>(null);
  let reading = $state(false);
  let letter = $state<LetterTemplate | null>(null);
  let search = $state<Search | null>(null);

  const p = $derived(store.profile ?? emptyProfile());
  const generated = $derived(store.applications.filter((a) => a.files?.cv));

  async function replaceCv(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    reading = true;
    try {
      const text = await extractText(file);
      if (store.aiReady) {
        const parsed = await parseCv(store.aiContext(), text);
        editingProfile = { ...emptyProfile(), ...parsed, cvText: text, cvFileName: file.name };
      } else {
        editingProfile = { ...structuredClone($state.snapshot(p)), cvText: text, cvFileName: file.name };
      }
    } catch (err) {
      store.toast(store.errorText(err), 'error');
    } finally {
      reading = false;
    }
  }

  async function saveProfile() {
    if (!editingProfile) return;
    await store.saveProfile(editingProfile);
    editingProfile = null;
    store.toast('Fiche profil enregistrée', 'success');
  }

  function newSearch(): Search {
    return { id: newId('s-'), name: '', keywords: [], city: null, distanceKm: 30, contracts: ['CDI', 'CDD'], fullTime: null, salaryMin: null, sources: ['france_travail', 'adzuna'], active: true };
  }

  async function saveSearch() {
    if (!search) return;
    if (!search.name.trim()) search.name = search.keywords.slice(0, 2).join(', ') + (search.city ? ` · ${search.city.name}` : '');
    await store.saveSearch(search);
    search = null;
  }

  async function saveLetter() {
    if (!letter || !letter.name.trim()) return;
    await store.saveLetterTemplate(letter);
    letter = null;
  }

  const contractsLabel = (s: Search) => (s.contracts.length ? s.contracts.join(', ').replace('MIS', 'intérim') : 'tous contrats');
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Mes documents</h1>
      <p class="meta">Ce que Claude a le droit d'utiliser pour adapter tes candidatures.</p>
    </div>
  </header>

  <div class="cols">
    <div class="stack" style="--gap:20px; flex:1 1 440px; min-width:0">
      <section class="card stack" style="--gap:14px" aria-labelledby="cvb">
        <h2 id="cvb">CV de base</h2>
        <div class="row" style="--gap:14px">
          <div class="pdf-thumb" aria-hidden="true">PDF</div>
          <div class="grow stack" style="--gap:2px"><strong style="font-size:14px">{p.cvFileName ?? 'Aucun fichier'}</strong><span class="meta">{p.cvText ? `${p.cvText.length.toLocaleString('fr-FR')} caractères lus` : 'Fiche remplie à la main'}</span></div>
        </div>
        <label class="drop">
          {#if reading}<span class="spinner"></span> Lecture du CV…{:else}<Icon name="upload" size={18} />Remplacer par un nouveau CV (PDF ou .txt){/if}
          <input type="file" class="sr-only" accept=".pdf,.txt" onchange={replaceCv} />
        </label>
      </section>

      <section class="card stack" style="--gap:14px" aria-labelledby="fp">
        <div class="spread"><h2 id="fp">Fiche profil</h2><button class="btn sm" onclick={() => (editingProfile = structuredClone($state.snapshot(p)))}><Icon name="edit" size={15} />Modifier</button></div>
        <p style="font-size:14px;color:var(--ink-3)">Les compétences et expériences confirmées. Claude peut les mettre en avant, mais <strong>n'ajoute jamais rien qui n'est pas ici</strong>.</p>
        <div class="field">Compétences confirmées
          <div class="row" style="--gap:6px; font-weight:400">{#each p.skills as s}<span class="chip small">{s}</span>{:else}<span class="meta">Aucune</span>{/each}</div>
        </div>
        <div class="field">Expériences
          <ul class="list" style="font-weight:400;font-size:14px;color:var(--ink-2)">{#each p.experiences as e}<li>{e.role} — {e.company} ({e.start}–{e.end})</li>{/each}</ul>
        </div>
        <div class="grid2" style="font-size:14px">
          <span>Disponibilité : {p.availability || '—'}</span><span>{p.drivingLicense ? 'Permis B' : 'Pas de permis indiqué'}</span>
          <span>Téléphone : {p.phone || '—'}</span><span>E-mail : {p.email || '—'}</span>
        </div>
      </section>
    </div>

    <div class="stack" style="--gap:20px; flex:1 1 440px; min-width:0">
      <section class="card stack" style="--gap:10px" aria-labelledby="rs">
        <div class="spread"><h2 id="rs">Recherches enregistrées</h2><button class="btn sm" onclick={() => (search = newSearch())}><Icon name="plus" size={15} />Nouvelle</button></div>
        <ul class="list">
          {#each store.searches as s (s.id)}
            <li class="item">
              <div class="grow"><strong>{s.name || s.keywords.join(', ')}</strong><br /><span class="meta">{s.city?.name ?? 'Toute la France'} · {s.distanceKm} km · {contractsLabel(s)}{s.lastRunAt ? ` · collectée le ${shortDate(s.lastRunAt)}` : ''}</span></div>
              <label class="check"><input type="checkbox" checked={s.active} onchange={() => store.saveSearch({ ...$state.snapshot(s), active: !s.active })} />Active</label>
              <button class="btn sm icon-btn" style="width:34px" aria-label="Modifier « {s.name} »" onclick={() => (search = structuredClone($state.snapshot(s)))}><Icon name="edit" size={15} /></button>
              <button class="btn sm icon-btn" style="width:34px" aria-label="Supprimer « {s.name} »" onclick={() => store.deleteSearch(s.id)}><Icon name="trash" size={15} /></button>
            </li>
          {:else}
            <li class="meta">Aucune recherche.</li>
          {/each}
        </ul>
      </section>

      <section class="card stack" style="--gap:10px" aria-labelledby="lm">
        <div class="spread"><h2 id="lm">Lettres modèles</h2><button class="btn sm" onclick={() => (letter = { id: newId('l-'), name: '', text: '', isDefault: store.letters.length === 0, uses: 0 })}><Icon name="plus" size={15} />Nouvelle</button></div>
        <p class="meta">Claude garde la structure et le ton de ta lettre modèle quand il l'adapte.</p>
        <ul class="list">
          {#each store.letters as l (l.id)}
            <li class="item">
              <div class="grow"><strong>{l.name}</strong><br /><span class="meta">Utilisée {l.uses} fois</span></div>
              {#if l.isDefault}<span class="badge">Par défaut</span>{/if}
              <button class="btn sm" onclick={() => (letter = structuredClone($state.snapshot(l)))}>Ouvrir</button>
              <button class="btn sm icon-btn" style="width:34px" aria-label="Supprimer « {l.name} »" onclick={() => store.deleteLetterTemplate(l.id)}><Icon name="trash" size={15} /></button>
            </li>
          {:else}
            <li class="meta">Aucune lettre modèle.</li>
          {/each}
        </ul>
      </section>

      <section class="card stack" style="--gap:10px" aria-labelledby="dg">
        <h2 id="dg">Documents générés</h2>
        {#if generated.length}
          <div style="overflow-x:auto">
            <table>
              <thead><tr><th>Offre</th><th>Date</th><th>Fichiers</th></tr></thead>
              <tbody>
                {#each generated as a (a.id)}
                  <tr>
                    <td>{a.offer.company}<br /><span class="meta">{cleanTitle(a.offer.title)}</span></td>
                    <td>{shortDate(a.sentAt ?? a.createdAt)}</td>
                    <td class="row" style="--gap:6px">
                      <button class="btn sm" onclick={() => store.backend.openFile(a.files!.cv!)}>CV</button>
                      {#if a.files?.letter}<button class="btn sm" onclick={() => store.backend.openFile(a.files!.letter!)}>Lettre</button>{/if}
                      <button class="btn sm icon-btn" style="width:34px" aria-label="Ouvrir le dossier" onclick={() => store.backend.reveal(a.files!.cv!)}><Icon name="folder" size={15} /></button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="meta">Les PDF apparaissent ici après l'envoi d'une candidature. <a href={href('/offres')}>Voir les offres</a></p>
        {/if}
      </section>
    </div>
  </div>
</div>

{#if editingProfile}
  <Modal title="Fiche profil" onclose={() => (editingProfile = null)}>
    <div class="scroll"><ProfileEditor bind:profile={editingProfile} /></div>
    {#snippet actions()}
      <button class="btn" onclick={() => (editingProfile = null)}>Annuler</button>
      <button class="btn primary" onclick={saveProfile}>Enregistrer</button>
    {/snippet}
  </Modal>
{/if}

{#if search}
  <Modal title="Recherche" onclose={() => (search = null)}>
    <div class="scroll stack">
      <label class="field">Nom<input class="input" bind:value={search.name} placeholder="ex. Administratif · Lyon" /></label>
      <SearchEditor bind:search suggestions={p.suggestedJobs} />
    </div>
    {#snippet actions()}
      <button class="btn" onclick={() => (search = null)}>Annuler</button>
      <button class="btn primary" disabled={!search?.keywords.length} onclick={saveSearch}>Enregistrer</button>
    {/snippet}
  </Modal>
{/if}

{#if letter}
  <Modal title="Lettre modèle" onclose={() => (letter = null)}>
    <label class="field">Nom<input class="input" bind:value={letter.name} placeholder="ex. Lettre accueil / administratif" /></label>
    <label class="field">Texte<textarea class="textarea" rows="12" bind:value={letter.text}></textarea></label>
    <label class="check"><input type="checkbox" bind:checked={letter.isDefault} />Utiliser par défaut</label>
    {#snippet actions()}
      <button class="btn" onclick={() => (letter = null)}>Annuler</button>
      <button class="btn primary" disabled={!letter?.name.trim()} onclick={saveLetter}>Enregistrer</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .pdf-thumb { width: 52px; height: 64px; border-radius: 6px; background: #f1f1ec; border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--bad); flex: none; }
  .drop { border: 1.5px dashed #c9c9c2; border-radius: 10px; padding: 16px; display: flex; gap: 10px; align-items: center; justify-content: center; font-size: 14px; color: #52525b; cursor: pointer; }
  .drop:hover, .drop:focus-within { border-color: var(--accent); background: var(--accent-soft); }
  .item { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); font-size: 14px; flex-wrap: wrap; }
  .item:last-child { border-bottom: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 380px; }
  th { text-align: left; color: var(--muted); font-size: 12px; font-weight: 600; padding: 8px 0; }
  td { padding: 10px 0; border-top: 1px solid var(--line-soft); vertical-align: top; }
  .scroll { max-height: 64vh; overflow-y: auto; padding-right: 6px; }
</style>
