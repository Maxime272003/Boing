// Backend simulé pour le navigateur : stockage dans localStorage, offres d'exemple,
// Claude simulé, e-mails et fichiers gardés en mémoire. Sert au dev et aux tests Playwright.

import type { Backend, Collection } from './types';
import type { Offer, OutgoingMail, SecretName, SecretStatus, SmtpSettings } from '../types';
import { FIXTURE_COMMUNES, FIXTURE_OFFERS } from './fixtures';
import { fakeClaude } from './fake-claude';

const KEY = 'boing-mock-db';
const SECRET_KEY = 'boing-mock-secrets';
const SECRETS: SecretName[] = ['claude_api_key', 'ft_client_id', 'ft_client_secret', 'adzuna_app_id', 'adzuna_app_key', 'smtp_password'];

type Store = Record<string, Record<string, { data: any; updatedAt: number }>>;

export interface MockInspector {
  outbox: { smtp: SmtpSettings; mail: OutgoingMail; at: string }[];
  documents: { path: string; bytes: number; url: string }[];
  opened: string[];
  claudeCalls: { task: string; model: string; cached: boolean }[];
  latencyMs: number;
  reset(): void;
}

declare global {
  interface Window {
    __boing?: MockInspector;
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'en', 'et', 'h/f', 'pour', 'chargee', 'charge']);

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

let tick = 0;
function save(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function loadSecrets(): Partial<Record<SecretName, string>> {
  try {
    return JSON.parse(localStorage.getItem(SECRET_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function createMockBackend(): Backend {
  const inspector: MockInspector = {
    outbox: [],
    documents: [],
    opened: [],
    claudeCalls: [],
    latencyMs: Number(localStorage.getItem('boing-mock-latency') ?? 200),
    reset() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(SECRET_KEY);
      this.outbox = [];
      this.documents = [];
      this.opened = [];
      this.claudeCalls = [];
    }
  };
  window.__boing = inspector;

  const wait = (ms = inspector.latencyMs / 2) => new Promise((r) => setTimeout(r, ms));

  return {
    kind: 'mock',
    async list<T>(c: Collection) {
      const s = load()[c] ?? {};
      return Object.values(s)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((x) => structuredClone(x.data)) as T[];
    },
    async get<T>(c: Collection, id: string) {
      const v = load()[c]?.[id];
      return v ? (structuredClone(v.data) as T) : null;
    },
    async put<T extends object>(c: Collection, id: string, data: T) {
      const s = load();
      const doc = { ...(data as any), id };
      s[c] = s[c] ?? {};
      s[c][id] = { data: doc, updatedAt: Date.now() * 1000 + (tick++ % 1000) };
      save(s);
      return structuredClone(doc) as T;
    },
    async insertNew<T extends { id: string }>(c: Collection, docs: T[]) {
      const s = load();
      s[c] = s[c] ?? {};
      let n = 0;
      for (const d of docs) {
        if (!s[c][d.id]) {
          s[c][d.id] = { data: d, updatedAt: Date.now() * 1000 + (tick++ % 1000) };
          n++;
        }
      }
      save(s);
      return n;
    },
    async remove(c: Collection, id: string) {
      const s = load();
      delete s[c]?.[id];
      save(s);
    },

    async secretSet(name, value) {
      const s = loadSecrets();
      if (value.trim()) s[name] = value.trim();
      else delete s[name];
      localStorage.setItem(SECRET_KEY, JSON.stringify(s));
    },
    async secretStatus() {
      const s = loadSecrets();
      return Object.fromEntries(SECRETS.map((n) => [n, !!s[n]])) as SecretStatus;
    },

    async searchCommunes(query) {
      await wait();
      const q = norm(query.trim());
      if (q.length < 2) return [];
      return FIXTURE_COMMUNES.filter((c) => norm(c.name).startsWith(q));
    },

    async fetchOffers(source, criteria) {
      await wait(inspector.latencyMs);
      const s = loadSecrets();
      if (source === 'france_travail' && (!s.ft_client_id || !s.ft_client_secret)) {
        throw new Error('Identifiant France Travail manquant : renseigne-le dans Paramètres.');
      }
      if (source === 'adzuna' && (!s.adzuna_app_id || !s.adzuna_app_key)) {
        throw new Error('App ID Adzuna manquante : renseigne-la dans Paramètres.');
      }
      const prefix = source === 'france_travail' ? 'ft-' : 'az-';
      const tokens = criteria.keywords
        .flatMap((k) => norm(k).split(/[\s'’/-]+/))
        .filter((t) => t.length >= 4 && !STOP.has(t));
      return FIXTURE_OFFERS.filter((o: Offer) => {
        if (!o.id.startsWith(prefix)) return false;
        const title = norm(o.title);
        if (!tokens.some((t) => title.includes(t))) return false;
        if (prefix === 'ft-' && criteria.contracts.length && o.contract && !criteria.contracts.includes(o.contract)) return false;
        if (criteria.fullTime === true && o.workingTime === 'Temps partiel') return false;
        if (criteria.fullTime === false && o.workingTime === 'Temps plein') return false;
        return true;
      }).map((o) => structuredClone(o));
    },

    async claude(request) {
      if (!loadSecrets().claude_api_key) throw new Error('Clé API Claude manquante : renseigne-la dans Paramètres.');
      inspector.claudeCalls.push({
        task: request.system.match(/TÂCHE: (\w+)/)?.[1] ?? '?',
        model: request.model,
        cached: !!request.cacheSystem && Array.isArray(request.messages[0]?.content) && !!request.messages[0].content[0]?.cache_control
      });
      return fakeClaude(request, inspector.latencyMs);
    },

    async sendMail(smtp, mail) {
      await wait(inspector.latencyMs);
      if (!loadSecrets().smtp_password) throw new Error("Mot de passe d'application manquant : renseigne-le dans Paramètres.");
      if (!smtp.username.includes('@')) throw new Error("Adresse d'expédition invalide (Paramètres › Envoi d'e-mails)");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.to.trim())) throw new Error(`Adresse du destinataire invalide : ${mail.to}`);
      inspector.outbox.push({ smtp, mail, at: new Date().toISOString() });
    },

    async saveDocument(folder, filename, bytes) {
      const path = `C:\\Users\\vous\\AppData\\Roaming\\app.boing.desktop\\documents\\${folder}\\${filename}`;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      inspector.documents = inspector.documents.filter((d) => d.path !== path);
      inspector.documents.push({ path, bytes: bytes.length, url });
      return path;
    },
    async openUrl(url) {
      inspector.opened.push(url);
    },
    async openFile(path) {
      inspector.opened.push(`file:${path}`);
      const doc = inspector.documents.find((d) => d.path === path);
      if (doc) window.open(doc.url, '_blank');
    },
    async reveal(path) {
      inspector.opened.push(`reveal:${path}`);
    },
    async dataDir() {
      return 'C:\\Users\\vous\\AppData\\Roaming\\app.boing.desktop';
    },
    async exportBackup() {
      const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `boing-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      return true;
    },
    async importBackup() {
      return null;
    },
    async wipe() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(SECRET_KEY);
    },

    async checkUpdate() {
      return null;
    },
    async installUpdate() {},
    async appVersion() {
      return '0.1.0';
    }
  };
}
