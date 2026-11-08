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

/** Applique au CV de base les modifications acceptées. Les ajouts passent après les remplacements. */
export function applyChanges(p: Profile, changes: CvChange[]): CvContent {
  const cv = baseCv(p);
  const accepted = changes.filter((c) => c.accepted);
  for (const { op } of accepted) {
    if (op.kind === 'title') cv.title = op.value;
    if (op.kind === 'summary') cv.summary = op.value;
    if (op.kind === 'skills') {
      const rest = cv.skills.filter((s) => !op.value.includes(s));
      cv.skills = [...op.value, ...rest];
    }
    if (op.kind === 'bullet' && op.index !== null && cv.experiences[op.exp]) {
      cv.experiences[op.exp].bullets[op.index] = op.value;
    }
  }
  for (const { op } of accepted) {
    if (op.kind === 'bullet' && op.index === null && cv.experiences[op.exp]) {
      cv.experiences[op.exp].bullets.push(op.value);
    }
  }
  // Les missions masquées sont retirées en dernier (par index d'origine, de la fin vers le début).
  const hidden = accepted
    .map((c) => c.op)
    .filter((op): op is Extract<typeof op, { kind: 'hide_bullet' }> => op.kind === 'hide_bullet')
    .sort((a, b) => b.index - a.index);
  for (const op of hidden) cv.experiences[op.exp]?.bullets.splice(op.index, 1);
  return cv;
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
