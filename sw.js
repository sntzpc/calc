const CACHE_NAME = 'kalkulator_pwa_v3_modular';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',

  './js/main.js',
  './js/core/dom.js',
  './js/core/utils.js',
  './js/core/format.js',
  './js/core/storage.js',
  './js/core/exporter.js',
  './js/core/pwa.js',
  './js/core/math_engine.js',

  './js/ui/panel.js',

  './js/modules/calc.js',
  './js/modules/agro.js',
  './js/modules/convert.js',
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

// Activate: cleanup old cache
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

// Fetch strategies:
// - Same origin: cache-first
// - CDN (jsdelivr): stale-while-revalidate (so xlsx can be cached after first online load)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req));
  } else if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
