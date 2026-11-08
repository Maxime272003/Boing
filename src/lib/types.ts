// Modèle de données de Boing. Tout est stocké en local (SQLite côté Tauri).

export interface Experience {
  role: string;
  company: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface Education {
  degree: string;
  school: string;
  year: string;
}

export interface Profile {
  id: 'me';
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  summary: string;
  experiences: Experience[];
  education: Education[];
  /** Compétences confirmées : Claude ne met en avant que celles-ci. */
  skills: string[];
  languages: string[];
  availability: string;
  drivingLicense: boolean;
  suggestedJobs: string[];
  /** Le métier visé à terme (ex. « Concept artist »). */
  careerGoal: string;
  /** Jobs d'appoint envisagés en attendant (« jobs alimentaires »). */
  stopgapJobs: string[];
  /** Contraintes pour un job d'appoint : horaires, jours, temps partiel… */
  stopgapConstraints: string;
  cvFileName?: string;
  cvText?: string;
}

export type SourceId = 'france_travail' | 'adzuna';

export interface City {
  name: string;
  insee: string;
  postalCode?: string | null;
  department?: string | null;
}

/** « career » = le métier visé ; « stopgap » = job alimentaire en attendant. */
export type SearchKind = 'career' | 'stopgap';

export interface Search {
  id: string;
  name: string;
  kind: SearchKind;
  keywords: string[];
  city: City | null;
  distanceKm: number;
  contracts: string[];
  fullTime: boolean | null;
  salaryMin: number | null;
  sources: SourceId[];
  active: boolean;
  lastRunAt?: string;
}

export interface Offer {
  id: string;
  source: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contract?: string | null;
  contractLabel?: string | null;
  workingTime?: string | null;
  salary?: string | null;
  description: string;
  url?: string | null;
  applyEmail?: string | null;
  applyUrl?: string | null;
  publishedAt?: string | null;
  skills: string[];
  experience?: string | null;
  // Champs ajoutés par Boing
  searchId?: string;
  kind?: SearchKind;
  fetchedAt?: string;
  favorite?: boolean;
  hidden?: boolean;
  seen?: boolean;
  /** Offre trop ancienne, rangée automatiquement. */
  archived?: boolean;
  /** Ressortie des archives à la main : ne plus l'archiver. */
  keep?: boolean;
}

export interface Analysis {
  id: string; // = id de l'offre
  mode: SearchKind;
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  keywords: string[];
  analysedAt: string;
  model: string;
}

export type CvOp =
  | { kind: 'title'; value: string }
  | { kind: 'summary'; value: string }
  | { kind: 'bullet'; exp: number; index: number | null; value: string }
  | { kind: 'hide_bullet'; exp: number; index: number }
  | { kind: 'skills'; value: string[] };

export interface CvChange {
  id: string;
  title: string;
  why: string;
  op: CvOp;
  accepted: boolean;
}

/** Ce qui est imprimé sur le CV. */
export interface CvContent {
  fullName: string;
  title: string;
  contact: string[];
  summary: string;
  experiences: Experience[];
  education: Education[];
  skills: string[];
  languages: string[];
}

export type CvTemplate = 'sobre' | 'moderne';
export type Tone = 'professionnel' | 'chaleureux' | 'direct';
export type LetterLength = 'courte' | 'standard' | 'detaillee';

export interface LetterOptions {
  tone: Tone;
  length: LetterLength;
  points: string[];
  instruction: string;
  templateId?: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  text: string;
  isDefault: boolean;
  uses: number;
}

export type AppStatus = 'draft' | 'sent' | 'followup' | 'interview' | 'closed';
export type SendMode = 'smtp' | 'client' | 'site';

export interface Application {
  id: string;
  offerId: string;
  offer: Offer;
  kind: SearchKind;
  score: number | null;
  status: AppStatus;
  outcome?: 'refus' | 'accepte' | 'sans_reponse' | null;
  cvChanges: CvChange[];
  cvTemplate: CvTemplate;
  letter: string;
  letterOptions: LetterOptions;
  mail: { to: string; subject: string; body: string };
  mode: SendMode;
  checks: { cv: boolean; letter: boolean; company: boolean };
  followUpDays: number | null;
  createdAt: string;
  sentAt?: string;
  followUpAt?: string;
  followUpDone?: boolean;
  followUpDraft?: { subject: string; body: string };
  interviewAt?: string;
  notes: string;
  files?: { cv?: string; letter?: string };
  history: { at: string; label: string }[];
}

export interface SmtpSettings {
  provider: 'gmail' | 'outlook' | 'autre';
  host: string;
  port: number;
  username: string;
  fromName: string;
}

export interface Settings {
  id: 'app';
  onboarded: boolean;
  modelFast: string;
  modelBest: string;
  autoAnalyse: boolean;
  maxAutoAnalyse: number;
  monthlyTokenCap: number;
  blockOverCap: boolean;
  usage: { month: string; inputTokens: number; outputTokens: number; calls: number; cacheReadTokens?: number };
  smtp: SmtpSettings;
  fetchEvery: 'daily' | '4h' | 'manual';
  archiveAfterDays: number;
  lastFetchAt?: string;
  defaultFollowUpDays: number;
}

export type SecretName =
  | 'claude_api_key'
  | 'ft_client_id'
  | 'ft_client_secret'
  | 'adzuna_app_id'
  | 'adzuna_app_key'
  | 'smtp_password';

export type SecretStatus = Record<SecretName, boolean>;

export interface Commune extends City {}

export interface Criteria {
  keywords: string[];
  communeInsee?: string | null;
  city?: string | null;
  distanceKm?: number | null;
  contracts: string[];
  fullTime?: boolean | null;
  publishedSinceDays?: number | null;
}

export interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | TextBlock[];
}

export interface CompletionRequest {
  model: string;
  system: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  /** Met les consignes en cache côté API (réutilisées d'un appel à l'autre). */
  cacheSystem?: boolean;
}

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  body: string;
  attachments: { filename: string; contentBase64: string; mime?: string }[];
}

export interface UpdateInfo {
  version: string;
  notes: string;
}
