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
  }
}

export function afterOf(c: CvChange): string {
  return c.op.kind === 'skills' ? c.op.value.join(', ') : c.op.value;
}
