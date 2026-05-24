/* eslint-disable no-restricted-globals */
/**
 * BlancBleu Service Worker — Sprint 6 (Module D)
 *
 * Stratégies :
 *   - Précache : shell minimal (index.html, manifest, offline.html, favicon).
 *   - Assets statiques (JS/CSS/img/fonts) : cache-first puis network-fallback.
 *   - API /api/*                          : network-first puis cache-fallback.
 *   - Navigation HTML offline             : retombe sur /offline.html.
 *
 * Versioning : modifier CACHE_VERSION pour invalider tous les caches.
 *
 * Module D.2 ajoutera les handlers `push` et `notificationclick`.
 */

const CACHE_VERSION = "bb-v1";
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => !n.startsWith(CACHE_VERSION))
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only (laisse passer les CDN fonts etc.)
  if (url.origin !== self.location.origin) return;

  // Navigation HTML : try network, fallback offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html")),
    );
    return;
  }

  // API : network-first avec fallback cache (lecture seule, GET)
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Ne cache que les 200 OK
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Assets statiques : cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
  }
});

// ── Web Push handlers (D.2) — minimal stubs, étendus dans D.2 ──────────────
self.addEventListener("push", (event) => {
  let payload = { title: "BlancBleu", body: "Nouvelle notification" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_e) { /* texte brut */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:  payload.body,
      icon:  "/logo192.png",
      badge: "/logo192.png",
      data:  payload.data || {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.includes(self.location.origin));
      if (win) {
        win.focus();
        win.navigate?.(url);
        return undefined;
      }
      return self.clients.openWindow(url);
    }),
  );
});
