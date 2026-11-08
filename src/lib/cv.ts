import type { CvChange, CvContent, Profile } from './types';

export function fullName(p: Pick<Profile, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function baseCv(p: Profile): CvContent {
  return {
    fullName: fullName(p),
    title: p.title,
    contact: [p.city, p.phone, p.email, p.drivingLicense ? 'Permis B' : ''].filter(Boolean),
    summary: p.summary,
    experiences: p.experiences.map((e) => ({ ...e, bullets: [...e.bullets] })),
    education: p.education.map((e) => ({ ...e })),
    skills: [...p.skills],
    languages: [...p.languages]
  };
}

/** D'où vient chaque texte du CV adapté : utile pour le modifier directement dans l'aperçu. */
export interface CvTrace {
  title: string | null;
  summary: string | null;
  bullets: { orig: number | null; changeId: string | null }[][];
}

/** Applique au CV de base les modifications acceptées, en gardant la trace de leur origine. */
export function applyChangesTraced(p: Profile, changes: CvChange[]): { cv: CvContent; trace: CvTrace } {
  const cv = baseCv(p);
  const trace: CvTrace = { title: null, summary: null, bullets: [] };
  const rows = cv.experiences.map((e) => e.bullets.map((text, j) => ({ text, orig: j as number | null, changeId: null as string | null })));
  const accepted = changes.filter((c) => c.accepted);
  for (const c of accepted) {
    const op = c.op;
    if (op.kind === 'title') {
      cv.title = op.value;
      trace.title = c.id;
    }
    if (op.kind === 'summary') {
      cv.summary = op.value;
      trace.summary = c.id;
    }
    if (op.kind === 'skills') {
      const rest = cv.skills.filter((s) => !op.value.includes(s));
      cv.skills = [...op.value, ...rest];
    }
    if (op.kind === 'bullet' && op.index !== null && rows[op.exp]?.[op.index]) {
      rows[op.exp][op.index] = { text: op.value, orig: op.index, changeId: c.id };
    }
  }
  // Les ajouts passent après les remplacements
  for (const c of accepted) {
    if (c.op.kind === 'bullet' && c.op.index === null && rows[c.op.exp]) {
      rows[c.op.exp].push({ text: c.op.value, orig: null, changeId: c.id });
    }
  }
  // Les missions masquées sont retirées en dernier
  for (const c of accepted) {
    const op = c.op;
    if (op.kind === 'hide_bullet' && rows[op.exp]) {
      rows[op.exp] = rows[op.exp].filter((r) => r.orig !== op.index);
    }
  }
  cv.experiences.forEach((e, i) => (e.bullets = rows[i].map((r) => r.text)));
  trace.bullets = rows.map((r) => r.map(({ orig, changeId }) => ({ orig, changeId })));
  return { cv, trace };
}

export function applyChanges(p: Profile, changes: CvChange[]): CvContent {
  return applyChangesTraced(p, changes).cv;
}

export type EditTarget = { kind: 'title' } | { kind: 'summary' } | { kind: 'bullet'; exp: number; pos: number };

/**
 * Modification faite à la main dans l'aperçu : on met à jour la modification existante
 * qui a produit ce texte, ou on en crée une nouvelle.
 */
export function editAt(p: Profile, changes: CvChange[], target: EditTarget, value: string): CvChange[] {
  const v = value.trim();
  const { trace } = applyChangesTraced(p, changes);
  const next = changes.map((c) => ({ ...c, op: { ...c.op } as CvChange['op'] }));
  const update = (id: string | null) => {
    const c = next.find((x) => x.id === id);
    if (!c || c.op.kind === 'skills' || c.op.kind === 'hide_bullet') return false;
    c.op.value = v;
    c.accepted = true;
    return true;
  };
  const manual = (op: CvChange['op']): CvChange => ({
    id: `m${Date.now().toString(36)}${next.length}`,
    title: 'Modifié à la main',
    why: 'Ta propre formulation.',
    op,
    accepted: true
  });
  if (target.kind === 'title' || target.kind === 'summary') {
    if (!update(trace[target.kind])) next.push(manual({ kind: target.kind, value: v }));
    return next;
  }
  const entry = trace.bullets[target.exp]?.[target.pos];
  if (!entry) return next;
  if (entry.changeId && update(entry.changeId)) return next;
  if (entry.orig !== null) next.push(manual({ kind: 'bullet', exp: target.exp, index: entry.orig, value: v }));
  return next;
}

/** Ce qu'une modification remplace dans le CV d'origine (pour l'affichage avant/après). */
export function beforeOf(p: Profile, c: CvChange): string {
  const op = c.op;
  switch (op.kind) {
    case 'title':
      return p.title;
    case 'summary':
      return p.summary;
    case 'skills':
      return p.skills.join(', ');
    case 'bullet':
      return op.index === null ? '' : (p.experiences[op.exp]?.bullets[op.index] ?? '');
    case 'hide_bullet':
      return p.experiences[op.exp]?.bullets[op.index] ?? '';
  }
}

export function afterOf(c: CvChange): string {
  if (c.op.kind === 'skills') return c.op.value.join(', ');
  if (c.op.kind === 'hide_bullet') return '';
  return c.op.value;
}
