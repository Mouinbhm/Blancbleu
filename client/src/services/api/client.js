/**
 * BlancBleu — Client HTTP centralisé
 * Transport sanitaire NON urgent
 *
 * Axios instance + intercepteur de refresh automatique.
 * Cookies bb_access/bb_refresh httpOnly envoyés via withCredentials.
 */
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ─── CSRF — double-submit token ───────────────────────────────────────────────
// Le serveur protège les routes mutantes (POST/PUT/PATCH/DELETE) par un token
// CSRF. On le récupère au boot via GET /api/csrf-token et on le renvoie dans le
// header X-CSRF-Token sur chaque requête mutante. Refresh auto si 403 EBADCSRFTOKEN.
const MUTATING = ["post", "put", "patch", "delete"];
let csrfToken = null;
let csrfFetch = null;

// Le serveur lie le token CSRF à l'identité de la session (ID utilisateur, cf.
// middleware/csrf.js). Se connecter ou se déconnecter change cette identité :
// le token en cache — obtenu en « anonyme » sur l'écran de login — ne vaut plus
// rien et toute requête mutante partirait en 403 EBADCSRFTOKEN. On le purge dès
// qu'une de ces routes réussit pour que le prochain appel en redemande un.
const CSRF_IDENTITY_CHANGING = [
  "/auth/login",
  "/auth/2fa/verify-login",
  "/auth/logout",
  "/auth/logout-all",
];

async function fetchCsrfToken() {
  // Une seule requête en vol partagée (évite N appels concurrents au boot).
  if (csrfFetch) return csrfFetch;
  csrfFetch = axios
    .get(`${API_URL}/csrf-token`, { withCredentials: true })
    .then((res) => {
      csrfToken = res.data?.csrfToken || null;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      csrfFetch = null;
    });
  return csrfFetch;
}

// Récupération au chargement du module (best-effort, non bloquant).
fetchCsrfToken();

api.interceptors.request.use(async (config) => {
  if (MUTATING.includes((config.method || "").toLowerCase())) {
    if (!csrfToken) await fetchCsrfToken();
    if (csrfToken) config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

// ─── Refresh de session mutualisé ────────────────────────────────────────────
// POST /auth/refresh fait TOURNER le refresh token : le serveur revoque
// l'ancien et en emet un nouveau. Deux appels concurrents partiraient donc avec
// le meme cookie ; le second recevrait 401 et le serveur ferait clearCookie(),
// tuant la session. On garantit un seul appel en vol : tous les appelants
// (bootstrap AuthContext + intercepteur 401) partagent la meme promesse.
let refreshPromise = null;

export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = api.post("/auth/refresh").finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ─── Intercepteur réponse — gère les 401 et le refresh automatique ────────────
let isRefreshing = false;
let pendingQueue = [];

const processQueue = (error) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  pendingQueue = [];
};

api.interceptors.response.use(
  (response) => {
    if (CSRF_IDENTITY_CHANGING.some((p) => (response.config?.url || "").includes(p))) {
      csrfToken = null;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // CSRF expiré/invalide → re-fetch un token et rejouer une fois.
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === "EBADCSRFTOKEN" &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true;
      csrfToken = null;
      await fetchCsrfToken();
      // Sans nouveau token, rejouer ne ferait que reproduire le même 403 :
      // on remonte l'erreur d'origine plutôt que de gaspiller un aller-retour.
      if (!csrfToken) return Promise.reject(error);
      originalRequest.headers["X-CSRF-Token"] = csrfToken;
      return api(originalRequest);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await refreshSession();
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
