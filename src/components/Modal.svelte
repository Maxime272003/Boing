<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, onclose, children, actions }: { title: string; onclose: () => void; children: Snippet; actions?: Snippet } = $props();
  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
  });
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="modal-title">
  <div class="stack">
    <h2 id="modal-title">{title}</h2>
    {@render children()}
    <div class="row" style="justify-content:flex-end">
      {#if actions}{@render actions()}{/if}
    </div>
  </div>
</dialog>

<style>
  dialog { border: 0; border-radius: 16px; padding: 24px; width: min(640px, calc(100vw - 32px)); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25); }
  dialog::backdrop { background: rgba(24, 24, 27, 0.4); }
</style>
