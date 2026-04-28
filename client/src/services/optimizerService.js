/**
 * BlancBleu — Service Optimizer IA
 * Appels directs au microservice FastAPI sur port 5002.
 * Toutes les fonctions retournent une Promise.
 * En cas d'échec (service hors ligne), la Promise rejette silencieusement.
 */

const AI_BASE =
  process.env.REACT_APP_AI_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://localhost:5002"
    : "http://localhost:5002");

const AI_TIMEOUT = 8000; // ms

async function _fetch(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const res = await fetch(`${AI_BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.detail || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Prédiction durée (XGBoost) ────────────────────────────────────────────────
export async function predictDuree(transportData) {
  return _fetch("POST", "/optimizer/predict/duree", transportData);
}

// ── Métriques du modèle entraîné ─────────────────────────────────────────────
export async function getModelMetrics() {
  return _fetch("GET", "/optimizer/model/metrics");
}

// ── État de l'optimiseur temps réel ──────────────────────────────────────────
export async function getOptimizerStats() {
  return _fetch("GET", "/optimizer/optimizer/stats");
}

// ── Optimisation temps réel (VRP greedy) ─────────────────────────────────────
export async function optimizeRealtime({ transport, vehicules }) {
  return _fetch("POST", "/optimizer/optimize/realtime", { transport, vehicules });
}
