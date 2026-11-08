const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function ago(iso?: string | null): string {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function dateTime(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function cleanTitle(t: string): string {
  return t.replace(/\s*\((h\/f|f\/h)\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

export type Tier = 'high' | 'mid' | 'low' | 'none';

export function tier(score: number | null | undefined): Tier {
  if (score === null || score === undefined) return 'none';
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

export const tierLabel: Record<Tier, string> = {
  high: 'Très bon match',
  mid: 'Match correct',
  low: 'Match faible',
  none: 'Non analysée'
};

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat('fr-FR', { notation: n >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
}
