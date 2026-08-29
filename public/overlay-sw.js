/* Overlay asset cache — registered by src/dashboard/registerOverlaySW.ts,
   scoped to /public/. It cache-firsts ONLY the presentational shell (the
   overlay HTML doc + content-hashed /static/** bundles) and <img>/font
   assets (team logos, player pics, tournament branding, /themeNassets/*).

   It NEVER intercepts the real-time data path — /api/*, /public/bulk/*,
   /socket.io/*, or any non-GET request — so a stale gameplay frame can never
   be served from disk. Live data always hits the network.

   Bump SHELL_VER / ASSET_VER on a deploy that must hard-invalidate a cache. */

const SHELL_VER = 'overlay-shell-v1'; // index.html + hashed /static/** bundles
const ASSET_VER = 'overlay-assets-v1'; // runtime images + fonts
const KEEP = new Set([SHELL_VER, ASSET_VER]);
const ASSET_MAX = 400; // rough LRU cap for the image/font cache

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_VER)
      .then((c) => c.add('/index.html').catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Anything on the data path is left entirely to the network.
function isDataRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/public/bulk/') ||
    url.pathname.startsWith('/socket.io/')
  );
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request, cacheName, cap) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Store opaque (cross-origin <img>, e.g. a CDN logo) and ok responses;
  // skip 4xx/5xx error bodies so they don't get pinned.
  if (res && (res.type === 'opaque' || res.ok)) {
    cache.put(request, res.clone());
    if (cap) trim(cache, cap);
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (isDataRequest(url)) return; // data: always network, never cached

  // The overlay HTML document itself — serve the cached shell fast, refresh in
  // the background so the next reload picks up a new deploy.
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(new Request('/index.html'), SHELL_VER));
    return;
  }

  // CRA's content-hashed bundles — immutable, safe to serve cache-first forever.
  if (url.origin === self.location.origin && url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(request, SHELL_VER));
    return;
  }

  // Images + fonts (branding, team logos, player pics, /themeNassets/*, webfonts).
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(cacheFirst(request, ASSET_VER, ASSET_MAX));
    return;
  }

  // Everything else: default network handling.
});
