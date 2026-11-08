import { describe, expect, it } from 'vitest';
import { extractJson } from '../src/lib/ai/json';
import { adaptCv, analyseOffer, parseCv, sanitizeOp, writeLetter, overCap } from '../src/lib/ai/engine';
import { systemPrompt, taskOf } from '../src/lib/ai/prompts';
import { applyChanges, baseCv } from '../src/lib/cv';
import { fakeClaude } from '../src/lib/backend/fake-claude';
import { FIXTURE_OFFERS, SAMPLE_CV_TEXT } from '../src/lib/backend/fixtures';
import type { Backend } from '../src/lib/backend';
import type { Profile, Settings } from '../src/lib/types';

const settings = {
  modelFast: 'fast',
  modelBest: 'best',
  monthlyTokenCap: 1000,
  blockOverCap: true,
  usage: { month: '2026-11', inputTokens: 0, outputTokens: 0, calls: 0 }
} as Settings;

// Claude simulé branché sur le vrai moteur : même chemin que l'app.
const backend = { claude: (r) => fakeClaude(r, 0) } as Backend;
const ctx = { backend, settings, onUsage: () => {} };

async function camille(): Promise<Profile> {
  return { id: 'me', ...(await parseCv(ctx, SAMPLE_CV_TEXT)) };
}

describe('extractJson', () => {
  it('lit un JSON entouré de texte ou de balises', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Voici : {"b":[1,2]} merci')).toEqual({ b: [1, 2] });
    expect(() => extractJson('rien')).toThrow();
  });
});

describe('prompts', () => {
  it('marque chaque tâche', () => {
    expect(taskOf(systemPrompt('analyse'))).toBe('analyse');
    expect(systemPrompt('adapt_cv')).toContain("n'inventes JAMAIS");
  });
});

describe('moteur + Claude simulé', () => {
  it('structure le CV', async () => {
    const p = await camille();
    expect(p.firstName).toBe('Camille');
    expect(p.experiences).toHaveLength(2);
    expect(p.skills).toContain('Facturation');
  });

  it('analyse une offre', async () => {
    const p = await camille();
    const a = await analyseOffer(ctx, p, FIXTURE_OFFERS[0]);
    expect(a.score).toBe(92);
    expect(a.id).toBe(FIXTURE_OFFERS[0].id);
    expect(a.strengths.length).toBeGreaterThan(1);
  });

  it('adapte le CV sans sortir du profil', async () => {
    const p = await camille();
    const changes = await adaptCv(ctx, p, FIXTURE_OFFERS[0], null);
    expect(changes.length).toBe(4);
    const cv = applyChanges(p, changes);
    expect(cv.summary).toMatch(/5 ans/);
    expect(cv.experiences[0].bullets).toContain('Classement et archivage numérique des dossiers');
    expect(cv.skills[0]).toBe('Excel');
    // Refuser une modification la retire
    changes[0].accepted = false;
    expect(applyChanges(p, changes).summary).toBe(p.summary);
  });

  it('rédige une lettre selon les options', async () => {
    const p = await camille();
    const r = await writeLetter(ctx, p, FIXTURE_OFFERS[0], null, {
      tone: 'direct',
      length: 'standard',
      points: [],
      instruction: 'Mentionne que je peux commencer en décembre'
    });
    expect(r.letter).toMatch(/^Madame, Monsieur,/);
    expect(r.letter).toContain('dès décembre');
    expect(r.letter).toContain('Cordialement');
    expect(r.mailSubject).toContain('Assistante administrative');
  });

  it('bloque au-delà du plafond', () => {
    expect(overCap({ ...settings, usage: { ...settings.usage, inputTokens: 1200 } })).toBe(true);
    expect(overCap(settings)).toBe(false);
  });
});

describe('garde-fous', () => {
  const p = { id: 'me', education: [], languages: [], skills: ['Excel', 'Word'], experiences: [{ role: 'r', company: 'c', start: '', end: '', bullets: ['a'] }] } as unknown as Profile;
  it('écarte les compétences inventées', () => {
    expect(sanitizeOp({ kind: 'skills', value: ['excel', 'Sage', 'Word'] }, p)).toEqual({ kind: 'skills', value: ['Excel', 'Word'] });
    expect(sanitizeOp({ kind: 'skills', value: ['Sage'] }, p)).toBeNull();
  });
  it('vérifie les index', () => {
    expect(sanitizeOp({ kind: 'bullet', exp: 3, index: 0, value: 'x' }, p)).toBeNull();
    expect(sanitizeOp({ kind: 'bullet', exp: 0, index: 5, value: 'x' }, p)).toBeNull();
    expect(sanitizeOp({ kind: 'bullet', exp: 0, index: null, value: 'x' }, p)).toEqual({ kind: 'bullet', exp: 0, index: null, value: 'x' });
    expect(sanitizeOp({ kind: 'hack' }, p)).toBeNull();
  });
  it('construit le CV de base', () => {
    const cv = baseCv({ ...p, firstName: 'A', lastName: 'B', title: 't', city: 'Lyon', phone: '', email: '', drivingLicense: true } as Profile);
    expect(cv.fullName).toBe('A B');
    expect(cv.contact).toEqual(['Lyon', 'Permis B']);
  });
});
