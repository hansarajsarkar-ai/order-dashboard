// Minimal service worker — enables PWA installability ("Add to Home Screen").
// Network passthrough; we don't cache API/data responses (always fresh).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  // Let the browser handle it normally; presence of this handler makes the
  // app installable. Static assets are still served/cached by the platform.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
