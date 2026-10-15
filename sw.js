// Service worker: permette all'app di aprirsi anche senza connessione.
// Strategia: prima la rete (così gli aggiornamenti arrivano subito), se manca la copia salvata.
const CACHE = "daily-schedule-v15";
const FILES = ["./", "index.html", "css/style.css", "js/time.js", "js/scheduler.js", "js/parser.js", "js/areas.js", "js/stats.js",
  "js/store.js", "js/routines.js", "js/proposals.js", "js/assistant.js", "js/apple.js", "js/sync.js", "js/demo.js", "js/app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "fonts/archivo-latin.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});

// Tocco su una notifica: apre (o porta davanti) l'app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
