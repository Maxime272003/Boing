import { describe, expect, it } from 'vitest';
import { answerDelay, bySource, groupStats, perWeek } from '../src/lib/stats';
import type { Application } from '../src/lib/types';

const day = (n: number) => new Date(Date.UTC(2026, 10, 2 + n, 10)).toISOString();
const app = (over: Partial<Application>): Application =>
  ({ id: Math.random().toString(), kind: 'career', status: 'sent', sentAt: day(0), offer: { source: 'France Travail' }, history: [], ...over }) as Application;

describe('statistiques', () => {
  const apps = [
    app({ status: 'interview', history: [{ at: day(4), label: 'Statut : Entretien' }] }),
    app({ status: 'closed', outcome: 'refus', history: [{ at: day(2), label: 'Statut : Clôturée' }], offer: { source: 'Adzuna' } as any }),
    app({ status: 'closed', outcome: 'sans_reponse', history: [{ at: day(30), label: 'Statut : Clôturée' }] }),
    app({ status: 'sent', kind: 'stopgap' }),
    app({ status: 'draft', sentAt: undefined })
  ];
  it('calcule taux de réponse et délai', () => {
    const s = groupStats(apps);
    expect(s).toEqual({ sent: 4, answered: 2, interviews: 1, rate: 50, avgDays: 3 });
    expect(answerDelay(apps[2])).toBeNull();
  });
  it('détaille par source', () => {
    const r = bySource(apps.filter((a) => a.status !== 'draft'));
    expect(r[0]).toMatchObject({ source: 'France Travail', stats: { sent: 3, answered: 1 } });
    expect(r[1]).toMatchObject({ source: 'Adzuna', stats: { rate: 100 } });
  });
  it('compte par semaine', () => {
    const w = perWeek(apps, 4, new Date(day(6)));
    expect(w).toHaveLength(4);
    expect(w[3].count).toBe(4);
    expect(w.slice(0, 3).every((x) => x.count === 0)).toBe(true);
  });
});
