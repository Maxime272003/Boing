<script lang="ts">
  import type { CvContent } from '$lib/types';
  import type { EditTarget } from '$lib/cv';

  let {
    cv,
    changed = new Set<string>(),
    removed = new Set<string>(),
    accent = false,
    onedit
  }: {
    cv: CvContent;
    changed?: Set<string>;
    removed?: Set<string>;
    accent?: boolean;
    /** Si présent, les textes deviennent modifiables d'un clic. */
    onedit?: (target: EditTarget, value: string) => void;
  } = $props();

  const mark = (key: string) => (changed.has(key) ? 'ins' : removed.has(key) ? 'del' : '');
  let editing = $state<string | null>(null);
  let draft = $state('');

  function start(key: string, value: string) {
    editing = key;
    draft = value;
  }
  function save(target: EditTarget) {
    if (draft.trim()) onedit?.(target, draft);
    editing = null;
  }
</script>

{#snippet text(key: string, value: string, target: EditTarget, label: string)}
  {#if onedit && editing === key}
    <span class="editor">
      <textarea class="textarea" rows={Math.max(2, Math.ceil(value.length / 48))} aria-label={label} bind:value={draft}
        onkeydown={(e) => {
          if (e.key === 'Escape') editing = null;
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(target);
        }}></textarea>
      <span class="row" style="--gap:6px">
        <button type="button" class="btn sm" onclick={() => (editing = null)}>Annuler</button>
        <button type="button" class="btn sm primary" onclick={() => save(target)}>Enregistrer</button>
      </span>
    </span>
  {:else if onedit}
    <button type="button" class="editable {mark(key)}" title="Cliquer pour modifier" aria-label="{label} : {value}" onclick={() => start(key, value)}>{value}</button>
  {:else}
    <span class={mark(key)}>{value}</span>
  {/if}
{/snippet}

<div class="cv" class:accent>
  <div><strong class="name">{cv.fullName || 'Ton nom'}</strong><br />{@render text('title', cv.title, { kind: 'title' }, 'Modifier l’intitulé')}</div>
  {#if cv.summary}<div><strong class="h">Profil</strong><br />{@render text('summary', cv.summary, { kind: 'summary' }, 'Modifier l’accroche')}</div>{/if}
  {#if cv.experiences.length}
    <div>
      <strong class="h">Expérience</strong>
      {#each cv.experiences as e, i}
        <div class="exp">
          {e.role} — {e.company}{#if e.start}, {e.start}–{e.end}{/if}
          <ul>
            {#each e.bullets as b, j}<li>{@render text(`b-${i}-${j}`, b, { kind: 'bullet', exp: i, pos: j }, 'Modifier la mission')}</li>{/each}
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
  .editable { all: unset; cursor: text; border-radius: 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .editable:hover { outline: 1px dashed var(--accent); outline-offset: 2px; }
  .editable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .editor { display: flex; flex-direction: column; gap: 6px; margin: 4px 0; }
</style>
