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
  (response) => response,
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
      if (csrfToken) originalRequest.headers["X-CSRF-Token"] = csrfToken;
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
        await api.post("/auth/refresh");
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
