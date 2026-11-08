import type {
  Commune,
  Completion,
  CompletionRequest,
  Criteria,
  Offer,
  OutgoingMail,
  SecretName,
  SecretStatus,
  SmtpSettings,
  SourceId,
  UpdateInfo
} from '../types';

export type Collection =
  | 'profile'
  | 'settings'
  | 'searches'
  | 'offers'
  | 'analyses'
  | 'applications'
  | 'letters'
  | 'meta';

/** Tout ce que l'interface demande au « système » : Tauri en vrai, une simulation dans le navigateur. */
export interface Backend {
  readonly kind: 'tauri' | 'mock';
  list<T>(collection: Collection): Promise<T[]>;
  get<T>(collection: Collection, id: string): Promise<T | null>;
  put<T extends object>(collection: Collection, id: string, data: T): Promise<T>;
  insertNew<T extends { id: string }>(collection: Collection, docs: T[]): Promise<number>;
  remove(collection: Collection, id: string): Promise<void>;

  secretSet(name: SecretName, value: string): Promise<void>;
  secretStatus(): Promise<SecretStatus>;

  searchCommunes(query: string): Promise<Commune[]>;
  fetchOffers(source: SourceId, criteria: Criteria): Promise<Offer[]>;
  claude(request: CompletionRequest): Promise<Completion>;
  sendMail(smtp: SmtpSettings, mail: OutgoingMail): Promise<void>;

  saveDocument(folder: string, filename: string, bytes: Uint8Array): Promise<string>;
  openUrl(url: string): Promise<void>;
  reveal(path: string): Promise<void>;
  openFile(path: string): Promise<void>;
  dataDir(): Promise<string>;
  exportBackup(): Promise<boolean>;
  importBackup(): Promise<number | null>;
  wipe(): Promise<void>;

  checkUpdate(): Promise<UpdateInfo | null>;
  installUpdate(): Promise<void>;
  appVersion(): Promise<string>;
}
