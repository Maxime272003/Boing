/** Extrait le premier objet JSON d'une réponse (tolère ```json … ``` et du texte autour). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Réponse de Claude illisible (pas de JSON).');
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    throw new Error('Réponse de Claude illisible (JSON invalide).');
  }
}

export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
export const strList = (v: unknown, max = 50): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()).slice(0, max) : [];
