<script lang="ts">
  import type { Application } from '$lib/types';
  import { bySource, groupStats, perWeek, type GroupStats } from '$lib/stats';

  let { apps }: { apps: Application[] } = $props();

  const groups = $derived(
    [
      { label: 'Toutes', stats: groupStats(apps) },
      { label: 'Mon métier', stats: groupStats(apps.filter((a) => a.kind !== 'stopgap')) },
      { label: 'Jobs alimentaires', stats: groupStats(apps.filter((a) => a.kind === 'stopgap')) }
    ].filter((g, i) => i === 0 || (apps.some((a) => a.kind === 'stopgap') && g.stats.sent > 0))
  );
  const sources = $derived(bySource(apps.filter((a) => a.status !== 'draft')));
  const weeks = $derived(perWeek(apps));
  const max = $derived(Math.max(1, ...weeks.map((w) => w.count)));
  const pct = (s: GroupStats) => (s.rate === null ? '—' : `${s.rate} %`);
</script>

<section class="card stack" style="--gap:18px" aria-labelledby="stats-title">
  <h2 id="stats-title">Statistiques</h2>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th scope="col"></th><th scope="col">Envoyées</th><th scope="col">Réponses</th><th scope="col">Taux de réponse</th><th scope="col">Entretiens</th><th scope="col">Délai moyen</th></tr></thead>
      <tbody>
        {#each groups as g}
          <tr data-testid="stats-row">
            <th scope="row">{g.label}</th><td>{g.stats.sent}</td><td>{g.stats.answered}</td><td><strong>{pct(g.stats)}</strong></td><td>{g.stats.interviews}</td><td>{g.stats.avgDays === null ? '—' : `${g.stats.avgDays} j`}</td>
          </tr>
        {/each}
        {#each sources as s}
          <tr class="sub"><th scope="row">via {s.source}</th><td>{s.stats.sent}</td><td>{s.stats.answered}</td><td>{pct(s.stats)}</td><td>{s.stats.interviews}</td><td>{s.stats.avgDays === null ? '—' : `${s.stats.avgDays} j`}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="stack" style="--gap:8px">
    <h3>Candidatures envoyées par semaine</h3>
    <div class="weeks" role="img" aria-label="Candidatures envoyées par semaine : {weeks.map((w) => `${w.label} ${w.count}`).join(', ')}">
      {#each weeks as w}
        <div class="week">
          <span class="n">{w.count || ''}</span>
          <div class="bar" style="height:{Math.round((w.count / max) * 100)}%"></div>
          <span class="l">{w.label}</span>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 560px; }
  th, td { text-align: left; padding: 8px 10px 8px 0; border-top: 1px solid var(--line-soft); font-weight: 400; }
  thead th { border-top: 0; color: var(--muted); font-size: 12px; font-weight: 600; }
  tbody th { font-weight: 600; }
  tr.sub th, tr.sub td { color: var(--muted); font-size: 13px; }
  .weeks { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; height: 140px; align-items: end; }
  .week { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
  .bar { width: 100%; max-width: 44px; min-height: 2px; background: var(--accent-bg); border-radius: 4px 4px 0 0; }
  .n { font-size: 12px; font-weight: 600; }
  .l { font-size: 11px; color: var(--muted); white-space: nowrap; }
</style>
