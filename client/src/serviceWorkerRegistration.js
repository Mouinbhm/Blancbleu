/**
 * Service Worker — helper d'enregistrement.
 *
 * Patron simple inspiré de CRA mais sans Workbox : on enregistre /sw.js
 * (fichier public statique). Le SW n'est activé qu'en production pour
 * éviter de cacher des assets de dev qui changent à chaque rebuild.
 *
 * Utilisation : initServiceWorker() appelé depuis src/index.js.
 *
 * Désactivation runtime via env :
 *   - REACT_APP_PWA_DISABLED=true  → ne pas enregistrer
 *   - Appel unregister() manuel    → désinscrit + clear caches
 */

const SW_URL = `${process.env.PUBLIC_URL || ""}/sw.js`;

function isLocalhost() {
  return Boolean(
    window.location.hostname === "localhost" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname.match(/^127(?:\.\d+){3}$/),
  );
}

export function initServiceWorker() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.REACT_APP_PWA_DISABLED === "true") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    // Sur localhost on vérifie d'abord que le SW existe (utile en preview prod)
    if (isLocalhost()) {
      fetch(SW_URL, { headers: { "Service-Worker": "script" } })
        .then((res) => {
          const ct = res.headers.get("content-type") || "";
          if (res.status === 404 || !ct.includes("javascript")) {
            // eslint-disable-next-line no-console
            console.warn("[PWA] /sw.js introuvable, SW non enregistré");
            return;
          }
          register();
        })
        .catch(() => register());
    } else {
      register();
    }
  });
}

function register() {
  navigator.serviceWorker.register(SW_URL).then(
    (reg) => {
      // eslint-disable-next-line no-console
      console.info("[PWA] Service Worker enregistré, scope :", reg.scope);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error("[PWA] Échec enregistrement SW :", err.message);
    },
  );
}

export function unregisterServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker.ready
    .then((reg) => reg.unregister())
    .then(() => caches.keys())
    .then((names) => Promise.all(names.map((n) => caches.delete(n))));
}
