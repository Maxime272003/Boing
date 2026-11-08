import type { Backend } from '../backend';
import type { Analysis, Application, Completion, CvChange, CvOp, LetterOptions, Offer, Profile, SearchKind, Settings, TextBlock } from '../types';
import { extractJson, str, strList } from './json';
import { systemPrompt, type Task } from './prompts';
import { findUnexpected } from './guard';

export interface AiContext {
  backend: Backend;
  settings: Settings;
  /** Appelé après chaque réponse pour comptabiliser les tokens. */
  onUsage: (c: Completion) => Promise<void> | void;
}

export function overCap(settings: Settings): boolean {
  const used = settings.usage.inputTokens + settings.usage.outputTokens;
  return settings.blockOverCap && settings.monthlyTokenCap > 0 && used >= settings.monthlyTokenCap;
}

/**
 * Envoie une tâche à Claude. `shared` (profil, mode…) est identique d'un appel à l'autre :
 * il est placé en premier et mis en cache avec les consignes, ce qui réduit coût et délai
 * quand on analyse beaucoup d'offres d'affilée. `specific` change à chaque appel.
 */
async function ask<T>(
  ctx: AiContext,
  task: Task,
  shared: unknown,
  specific: unknown,
  opts: { best: boolean; maxTokens?: number }
): Promise<T> {
  if (overCap(ctx.settings)) {
    throw new Error('Plafond mensuel de tokens atteint : augmente-le dans Paramètres pour continuer.');
  }
  const content: TextBlock[] = [];
  if (shared !== null) content.push({ type: 'text', text: JSON.stringify(shared), cache_control: { type: 'ephemeral' } });
  content.push({ type: 'text', text: JSON.stringify(specific) });
  const completion = await ctx.backend.claude({
    model: opts.best ? ctx.settings.modelBest : ctx.settings.modelFast,
    system: systemPrompt(task),
    messages: [{ role: 'user', content }],
    maxTokens: opts.maxTokens ?? 2048,
    cacheSystem: true
  });
  await ctx.onUsage(completion);
  return extractJson<T>(completion.text);
}

/** Ce qu'on envoie de l'offre : l'essentiel, description tronquée. */
export function offerForPrompt(o: Offer) {
  return {
    title: o.title,
    company: o.company,
    location: o.location,
    contract: o.contractLabel ?? o.contract,
    workingTime: o.workingTime,
    salary: o.salary,
    experience: o.experience,
    skills: o.skills,
    description: o.description.slice(0, 6000)
  };
}

export function profileForPrompt(p: Profile) {
  return {
    name: `${p.firstName} ${p.lastName}`.trim(),
    title: p.title,
    city: p.city,
    summary: p.summary,
    experiences: p.experiences.map((e, i) => ({ index: i, ...e, bullets: e.bullets.map((b, j) => ({ index: j, text: b })) })),
    education: p.education,
    skills: p.skills,
    languages: p.languages,
    availability: p.availability,
    drivingLicense: p.drivingLicense,
    careerGoal: p.careerGoal,
    stopgapConstraints: p.stopgapConstraints
  };
}

// ---------- Lecture du CV ----------

export async function parseCv(ctx: AiContext, cvText: string): Promise<Omit<Profile, 'id'>> {
  const r = await ask<Record<string, unknown>>(ctx, 'parse_cv', null, { cvText: cvText.slice(0, 20000) }, { best: true, maxTokens: 3000 });
  const exps = Array.isArray(r.experiences) ? r.experiences : [];
  const edu = Array.isArray(r.education) ? r.education : [];
  return {
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    title: str(r.title),
    email: str(r.email),
    phone: str(r.phone),
    city: str(r.city),
    summary: str(r.summary),
    experiences: exps.map((e: any) => ({
      role: str(e?.role),
      company: str(e?.company),
      start: str(e?.start),
      end: str(e?.end),
      bullets: strList(e?.bullets)
    })),
    education: edu.map((e: any) => ({ degree: str(e?.degree), school: str(e?.school), year: str(e?.year) })),
    skills: strList(r.skills),
    languages: strList(r.languages),
    availability: str(r.availability),
    drivingLicense: r.drivingLicense === true,
    suggestedJobs: strList(r.suggestedJobs, 6),
    careerGoal: str(r.careerGoal),
    stopgapJobs: strList(r.stopgapJobs, 6),
    stopgapConstraints: ''
  };
}

// ---------- Score de match ----------

export function verdictFor(score: number): string {
  if (score >= 85) return 'Très bon match';
  if (score >= 70) return 'Bon match';
  if (score >= 50) return 'Match correct';
  return 'Match faible';
}

export async function analyseOffer(ctx: AiContext, profile: Profile, offer: Offer, mode: SearchKind = 'career'): Promise<Analysis> {
  const r = await ask<Record<string, unknown>>(
    ctx,
    'analyse',
    { mode, profile: profileForPrompt(profile) },
    { offer: offerForPrompt(offer) },
    { best: false, maxTokens: 800 }
  );
  const raw = Number(r.score);
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  return {
    id: offer.id,
    mode,
    score,
    verdict: str(r.verdict) || verdictFor(score),
    summary: str(r.summary),
    strengths: strList(r.strengths, 5),
    gaps: strList(r.gaps, 4),
    keywords: strList(r.keywords, 8),
    analysedAt: new Date().toISOString(),
    model: ctx.settings.modelFast
  };
}

// ---------- CV adapté ----------

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Garde-fou : on écarte toute opération qui sortirait du profil. */
export function sanitizeOp(op: any, profile: Profile): CvOp | null {
  if (!op || typeof op !== 'object') return null;
  switch (op.kind) {
    case 'title':
    case 'summary': {
      const value = str(op.value);
      return value ? { kind: op.kind, value } : null;
    }
    case 'bullet': {
      const exp = Number(op.exp);
      const value = str(op.value);
      if (!Number.isInteger(exp) || !profile.experiences[exp] || !value) return null;
      const index = op.index === null || op.index === undefined ? null : Number(op.index);
      if (index !== null && (!Number.isInteger(index) || index < 0 || index >= profile.experiences[exp].bullets.length)) return null;
      return { kind: 'bullet', exp, index, value };
    }
    case 'hide_bullet': {
      const exp = Number(op.exp);
      const index = Number(op.index);
      if (!Number.isInteger(exp) || !profile.experiences[exp]) return null;
      if (!Number.isInteger(index) || index < 0 || index >= profile.experiences[exp].bullets.length) return null;
      return { kind: 'hide_bullet', exp, index };
    }
    case 'skills': {
      const allowed = new Map(profile.skills.map((s) => [norm(s), s]));
      const value = strList(op.value)
        .map((s) => allowed.get(norm(s)))
        .filter((s): s is string => !!s);
      const unique = [...new Set(value)];
      return unique.length ? { kind: 'skills', value: unique } : null;
    }
    default:
      return null;
  }
}

export async function adaptCv(
  ctx: AiContext,
  profile: Profile,
  offer: Offer,
  analysis: Analysis | null,
  mode: SearchKind = 'career'
): Promise<CvChange[]> {
  const r = await ask<{ changes?: unknown }>(
    ctx,
    'adapt_cv',
    { mode, profile: profileForPrompt(profile) },
    { offer: offerForPrompt(offer), analysis },
    { best: true, maxTokens: 2500 }
  );
  const list = Array.isArray(r.changes) ? r.changes : [];
  const out: CvChange[] = [];
  list.forEach((c: any, i: number) => {
    const op = sanitizeOp(c?.op, profile);
    if (!op) return;
    // Une modification qui glisse un lien, une adresse ou un numéro inconnu est écartée.
    if ((op.kind === 'title' || op.kind === 'summary' || op.kind === 'bullet') && findUnexpected(op.value, profile, offer).length) return;
    out.push({ id: `c${i + 1}`, title: str(c.title) || 'Modification', why: str(c.why), op, accepted: true });
  });
  return out;
}

// ---------- Lettre ----------

export interface LetterResult {
  letter: string;
  mailSubject: string;
  mailBody: string;
  /** Éléments inattendus repérés dans la lettre ou l'e-mail (à faire vérifier). */
  warnings: string[];
}

export async function writeLetter(
  ctx: AiContext,
  profile: Profile,
  offer: Offer,
  analysis: Analysis | null,
  options: LetterOptions,
  template?: string,
  mode: SearchKind = 'career'
): Promise<LetterResult> {
  const r = await ask<Record<string, unknown>>(
    ctx,
    'write_letter',
    { mode, profile: profileForPrompt(profile) },
    {
      offer: offerForPrompt(offer),
      analysis,
      options,
      template: template ?? null,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    },
    { best: true, maxTokens: 2500 }
  );
  const letter = str(r.letter).slice(0, 8000);
  if (!letter) throw new Error('Claude n’a pas renvoyé de lettre.');
  const mailSubject = str(r.mailSubject).slice(0, 200);
  const mailBody = str(r.mailBody).slice(0, 4000);
  const warnings = findUnexpected(`${letter}
${mailSubject}
${mailBody}`, profile, offer);
  return { letter, mailSubject, mailBody, warnings };
}

// ---------- Relance ----------

export async function followUp(ctx: AiContext, profile: Profile, app: Application): Promise<{ subject: string; body: string }> {
  const r = await ask<Record<string, unknown>>(
    ctx,
    'follow_up',
    { mode: app.kind, profile: profileForPrompt(profile) },
    { offer: offerForPrompt(app.offer), sentAt: app.sentAt, originalSubject: app.mail.subject },
    { best: false, maxTokens: 600 }
  );
  return { subject: str(r.subject), body: str(r.body) };
}
