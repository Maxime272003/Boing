// Petit routeur par hash (#/offres/123) : pas besoin de serveur, marche dans Tauri.

export interface Route {
  name: string;
  params: Record<string, string>;
  path: string;
}

const PATTERNS: [string, string][] = [
  ['bienvenue', '/bienvenue'],
  ['offres', '/offres'],
  ['offre', '/offres/:id'],
  ['cv', '/candidature/:id/cv'],
  ['lettre', '/candidature/:id/lettre'],
  ['envoi', '/candidature/:id/envoi'],
  ['suivi', '/suivi'],
  ['documents', '/documents'],
  ['parametres', '/parametres']
];

export function match(path: string): Route {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  for (const [name, pattern] of PATTERNS) {
    const a = pattern.split('/');
    const b = clean.split('/');
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    if (a.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i]))) {
      return { name, params, path: clean };
    }
  }
  return { name: 'home', params: {}, path: clean };
}

const current = () => (typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '') || '/';

class Router {
  route = $state<Route>(match(current()));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => {
        this.route = match(current());
        document.querySelector('main')?.scrollTo?.(0, 0);
      });
    }
  }

  go(path: string, replace = false) {
    if (replace) {
      history.replaceState(null, '', `#${path}`);
      this.route = match(path);
    } else {
      location.hash = path;
    }
  }
}

export const router = new Router();

export const href = (path: string) => `#${path}`;
