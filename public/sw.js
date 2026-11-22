const STATIC_CACHE = 'basilico-static-v6';
const API_CACHE = 'basilico-api-v2';
const DATA_CACHE = 'cibo-data-v3';
const MAX_API_ENTRIES = 50;
const MAX_STATIC_ENTRIES = 80;
const PRECACHE_URLS = ['./', './manifest.webmanifest', './icon.svg'];

const BYPASS_API_PREFIXES = ['/api/maestro', '/api/agentation', '/api/sync'];
const OFFLINE_API_PREFIXES = [
  '/api/shopping-list',
  '/api/pantry',
  '/api/stores',
  '/api/status',
  '/api/offers',
  '/api/recipes'
];

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    while (keys.length > maxEntries) {
      const oldest = keys.shift();
      if (oldest) await cache.delete(oldest);
    }
  } catch (_) {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([STATIC_CACHE, API_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !validCaches.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const maxEntries = cacheName === API_CACHE ? MAX_API_ENTRIES : MAX_STATIC_ENTRIES;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache
        .put(request, response.clone())
        .then(() => trimCache(cacheName, maxEntries))
        .catch(() => undefined);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const maxEntries = cacheName === API_CACHE ? MAX_API_ENTRIES : MAX_STATIC_ENTRIES;
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        cache
          .put(request, response.clone())
          .then(() => trimCache(cacheName, maxEntries))
          .catch(() => undefined);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (matchesPrefix(url.pathname, BYPASS_API_PREFIXES)) return;

  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (matchesPrefix(url.pathname, OFFLINE_API_PREFIXES)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE, './'));
    return;
  }

  const isStaticAsset =
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/icon.svg') ||
    ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination);

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
