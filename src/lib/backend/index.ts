import type { Backend } from './types';

export type { Backend, Collection } from './types';

let instance: Backend | null = null;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Dans l'app : le vrai backend Rust. Dans un navigateur (dev, tests) : une simulation locale. */
export async function getBackend(): Promise<Backend> {
  if (instance) return instance;
  if (isTauri()) {
    instance = (await import('./tauri')).tauriBackend;
  } else {
    instance = (await import('./mock')).createMockBackend();
  }
  return instance;
}
