<script lang="ts">
  import { tier } from '$lib/format';
  let { score, size = 64 }: { score: number | null | undefined; size?: number } = $props();
  const t = $derived(tier(score));
</script>

{#if t === 'none'}
  <div class="score none" style="width:{size}px;height:{size}px">non<br />analysée</div>
{:else}
  <div class="score {t}" style="width:{size}px;height:{size}px" aria-label="Match {score} %" role="img">
    <strong>{score}</strong><span>% match</span>
  </div>
{/if}

<style>
  .score { flex: none; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; text-align: center; }
  .score strong { font-family: 'Space Grotesk'; font-size: 22px; }
  .score span { font-size: 11px; font-weight: 600; margin-top: 3px; }
  .high { background: var(--good-soft); color: var(--good); }
  .mid { background: var(--warn-soft); color: var(--warn); }
  .low { background: var(--chip-muted); color: var(--ink-4); }
  .none { border: 1.5px dashed var(--field-strong); color: var(--muted); font-size: 11px; font-weight: 600; }
</style>
