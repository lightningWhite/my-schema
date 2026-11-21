// Schema service worker: makes the app work offline.
//
// - Pages: network first (so a new deploy shows up), falling back to the
//   cached app shell when offline.
// - Built assets (assets/, hashed names): cache first. A given name never
//   changes, so a cached copy is never stale.
// - Everything else of ours (manifest, icons): network first, cache as the
//   offline fallback, so updated icons and settings actually reach people.
// Requests to other origins (GitHub, the sign-in helper) are never touched.

const CACHE = 'schema-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function networkFirst(req, cacheKey) {
  return fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        void caches.open(CACHE).then((c) => c.put(cacheKey ?? req, copy));
      }
      return res;
    })
    .catch(() => caches.match(cacheKey ?? req).then((r) => r ?? caches.match('./')));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(networkFirst(req));
});
