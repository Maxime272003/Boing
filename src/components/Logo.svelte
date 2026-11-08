<script lang="ts">
  let { size = 30 }: { size?: number } = $props();
</script>

<span class="logo" role="img" aria-label="Boing" style="font-size:{size}px">
  <span aria-hidden="true">b</span><span class="ball" aria-hidden="true"></span><span aria-hidden="true">ing</span>
</span>

<style>
  .logo { display: inline-flex; align-items: flex-end; font-family: Fredoka, sans-serif; font-weight: 700; line-height: 1; color: var(--ink); letter-spacing: -0.01em; }
  .ball { width: 0.56em; height: 0.56em; border-radius: 50%; background: var(--ball); margin: 0 1px; transform: translateY(-0.46em); flex: none; }
</style>
