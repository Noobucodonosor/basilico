/**
 * C.I.B.O. / Basilico — Local-First Dataset & User State Store
 * Uses IndexedDB (with in-memory + localStorage fallbacks) so all 14 seed
 * datasets and user state (pantry, shopping list, receipts, profiles) work offline.
 */

const DB_NAME = 'cibo_offline_db';
const DB_VERSION = 1;
const DATASET_STORE = 'datasets';
const STATE_STORE = 'userState';
const LS_PREFIX = 'cibo_state:';
const VERSION_KEY = 'cibo_dataset_version';

const memoryDatasets = new Map();
const pendingLoads = new Map();
const memoryState = new Map();
let activeDataVersion = null;
let versionCheckPromise = null;

function getBaseUrl() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) {
      return import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
    }
  } catch (_) {}
  return './';
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DATASET_STORE)) {
          db.createObjectStore(DATASET_STORE);
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch (_) {
      resolve(undefined);
    }
  });
}

async function idbSet(storeName, key, value) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

async function idbClearStore(storeName) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

async function ensureDatasetVersionFresh() {
  if (versionCheckPromise) return versionCheckPromise;
  versionCheckPromise = (async () => {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch(`${getBaseUrl()}data/manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return null;
      const manifest = await res.json();
      const newVer = manifest?.version || null;
      if (!newVer) return null;
      activeDataVersion = newVer;
      const prevVer = typeof localStorage !== 'undefined' ? localStorage.getItem(VERSION_KEY) : null;
      if (prevVer !== newVer) {
        memoryDatasets.clear();
        await idbClearStore(DATASET_STORE);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(VERSION_KEY, newVer);
        }
      }
      return newVer;
    } catch (_) {
      return null;
    }
  })();
  return versionCheckPromise;
}

/**
 * Seed a dataset directly into memory (useful in tests or SSR/Node harnesses).
 */
export function primeDataset(filename, data) {
  memoryDatasets.set(filename, data);
}

/**
 * Load a JSON dataset from memory -> IndexedDB (validated against manifest.json version) -> static `/data/<filename>`.
 */
export async function getDataset(filename, fallback = []) {
  if (memoryDatasets.has(filename)) {
    return memoryDatasets.get(filename);
  }
  if (pendingLoads.has(filename)) {
    return pendingLoads.get(filename);
  }

  const loader = (async () => {
    const ver = await ensureDatasetVersionFresh();
    if (memoryDatasets.has(filename)) {
      return memoryDatasets.get(filename);
    }

    const cached = await idbGet(DATASET_STORE, filename);
    if (cached !== undefined) {
      memoryDatasets.set(filename, cached);
      return cached;
    }

    if (typeof fetch === 'function') {
      try {
        const qs = ver ? `?v=${encodeURIComponent(ver)}` : '';
        const res = await fetch(`${getBaseUrl()}data/${filename}${qs}`);
        if (res.ok) {
          const data = await res.json();
          memoryDatasets.set(filename, data);
          void idbSet(DATASET_STORE, filename, data);
          return data;
        }
      } catch (_) {
        // Offline or missing asset: fall back gracefully
      }
    }

    return fallback;
  })();

  pendingLoads.set(filename, loader);
  try {
    return await loader;
  } finally {
    pendingLoads.delete(filename);
  }
}

/**
 * Background warm-up for heavy datasets so first paint stays instant.
 */
export function preloadHeavyDatasets() {
  const heavy = ['crea_foods.json', 'recipes_and_dishes.json', 'rapallo_offers.json'];
  const run = () => {
    for (const file of heavy) {
      void getDataset(file);
    }
  };
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}

export async function getUserState(key, defaultValue) {
  if (memoryState.has(key)) {
    return memoryState.get(key);
  }

  const fromIdb = await idbGet(STATE_STORE, key);
  if (fromIdb !== undefined) {
    memoryState.set(key, fromIdb);
    return fromIdb;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        memoryState.set(key, parsed);
        return parsed;
      }
    } catch (_) {}
  }

  return typeof defaultValue === 'function' ? defaultValue() : structuredClone(defaultValue);
}

export async function setUserState(key, value) {
  memoryState.set(key, value);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    } catch (_) {}
  }
  await idbSet(STATE_STORE, key, value);
  return value;
}

export function clearMemoryCache() {
  memoryDatasets.clear();
  pendingLoads.clear();
  memoryState.clear();
}
