/**
 * C.I.B.O. / Basilico — Unified API Client
 * In normal server mode (`VITE_STATIC_MODE !== 'true'`), delegates to native `fetch`.
 * In static / full-offline mode (`VITE_STATIC_MODE === 'true'`), intercepts `/api/*`
 * requests and routes them to the in-browser Virtual Router (`routeStaticApi`).
 */

import { routeStaticApi } from '../offline/localRouter.js';
import { preloadHeavyDatasets } from '../offline/localStore.js';

export function isStaticMode() {
  try {
    return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.VITE_STATIC_MODE === 'true');
  } catch (_) {
    return false;
  }
}

function isApiRequest(input) {
  const url = typeof input === 'string' ? input : input?.url;
  if (typeof url !== 'string') return false;
  if (url.startsWith('/api/')) return true;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return (
      typeof window !== 'undefined' &&
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith('/api/')
    );
  } catch (_) {
    return false;
  }
}

export async function apiFetch(input, init) {
  if (isStaticMode() && isApiRequest(input)) {
    return routeStaticApi(input, init);
  }
  return fetch(input, init);
}

let installed = false;

export function installStaticFetchInterceptor() {
  if (installed || !isStaticMode() || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  installed = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (isApiRequest(input)) {
      return routeStaticApi(input, init);
    }
    return nativeFetch(input, init);
  };
  preloadHeavyDatasets();
}
