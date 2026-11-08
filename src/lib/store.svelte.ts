// État de l'application et actions. Tout passe par le backend (Tauri ou simulé).

import { getBackend, type Backend } from './backend';
import * as ai from './ai/engine';
import type {
  Analysis,
  Completion,
  Application,
  Criteria,
  LetterTemplate,
  Offer,
  Profile,
  Search,
  SearchKind,
  SecretStatus,
  Settings,
  SourceId
} from './types';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function defaultSettings(): Settings {
  return {
    id: 'app',
    onboarded: false,
    modelFast: 'claude-haiku-5-5',
    modelBest: 'claude-sonnet-5-5',
    autoAnalyse: true,
    maxAutoAnalyse: 25,
    monthlyTokenCap: 2_000_000,
    blockOverCap: true,
    usage: { month: currentMonth(), inputTokens: 0, outputTokens: 0, calls: 0 },
    smtp: { provider: 'gmail', host: 'smtp.gmail.com', port: 587, username: '', fromName: '', auth: 'password', oauthClientId: '', oauthClientSecret: '' },
    fetchEvery: 'daily',
    archiveAfterDays: 30,
    defaultFollowUpDays: 7
  };
}

export function emptyProfile(): Profile {
  return {
    id: 'me',
    firstName: '',
    lastName: '',
    title: '',
    email: '',
    phone: '',
    city: '',
    summary: '',
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    availability: '',
    drivingLicense: false,
    suggestedJobs: [],
    careerGoal: '',
    stopgapJobs: [],
    stopgapConstraints: ''
  };
}

export function newId(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const EMPTY_SECRETS: SecretStatus = {
  claude_api_key: false,
  ft_client_id: false,
  ft_client_secret: false,
  adzuna_app_id: false,
  adzuna_app_key: false,
  smtp_password: false,
  smtp_oauth_refresh: false
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\((h\/f|f\/h)\)|\bh\/f\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Même poste, même entreprise : une seule offre, même si elle vient de deux sources. */
export function dedupeKey(o: Pick<Offer, 'title' | 'company'>): string {
  return `${norm(o.title)}|${norm(o.company)}`;
}

/** Offre trop ancienne et sans suite : à ranger dans les archives. */
export function shouldArchive(o: Offer, days: number, hasApplication: boolean, now = Date.now()): boolean {
  if (o.archived || o.keep || o.favorite || hasApplication || days <= 0) return false;
  const date = new Date(o.publishedAt ?? o.fetchedAt ?? now).getTime();
  return now - date > days * 86400_000;
}

/** Les offres qui ne respectent pas les critères ne sont même pas gardées. */
export function passesCriteria(o: Offer, s: Search): boolean {
  if (s.contracts.length && o.contract && !s.contracts.includes(o.contract)) return false;
  if (s.fullTime === true && /partiel/i.test(o.workingTime ?? '')) return false;
  if (s.fullTime === false && /plein/i.test(o.workingTime ?? '')) return false;
  return true;
}

export function criteriaOf(s: Search, publishedSinceDays: number | null): Criteria {
  return {
    keywords: s.keywords,
    communeInsee: s.city?.insee ?? null,
    city: s.city?.name ?? null,
    distanceKm: s.distanceKm,
    contracts: s.contracts,
    fullTime: s.fullTime,
    publishedSinceDays
  };
}

class AppStore {
  backend!: Backend;
  ready = $state(false);
  profile = $state<Profile | null>(null);
  settings = $state<Settings>(defaultSettings());
  searches = $state<Search[]>([]);
  offers = $state<Offer[]>([]);
  analyses = $state<Record<string, Analysis>>({});
  applications = $state<Application[]>([]);
  letters = $state<LetterTemplate[]>([]);
  secrets = $state<SecretStatus>({ ...EMPTY_SECRETS });
  fetching = $state(false);
  analysing = $state<{ done: number; total: number } | null>(null);
  toasts = $state<Toast[]>([]);
  private toastId = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  get aiReady() {
    return this.secrets.claude_api_key;
  }

  /** Métier ou job alimentaire : d'après la recherche qui a trouvé l'offre. */
  offerKind(o: Offer): SearchKind {
    return o.kind ?? this.searches.find((s) => s.id === o.searchId)?.kind ?? 'career';
  }

  get hasStopgap() {
    return this.searches.some((s) => s.kind === 'stopgap');
  }

  get visibleOffers() {
    return this.offers.filter((o) => !o.hidden && !o.archived);
  }

  get pendingAnalysis() {
    return this.visibleOffers.filter((o) => !this.analyses[o.id]);
  }

  get followUpsDue() {
    const now = Date.now();
    return this.applications.filter(
      (a) => a.status === 'sent' && a.followUpAt && !a.followUpDone && new Date(a.followUpAt).getTime() <= now
    );
  }

  /** L'envoi depuis l'app est-il prêt (adresse + mot de passe ou connexion) ? */
  get mailReady(): boolean {
    const m = this.settings.smtp;
    if (!m.username) return false;
    return m.auth === 'oauth' && m.provider !== 'autre' ? this.secrets.smtp_oauth_refresh : this.secrets.smtp_password;
  }

  get activeSources(): SourceId[] {
    const out: SourceId[] = [];
    if (this.secrets.ft_client_id && this.secrets.ft_client_secret) out.push('france_travail');
    if (this.secrets.adzuna_app_id && this.secrets.adzuna_app_key) out.push('adzuna');
    return out;
  }

  async init() {
    this.backend = await getBackend();
    await this.reload();
    this.ready = true;
    this.maybeAutoRefresh();
    this.timer ??= setInterval(() => this.maybeAutoRefresh(), 30 * 60 * 1000);
  }

  async reload() {
    const b = this.backend;
    const [profile, settings, searches, offers, analyses, applications, letters, secrets] = await Promise.all([
      b.get<Profile>('profile', 'me'),
      b.get<Settings>('settings', 'app'),
      b.list<Search>('searches'),
      b.list<Offer>('offers'),
      b.list<Analysis>('analyses'),
      b.list<Application>('applications'),
      b.list<LetterTemplate>('letters'),
      b.secretStatus()
    ]);
    this.profile = profile ? { ...emptyProfile(), ...profile } : null;
    const s = { ...defaultSettings(), ...(settings ?? {}) };
    s.smtp = { ...defaultSettings().smtp, ...s.smtp };
    if (s.usage.month !== currentMonth()) s.usage = { month: currentMonth(), inputTokens: 0, outputTokens: 0, calls: 0 };
    this.settings = s;
    this.searches = searches.map((x) => ({ ...x, kind: x.kind ?? 'career' }));
    this.offers = offers;
    this.analyses = Object.fromEntries(analyses.map((a) => [a.id, a]));
    this.applications = applications.map((a) => ({ ...a, kind: a.kind ?? 'career' }));
    this.letters = letters;
    this.secrets = { ...EMPTY_SECRETS, ...secrets };
    await this.archiveOld();
  }

  /** Range les offres trop anciennes (ni favorites, ni candidatées). */
  async archiveOld() {
    const days = this.settings.archiveAfterDays;
    for (const o of this.offers) {
      if (shouldArchive(o, days, !!this.applicationFor(o.id))) {
        await this.updateOffer({ ...$state.snapshot(o), archived: true } as Offer);
      }
    }
  }

  toast(text: string, kind: Toast['kind'] = 'info') {
    const id = ++this.toastId;
    this.toasts.push({ id, kind, text });
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }

  errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  // ---------- IA ----------

  // Les analyses tournent en parallèle : on comptabilise les tokens l'un après l'autre.
  private usageChain: Promise<void> = Promise.resolve();

  aiContext(): ai.AiContext {
    return {
      backend: this.backend,
      settings: this.settings,
      onUsage: (c) => (this.usageChain = this.usageChain.then(() => this.addUsage(c)))
    };
  }

  private async addUsage(c: Completion) {
    const u = this.settings.usage;
    await this.saveSettings({
      usage: {
        ...u,
        inputTokens: u.inputTokens + c.inputTokens + (c.cacheWriteTokens ?? 0),
        outputTokens: u.outputTokens + c.outputTokens,
        cacheReadTokens: (u.cacheReadTokens ?? 0) + (c.cacheReadTokens ?? 0),
        calls: u.calls + 1
      }
    });
  }

  // ---------- Profil, réglages, secrets ----------

  async saveProfile(p: Profile) {
    this.profile = await this.backend.put('profile', 'me', $state.snapshot(p) as Profile);
  }

  async saveSettings(patch: Partial<Settings>) {
    this.settings = await this.backend.put('settings', 'app', { ...$state.snapshot(this.settings), ...patch } as Settings);
  }

  async setSecret(name: keyof SecretStatus, value: string) {
    await this.backend.secretSet(name, value);
    this.secrets = { ...EMPTY_SECRETS, ...(await this.backend.secretStatus()) };
  }

  // ---------- Recherches et offres ----------

  async saveSearch(s: Search) {
    const saved = await this.backend.put('searches', s.id, $state.snapshot(s) as Search);
    const i = this.searches.findIndex((x) => x.id === s.id);
    if (i >= 0) this.searches[i] = saved;
    else this.searches.unshift(saved);
  }

  async deleteSearch(id: string) {
    await this.backend.remove('searches', id);
    this.searches = this.searches.filter((s) => s.id !== id);
  }

  async updateOffer(o: Offer) {
    const saved = await this.backend.put('offers', o.id, $state.snapshot(o) as Offer);
    const i = this.offers.findIndex((x) => x.id === o.id);
    if (i >= 0) this.offers[i] = saved;
  }

  private maybeAutoRefresh() {
    const every = this.settings.fetchEvery;
    if (!this.settings.onboarded || every === 'manual' || this.fetching) return;
    if (!this.searches.some((s) => s.active) || !this.activeSources.length) return;
    const last = this.settings.lastFetchAt ? new Date(this.settings.lastFetchAt).getTime() : 0;
    const gap = every === 'daily' ? 20 * 3600_000 : 4 * 3600_000;
    if (Date.now() - last >= gap) void this.refreshOffers();
  }

  /** Récupère les offres de toutes les recherches actives, puis lance l'analyse si activée. */
  async refreshOffers(): Promise<{ added: number; errors: string[] }> {
    if (this.fetching) return { added: 0, errors: [] };
    this.fetching = true;
    const errors: string[] = [];
    let added = 0;
    try {
      const firstRun = !this.settings.lastFetchAt;
      for (const search of this.searches.filter((s) => s.active)) {
        const sources = search.sources.filter((src) => this.activeSources.includes(src));
        if (!sources.length) {
          errors.push(`« ${search.name} » : aucune source configurée (clés dans Paramètres).`);
          continue;
        }
        for (const src of sources) {
          try {
            const found = await this.backend.fetchOffers(src, criteriaOf(search, firstRun ? 31 : 7));
            const now = new Date().toISOString();
            // Une même annonce publiée sur France Travail et sur Adzuna n'est gardée qu'une fois.
            const keys = new Set(this.offers.map(dedupeKey));
            const keep = found
              .filter((o) => passesCriteria(o, search))
              .filter((o) => {
                const k = dedupeKey(o);
                if (keys.has(k) && !this.offers.some((x) => x.id === o.id)) return false;
                keys.add(k);
                return true;
              })
              .map((o) => ({ ...o, searchId: search.id, kind: search.kind, fetchedAt: now }));
            added += await this.backend.insertNew('offers', keep);
            this.offers = await this.backend.list<Offer>('offers');
          } catch (e) {
            errors.push(this.errorText(e));
          }
        }
        await this.saveSearch({ ...search, lastRunAt: new Date().toISOString() });
      }
      await this.saveSettings({ lastFetchAt: new Date().toISOString() });
      this.offers = await this.backend.list<Offer>('offers');
      await this.archiveOld();
    } finally {
      this.fetching = false;
    }
    if (errors.length) this.toast(errors[0], 'error');
    if (this.settings.autoAnalyse && this.aiReady && this.pendingAnalysis.length) {
      void this.analyse(this.pendingAnalysis.slice(0, this.settings.maxAutoAnalyse).map((o) => o.id));
    }
    return { added, errors };
  }

  /** Analyse plusieurs offres, trois à la fois. S'arrête à la première erreur (clé, plafond…). */
  async analyse(offerIds: string[], concurrency = 3) {
    if (!this.profile) return;
    if (!this.aiReady) {
      this.toast('Ajoute ta clé Claude dans Paramètres pour analyser les offres.', 'error');
      return;
    }
    if (this.analysing) return;
    const queue = [...offerIds];
    let failed = false;
    this.analysing = { done: 0, total: queue.length };
    const profile = $state.snapshot(this.profile) as Profile;
    const worker = async () => {
      while (queue.length && !failed) {
        const id = queue.shift()!;
        const offer = this.offers.find((o) => o.id === id);
        if (!offer) continue;
        try {
          const a = await ai.analyseOffer(this.aiContext(), profile, $state.snapshot(offer) as Offer, this.offerKind(offer));
          await this.backend.put('analyses', a.id, a);
          this.analyses[a.id] = a;
        } catch (e) {
          if (!failed) this.toast(this.errorText(e), 'error');
          failed = true;
        }
        if (this.analysing) this.analysing = { done: this.analysing.done + 1, total: this.analysing.total };
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    } finally {
      this.analysing = null;
    }
  }

  // ---------- Candidatures ----------

  applicationFor(offerId: string): Application | undefined {
    return this.applications.find((a) => a.offerId === offerId);
  }

  async createApplication(offerId: string): Promise<Application> {
    const existing = this.applicationFor(offerId);
    if (existing) return existing;
    const offer = this.offers.find((o) => o.id === offerId);
    if (!offer) throw new Error('Offre introuvable');
    const defaultTpl = this.letters.find((l) => l.isDefault);
    const kind = this.offerKind(offer);
    const app: Application = {
      id: newId('app-'),
      offerId,
      offer: $state.snapshot(offer) as Offer,
      kind,
      score: this.analyses[offerId]?.score ?? null,
      status: 'draft',
      cvChanges: [],
      cvTemplate: 'sobre',
      letter: '',
      letterOptions: { tone: kind === 'stopgap' ? 'direct' : 'professionnel', length: kind === 'stopgap' ? 'courte' : 'standard', points: [], instruction: '', templateId: kind === 'stopgap' ? undefined : defaultTpl?.id },
      mail: { to: offer.applyEmail ?? '', subject: '', body: '' },
      mode: offer.applyEmail ? 'smtp' : 'site',
      checks: { cv: false, letter: false, company: false },
      followUpDays: this.settings.defaultFollowUpDays,
      createdAt: new Date().toISOString(),
      notes: '',
      history: [{ at: new Date().toISOString(), label: 'Candidature préparée' }]
    };
    return this.saveApplication(app);
  }

  async saveApplication(app: Application): Promise<Application> {
    const saved = await this.backend.put('applications', app.id, $state.snapshot(app) as Application);
    const i = this.applications.findIndex((a) => a.id === app.id);
    if (i >= 0) this.applications[i] = saved;
    else this.applications.unshift(saved);
    return saved;
  }

  async deleteApplication(id: string) {
    await this.backend.remove('applications', id);
    this.applications = this.applications.filter((a) => a.id !== id);
  }

  async saveLetterTemplate(t: LetterTemplate) {
    if (t.isDefault) {
      for (const other of this.letters.filter((l) => l.id !== t.id && l.isDefault)) {
        await this.backend.put('letters', other.id, { ...$state.snapshot(other), isDefault: false });
      }
    }
    await this.backend.put('letters', t.id, $state.snapshot(t) as LetterTemplate);
    this.letters = await this.backend.list<LetterTemplate>('letters');
  }

  async deleteLetterTemplate(id: string) {
    await this.backend.remove('letters', id);
    this.letters = this.letters.filter((l) => l.id !== id);
  }
}

export const store = new AppStore();
