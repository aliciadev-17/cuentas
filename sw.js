/* Service worker: la app abre sin conexión. Cambia VERSION al actualizar archivos. */
const VERSION = 'cuentas-v1';
const SHELL = ['./', './index.html', './app.js', './logic.js', './store.js', './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Librerías de Firebase: se guardan para poder abrir sin red
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // Firestore y Auth van directos a la red
  // Archivos de la app: primero la red (para recibir actualizaciones), si no hay red, la copia guardada
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
