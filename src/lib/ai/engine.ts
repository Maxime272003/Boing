import type { Backend } from '../backend';
import type { Analysis, Application, Completion, CvChange, CvOp, LetterOptions, Offer, Profile, Settings } from '../types';
import { extractJson, str, strList } from './json';
import { systemPrompt, type Task } from './prompts';

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

async function ask<T>(ctx: AiContext, task: Task, payload: unknown, opts: { best: boolean; maxTokens?: number }): Promise<T> {
  if (overCap(ctx.settings)) {
    throw new Error('Plafond mensuel de tokens atteint : augmente-le dans Paramètres pour continuer.');
  }
  const completion = await ctx.backend.claude({
    model: opts.best ? ctx.settings.modelBest : ctx.settings.modelFast,
    system: systemPrompt(task),
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    maxTokens: opts.maxTokens ?? 2048
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
    drivingLicense: p.drivingLicense
  };
}

// ---------- Lecture du CV ----------

export async function parseCv(ctx: AiContext, cvText: string): Promise<Omit<Profile, 'id'>> {
  const r = await ask<Record<string, unknown>>(ctx, 'parse_cv', { cvText: cvText.slice(0, 20000) }, { best: true, maxTokens: 3000 });
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
    suggestedJobs: strList(r.suggestedJobs, 6)
  };
}

// ---------- Score de match ----------

export function verdictFor(score: number): string {
  if (score >= 85) return 'Très bon match';
  if (score >= 70) return 'Bon match';
  if (score >= 50) return 'Match correct';
  return 'Match faible';
}

export async function analyseOffer(ctx: AiContext, profile: Profile, offer: Offer): Promise<Analysis> {
  const r = await ask<Record<string, unknown>>(
    ctx,
    'analyse',
    { profile: profileForPrompt(profile), offer: offerForPrompt(offer) },
    { best: false, maxTokens: 800 }
  );
  const raw = Number(r.score);
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  return {
    id: offer.id,
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

export async function adaptCv(ctx: AiContext, profile: Profile, offer: Offer, analysis: Analysis | null): Promise<CvChange[]> {
  const r = await ask<{ changes?: unknown }>(
    ctx,
    'adapt_cv',
    { profile: profileForPrompt(profile), offer: offerForPrompt(offer), analysis },
    { best: true, maxTokens: 2500 }
  );
  const list = Array.isArray(r.changes) ? r.changes : [];
  const out: CvChange[] = [];
  list.forEach((c: any, i: number) => {
    const op = sanitizeOp(c?.op, profile);
    if (!op) return;
    out.push({ id: `c${i + 1}`, title: str(c.title) || 'Modification', why: str(c.why), op, accepted: true });
  });
  return out;
}

// ---------- Lettre ----------

export interface LetterResult {
  letter: string;
  mailSubject: string;
  mailBody: string;
}

export async function writeLetter(
  ctx: AiContext,
  profile: Profile,
  offer: Offer,
  analysis: Analysis | null,
  options: LetterOptions,
  template?: string
): Promise<LetterResult> {
  const r = await ask<Record<string, unknown>>(
    ctx,
    'write_letter',
    {
      profile: profileForPrompt(profile),
      offer: offerForPrompt(offer),
      analysis,
      options,
      template: template ?? null,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    },
    { best: true, maxTokens: 2500 }
  );
  const letter = str(r.letter);
  if (!letter) throw new Error('Claude n’a pas renvoyé de lettre.');
  return { letter, mailSubject: str(r.mailSubject), mailBody: str(r.mailBody) };
}

// ---------- Relance ----------

export async function followUp(ctx: AiContext, profile: Profile, app: Application): Promise<{ subject: string; body: string }> {
  const r = await ask<Record<string, unknown>>(
    ctx,
    'follow_up',
    { profile: profileForPrompt(profile), offer: offerForPrompt(app.offer), sentAt: app.sentAt, originalSubject: app.mail.subject },
    { best: false, maxTokens: 600 }
  );
  return { subject: str(r.subject), body: str(r.body) };
}
