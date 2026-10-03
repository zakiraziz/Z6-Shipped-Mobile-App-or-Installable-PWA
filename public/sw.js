/*
 * Beep — service worker (hand-written, no build step).
 *
 * Strategy:
 *  - Navigations / HTML : network-first  → always get the fresh shell when
 *                          online, cached copy when offline.
 *  - Everything else GET : cache-first    → hashed JS/CSS, icons, manifest are
 *                          immutable, so serve from cache and backfill.
 *
 * Bump VERSION whenever icons / manifest / anything precached changes so old
 * caches get garbage-collected on activate — `npm run bump:cache` does it.
 */
const VERSION = 'v4';
const CACHE = `beep-${VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Add one-by-one: a single missing file must not fail the install.
      Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      // Tell live pages a new SW took over — they re-check for updates.
      .then((windowClients) => {
        windowClients.forEach((client) => client.postMessage({ type: 'SW_ACTIVATED' }));
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// A tapped cue notification should bring the app forward, not just vanish.
// data.url (absolute, set by lib/notify.ts) is the open target — some Android
// builds open a blank SW context when given only a bare relative path.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');

  if (request.mode === 'navigate' || acceptsHtml) {
    // Network first, cache fallback → fresh when online, works offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('./index.html');
          if (shell) return shell;
          return Response.error();
        })
    );
    return;
  }

  // Static assets: cache first, backfill from network.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
