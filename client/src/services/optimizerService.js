/**
 * BlancBleu — Service Optimizer IA
 *
 * Les routes /optimizer du microservice Python exigent le header
 * X-Service-Token (cf. ai-service/main.py) : un appel direct du navigateur au
 * port 5002 repart en 401. Et le secret partagé Node ↔ Python n'a rien à faire
 * dans un bundle JS. On passe donc par le backend Node (/api/ai/optimizer/*),
 * qui relaie via aiClient en attachant le token côté serveur.
 *
 * Les fonctions résolvent la charge utile JSON (pas l'enveloppe axios), pour
 * rester compatibles avec les appelants existants.
 * En cas d'échec, la Promise rejette — l'appelant décide quoi afficher.
 */

import api from "./api/client";

const AI_TIMEOUT = 15000; // ms — la prédiction traverse Node puis Python

// ── Prédiction durée (XGBoost) ────────────────────────────────────────────────
export async function predictDuree(transportData) {
  const res = await api.post("/ai/optimizer/predict/duree", transportData, {
    timeout: AI_TIMEOUT,
  });
  return res.data;
}

// ── Métriques du modèle entraîné ─────────────────────────────────────────────
export async function getModelMetrics() {
  const res = await api.get("/ai/optimizer/model/metrics", { timeout: AI_TIMEOUT });
  return res.data;
}

// ── État de l'optimiseur temps réel ──────────────────────────────────────────
export async function getOptimizerStats() {
  const res = await api.get("/ai/optimizer/stats", { timeout: AI_TIMEOUT });
  return res.data;
}

// ── Optimisation temps réel (VRP greedy) ─────────────────────────────────────
export async function optimizeRealtime({ transport, vehicules }) {
  const res = await api.post(
    "/ai/optimizer/optimize/realtime",
    { transport, vehicules },
    { timeout: AI_TIMEOUT },
  );
  return res.data;
}
