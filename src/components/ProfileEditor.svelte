<script lang="ts">
  import type { Profile } from '$lib/types';
  import ChipsInput from './ChipsInput.svelte';
  import Icon from './Icon.svelte';

  let { profile = $bindable() }: { profile: Profile } = $props();

  const bulletsText = (i: number) => profile.experiences[i].bullets.join('\n');
  const setBullets = (i: number, v: string) =>
    (profile.experiences[i].bullets = v.split('\n').map((x) => x.trim()).filter(Boolean));
</script>

<div class="stack" style="--gap:20px">
  <div class="grid3">
    <label class="field">Prénom<input class="input" bind:value={profile.firstName} /></label>
    <label class="field">Nom<input class="input" bind:value={profile.lastName} /></label>
    <label class="field">Intitulé<input class="input" bind:value={profile.title} /></label>
    <label class="field">E-mail<input class="input" type="email" bind:value={profile.email} /></label>
    <label class="field">Téléphone<input class="input" bind:value={profile.phone} /></label>
    <label class="field">Ville<input class="input" bind:value={profile.city} /></label>
  </div>
  <label class="field">Accroche du CV<textarea class="textarea" rows="2" bind:value={profile.summary}></textarea></label>

  <div class="grid2">
    <label class="field">Métier visé<input class="input" bind:value={profile.careerGoal} placeholder="ex. Concept artist" /></label>
    <label class="field">Contraintes pour un job alimentaire<input class="input" bind:value={profile.stopgapConstraints} placeholder="ex. temps partiel, pas le dimanche" /></label>
  </div>
  <ChipsInput bind:values={profile.stopgapJobs} label="Jobs alimentaires envisagés" placeholder="ex. Vendeuse" />

  <ChipsInput bind:values={profile.skills} label="Compétences confirmées (Claude n'utilise que celles-ci)" placeholder="Ajouter une compétence" />
  <ChipsInput bind:values={profile.languages} label="Langues" placeholder="ex. Anglais (B2)" />

  <div class="grid2">
    <label class="field">Disponibilité<input class="input" bind:value={profile.availability} placeholder="ex. Immédiate" /></label>
    <label class="check" style="align-self:end"><input type="checkbox" bind:checked={profile.drivingLicense} /> Permis B</label>
  </div>

  <div class="stack" style="--gap:12px">
    <div class="spread"><h3>Expériences</h3>
      <button type="button" class="btn sm" onclick={() => (profile.experiences = [...profile.experiences, { role: '', company: '', start: '', end: '', bullets: [] }])}><Icon name="plus" size={16} />Ajouter</button>
    </div>
    {#each profile.experiences as exp, i}
      <fieldset class="exp">
        <legend class="sr-only">Expérience {i + 1}</legend>
        <div class="grid2">
          <label class="field">Poste<input class="input" bind:value={exp.role} /></label>
          <label class="field">Entreprise<input class="input" bind:value={exp.company} /></label>
          <label class="field">Début<input class="input" bind:value={exp.start} /></label>
          <label class="field">Fin<input class="input" bind:value={exp.end} /></label>
        </div>
        <label class="field">Missions (une par ligne)
          <textarea class="textarea" rows="4" value={bulletsText(i)} onchange={(e) => setBullets(i, e.currentTarget.value)}></textarea>
        </label>
        <button type="button" class="btn sm danger" onclick={() => (profile.experiences = profile.experiences.filter((_, j) => j !== i))}><Icon name="trash" size={16} />Retirer</button>
      </fieldset>
    {/each}
  </div>

  <div class="stack" style="--gap:12px">
    <div class="spread"><h3>Formation</h3>
      <button type="button" class="btn sm" onclick={() => (profile.education = [...profile.education, { degree: '', school: '', year: '' }])}><Icon name="plus" size={16} />Ajouter</button>
    </div>
    {#each profile.education as ed, i}
      <div class="grid3" style="align-items:end">
        <label class="field">Diplôme<input class="input" bind:value={ed.degree} /></label>
        <label class="field">École<input class="input" bind:value={ed.school} /></label>
        <div class="row" style="flex-wrap:nowrap"><label class="field grow">Année<input class="input" bind:value={ed.year} /></label>
          <button type="button" class="btn icon-btn" aria-label="Retirer la formation" onclick={() => (profile.education = profile.education.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .exp { border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 0; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .exp > * { width: 100%; }
  .exp > button { width: auto; }
</style>
