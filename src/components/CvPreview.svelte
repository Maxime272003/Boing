<script lang="ts">
  import type { CvContent } from '$lib/types';
  let { cv, changed = new Set<string>(), removed = new Set<string>(), accent = false }: { cv: CvContent; changed?: Set<string>; removed?: Set<string>; accent?: boolean } = $props();
  const mark = (key: string) => (changed.has(key) ? 'ins' : removed.has(key) ? 'del' : '');
</script>

<div class="cv" class:accent>
  <div><strong class="name">{cv.fullName || 'Ton nom'}</strong><br /><span class={mark('title')}>{cv.title}</span></div>
  {#if cv.summary}<div><strong class="h">Profil</strong><br /><span class={mark('summary')}>{cv.summary}</span></div>{/if}
  {#if cv.experiences.length}
    <div>
      <strong class="h">Expérience</strong>
      {#each cv.experiences as e, i}
        <div class="exp">
          {e.role} — {e.company}{#if e.start}, {e.start}–{e.end}{/if}
          <ul>
            {#each e.bullets as b, j}<li><span class={mark(`b-${i}-${j}`)}>{b}</span></li>{/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
  {#if cv.skills.length}<div><strong class="h">Compétences</strong><br /><span class={mark('skills')}>{cv.skills.join(', ')}</span></div>{/if}
  {#if cv.languages.length}<div><strong class="h">Langues</strong><br />{cv.languages.join(', ')}</div>{/if}
</div>

<style>
  .cv { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 26px; font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; gap: 14px; color: var(--ink-3); }
  .cv.accent { border: 2px solid var(--accent); padding: 25px; }
  .name { font-size: 18px; color: var(--ink); }
  .h { color: var(--ink); }
  .exp { margin-top: 2px; }
  ul { margin: 2px 0 0; padding-left: 18px; }
</style>
