<script lang="ts">
  import { tier } from '$lib/format';
  let { score }: { score: number } = $props();
  const color = $derived({ high: '#1e7a46', mid: '#b7791f', low: '#71717a', none: '#71717a' }[tier(score)]);
</script>

<div class="ring" role="img" aria-label="Match {score} %" style="background: conic-gradient({color} 0 {score}%, var(--line) {score}% 100%)">
  <div class="inner" style="color:{color}">{score}</div>
</div>

<style>
  .ring { width: 84px; height: 84px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
  .inner { width: 66px; height: 66px; border-radius: 50%; background: var(--panel); display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk'; font-weight: 700; font-size: 24px; }
</style>
