// Statistiques de suivi : où les candidatures donnent-elles des réponses ?
import type { Application } from './types';

export interface GroupStats {
  sent: number;
  answered: number;
  interviews: number;
  rate: number | null; // % de réponses
  avgDays: number | null; // délai moyen avant réponse
}

const RESPONSE_LABELS = ['Statut : Entretien', 'Statut : Clôturée'];

export function hasAnswer(a: Application): boolean {
  return a.status === 'interview' || (a.status === 'closed' && !!a.outcome && a.outcome !== 'sans_reponse');
}

/** Jours entre l'envoi et le premier changement de statut qui marque une réponse. */
export function answerDelay(a: Application): number | null {
  if (!a.sentAt || !hasAnswer(a)) return null;
  const sent = new Date(a.sentAt).getTime();
  const step = a.history.find((h) => RESPONSE_LABELS.includes(h.label) && new Date(h.at).getTime() >= sent);
  if (!step) return null;
  return Math.max(0, Math.round((new Date(step.at).getTime() - sent) / 86400_000));
}

export function groupStats(apps: Application[]): GroupStats {
  const sent = apps.filter((a) => a.status !== 'draft');
  const answered = sent.filter(hasAnswer);
  const delays = answered.map(answerDelay).filter((d): d is number => d !== null);
  return {
    sent: sent.length,
    answered: answered.length,
    interviews: sent.filter((a) => a.status === 'interview' || a.outcome === 'accepte').length,
    rate: sent.length ? Math.round((answered.length / sent.length) * 100) : null,
    avgDays: delays.length ? Math.round(delays.reduce((x, y) => x + y, 0) / delays.length) : null
  };
}

export function bySource(apps: Application[]): { source: string; stats: GroupStats }[] {
  const sources = [...new Set(apps.map((a) => a.offer.source || 'Autre'))];
  return sources.map((source) => ({ source, stats: groupStats(apps.filter((a) => (a.offer.source || 'Autre') === source)) })).sort((a, b) => b.stats.sent - a.stats.sent);
}

/** Candidatures envoyées par semaine (lundi), sur les N dernières semaines, de la plus ancienne à la plus récente. */
export function perWeek(apps: Application[], weeks = 8, now = new Date()): { label: string; count: number }[] {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const out: { label: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = apps.filter((a) => a.sentAt && new Date(a.sentAt) >= start && new Date(a.sentAt) < end).length;
    out.push({ label: start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), count });
  }
  return out;
}
