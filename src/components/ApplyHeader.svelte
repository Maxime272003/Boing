<script lang="ts">
  import { href } from '$lib/router.svelte';
  import { cleanTitle } from '$lib/format';
  import type { Application } from '$lib/types';
  import Icon from './Icon.svelte';

  let { app, step }: { app: Application; step: 'cv' | 'lettre' | 'envoi' } = $props();
  const steps = [
    { id: 'cv', label: '1. CV' },
    { id: 'lettre', label: '2. Lettre' },
    { id: 'envoi', label: '3. Envoi' }
  ] as const;
  const order = { cv: 0, lettre: 1, envoi: 2 };
  const done = (id: 'cv' | 'lettre' | 'envoi') =>
    (id === 'cv' && app.cvChanges.length > 0 && order[step] > 0) || (id === 'lettre' && !!app.letter && order[step] > 1);
</script>

<header class="page-head">
  <div class="stack" style="--gap:6px">
    <a href={href(`/offres/${app.offerId}`)} class="back">← {cleanTitle(app.offer.title)} · {app.offer.company}</a>
    <h1>Préparer la candidature</h1>
  </div>
  <ol class="steps" aria-label="Étapes de la candidature">
    {#each steps as s}
      <li>
        <a
          href={href(`/candidature/${app.id}/${s.id}`)}
          class="step"
          class:current={s.id === step}
          class:done={done(s.id)}
          aria-current={s.id === step ? 'step' : undefined}
        >
          {#if done(s.id)}<Icon name="check" size={14} stroke={2.5} />{/if}{s.label}
        </a>
      </li>
    {/each}
  </ol>
</header>

<style>
  .back { font-size: 13px; font-weight: 600; text-decoration: none; }
  .steps { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; font-size: 14px; }
  .step { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 999px; background: #fff; border: 1px solid var(--field); color: var(--ink-3); text-decoration: none; }
  .step.done { background: var(--good-soft); border-color: var(--good-soft); color: var(--good); font-weight: 600; }
  .step.current { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 600; }
</style>
