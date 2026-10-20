/* Boardu service worker: keeps the app usable offline after the first visit.
   Bump VERSION whenever index.html changes so visitors get the new build. */
const VERSION = 'boardu-v0.5.1';
const FONT_CACHE = 'boardu-fonts';
const CORS_CACHE = 'boardu-fonts-cors';
const TEXTURE_CACHE = 'boardu-textures'; // board textures the page paints itself
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('boardu-') && ![VERSION, FONT_CACHE, CORS_CACHE, TEXTURE_CACHE].includes(k))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: try the network first so updates arrive, fall back to the cached app.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Google Fonts and the pinned PNG helper: cache first, they never change at a given URL.
  // CORS and no-cors copies live in separate caches: an opaque copy can't answer a CORS fetch.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/html-to-image@'))) {
    event.respondWith(
      caches.open(req.mode === 'cors' ? CORS_CACHE : FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Same-origin files: serve from cache, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const fresh = fetch(req).then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
  // Everything else (images, embeds) goes straight to the network.
});

// Clicking a reminder or timer notification brings Boardu back to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('./');
    })
  );
});
