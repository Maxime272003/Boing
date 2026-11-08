<script lang="ts">
  import { store } from '$lib/store.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each store.toasts as t (t.id)}
    <div class="toast {t.kind}" role={t.kind === 'error' ? 'alert' : 'status'}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts { position: fixed; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 50; max-width: 420px; }
  .toast { padding: 12px 16px; border-radius: 10px; background: var(--ink); color: var(--on-ink); font-size: 14px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); }
  .toast.success { background: var(--good-ink); }
  .toast.error { background: #8f1d14; color: #fff; }
</style>
