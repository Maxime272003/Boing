<script lang="ts">
  import Icon from './Icon.svelte';
  let {
    values = $bindable(),
    label,
    placeholder = 'Ajouter…',
    suggestions = []
  }: { values: string[]; label: string; placeholder?: string; suggestions?: string[] } = $props();
  let draft = $state('');
  const inputId = `chips-${Math.random().toString(36).slice(2, 8)}`;
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) values = [...values, t];
    draft = '';
  };
  const left = $derived(suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())));
</script>

<div class="field">
  <label for={inputId}>{label}</label>
  <div class="row" style="--gap:8px; font-weight:400">
    {#each values as v, i (v)}
      <span class="chip soft" aria-pressed="true">
        {v}
        <button type="button" class="x" aria-label="Retirer {v}" onclick={() => (values = values.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
      </span>
    {/each}
    <input
      id={inputId}
      class="input"
      style="width:220px;height:36px;border-radius:999px"
      {placeholder}
      bind:value={draft}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          add(draft);
        }
      }}
      onblur={() => draft && add(draft)}
    />
  </div>
  {#if left.length}
    <div class="row hint" style="--gap:6px">
      Suggestions :
      {#each left as s}
        <button type="button" class="chip small dashed" style="cursor:pointer" onclick={() => add(s)}>+ {s}</button>
      {/each}
    </div>
  {/if}
</div>
