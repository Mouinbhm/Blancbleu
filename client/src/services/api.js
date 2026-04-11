/**
 * BlancBleu — Client HTTP centralisé
 *
 * Source de vérité unique pour toutes les requêtes API.
 * Tous les composants et hooks importent depuis ce fichier.
 * Ne pas créer d'autres instances axios dans le projet.
 */
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // nécessaire pour envoyer le cookie refresh token
});

// ─── Intercepteur requête — injecte le JWT ────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Intercepteur réponse — gère les 401 et le refresh automatique ────────────
let isRefreshing = false;
let pendingQueue = []; // requêtes en attente pendant le refresh

const processQueue = (error, token = null) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  pendingQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Eviter la boucle infinie sur /auth/refresh lui-même
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      if (isRefreshing) {
        // Mettre la requête en file d'attente pendant le refresh en cours
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Tenter de renouveler le token via le cookie httpOnly
        const { data } = await api.post("/auth/refresh");
        const newToken = data.token;

        localStorage.setItem("token", newToken);
        if (data.user) localStorage.setItem("user", JSON.stringify(data.user));

        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh échoué — session définitivement expirée
        processQueue(refreshError, null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
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

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
export const authService = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
  refresh: () => api.post("/auth/refresh"),
  logout: () => api.post("/auth/logout"),
  logoutAll: () => api.post("/auth/logout-all"),
};

// ════════════════════════════════════════════════════════════════════════════
// INTERVENTIONS
// ════════════════════════════════════════════════════════════════════════════
export const interventionService = {
  getAll: (params = {}) => api.get("/interventions", { params }),
  getOne: (id) => api.get(`/interventions/${id}`),
  getStats: () => api.get("/interventions/stats"),
  create: (data) => api.post("/interventions", data),
  update: (id, data) => api.patch(`/interventions/${id}`, data),
  updateStatus: (id, statut) =>
    api.patch(`/interventions/${id}/status`, { statut }),
  assignUnit: (id, unitId) =>
    api.patch(`/interventions/${id}/assign`, { unitId }),
  unassignUnit: (id) => api.patch(`/interventions/${id}/unassign`),
  delete: (id) => api.delete(`/interventions/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// UNITÉS (FLOTTE)
// ════════════════════════════════════════════════════════════════════════════
export const unitService = {
  getAll: (params = {}) => api.get("/units", { params }),
  getOne: (id) => api.get(`/units/${id}`),
  getStats: () => api.get("/units/stats"),
  create: (data) => api.post("/units", data),
  update: (id, data) => api.patch(`/units/${id}`, data),
  updateStatus: (id, statut) => api.patch(`/units/${id}/status`, { statut }),
  updatePosition: (id, pos) => api.patch(`/units/${id}/position`, pos),
  updateEquipage: (id, data) => api.patch(`/units/${id}/equipage`, data),
  delete: (id) => api.delete(`/units/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// MODULE IA
// ════════════════════════════════════════════════════════════════════════════
export const aiService = {
  analyze: (data) => api.post("/ai/analyze", data),
  analyzeAndSave: (data) => api.post("/ai/analyze-and-save", data),
  getOptions: () => api.get("/ai/options"),
  getRapport: (params = {}) => api.get("/ai/rapport", { params }),
  getModelStatus: () => api.get("/ai/status"),
};

// ════════════════════════════════════════════════════════════════════════════
// GÉODÉCISION
// ════════════════════════════════════════════════════════════════════════════
export const geoService = {
  unitsNearby: (lat, lng, priorite = "P2", limit = 5) =>
    api.get("/geo/units/nearby", { params: { lat, lng, priorite, limit } }),
  calculerETA: (unitId, incidentLat, incidentLng, priorite = "P2") =>
    api.get("/geo/eta", {
      params: { unitId, incidentLat, incidentLng, priorite },
    }),
  distance: (lat1, lng1, lat2, lng2) =>
    api.get("/geo/distance", { params: { lat1, lng1, lat2, lng2 } }),
  checkZone: (lat, lng) => api.get("/geo/zone/check", { params: { lat, lng } }),
};

// ════════════════════════════════════════════════════════════════════════════
// WORKFLOW — STATE MACHINE
// ════════════════════════════════════════════════════════════════════════════
export const workflowService = {
  getStatus: (id) => api.get(`/workflow/${id}/status`),
  transition: (id, statut, notes) =>
    api.patch(`/workflow/${id}/transition`, { statut, notes }),
  getAll: () => api.get("/workflow/transitions"),
};

// ════════════════════════════════════════════════════════════════════════════
// ESCALADE
// ════════════════════════════════════════════════════════════════════════════
export const escaladeService = {
  analyser: (interventionId) =>
    api.post("/escalade/analyser", { interventionId }),
  dashboard: () => api.get("/escalade/dashboard"),
  unitesStatus: () => api.get("/escalade/unites/status"),
  scan: () => api.post("/escalade/scan"),
};

// ════════════════════════════════════════════════════════════════════════════
// AUDIT & TRAÇABILITÉ
// ════════════════════════════════════════════════════════════════════════════
export const auditService = {
  getLogs: (params = {}) => api.get("/audit", { params }),
  getStats: () => api.get("/audit/stats"),
  getByIntervention: (id) => api.get(`/audit/intervention/${id}`),
  getOne: (id) => api.get(`/audit/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// CYCLE DE VIE UNITÉ — MODE RÉEL
// ════════════════════════════════════════════════════════════════════════════
export const unitLifecycleService = {
  assigner: (unitId, interventionId) =>
    api.patch(`/units/${unitId}/assign`, { interventionId }),
  enRoute: (unitId, interventionId) =>
    api.patch(`/units/${unitId}/en-route`, { interventionId }),
  surPlace: (unitId, interventionId, pos) =>
    api.patch(`/units/${unitId}/on-site`, { interventionId, position: pos }),
  transport: (unitId, interventionId, hopital) =>
    api.patch(`/units/${unitId}/transporting`, { interventionId, hopital }),
  terminer: (unitId, interventionId) =>
    api.patch(`/units/${unitId}/complete`, { interventionId }),
  updateLocation: (unitId, gps) => api.patch(`/units/${unitId}/location`, gps),
  updateStatut: (unitId, statut) =>
    api.patch(`/units/${unitId}/statut`, { statut }),
};

// ════════════════════════════════════════════════════════════════════════════
// FIN DE MISSION SEMI-AUTOMATIQUE
// ════════════════════════════════════════════════════════════════════════════
export const missionCompletionService = {
  evaluate: (id) => api.post(`/interventions/${id}/evaluate-completion`),
  suggest: (id) => api.post(`/interventions/${id}/suggest-completion`),
  confirm: (id) => api.post(`/interventions/${id}/confirm-completion`),
  markDestination: (id, coords) =>
    api.post(`/interventions/${id}/mark-destination-reached`, coords || {}),
  completeReport: (id, data) =>
    api.post(`/interventions/${id}/complete-mission-report`, { rapport: data }),
  scan: () => api.get("/interventions/scan-completions"),
};

// ════════════════════════════════════════════════════════════════════════════
// PERSONNEL
// ════════════════════════════════════════════════════════════════════════════
export const personnelService = {
  getAll: (params = {}) => api.get("/personnel", { params }),
  getOne: (id) => api.get(`/personnel/${id}`),
  getStats: () => api.get("/personnel/stats"),
  create: (data) => api.post("/personnel", data),
  update: (id, data) => api.patch(`/personnel/${id}`, data),
  updateStatut: (id, statut) =>
    api.patch(`/personnel/${id}/status`, { statut }),
  assignerUnite: (id, uniteId) =>
    api.patch(`/personnel/${id}/assign`, { uniteId }),
  delete: (id) => api.delete(`/personnel/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// ÉQUIPEMENTS
// ════════════════════════════════════════════════════════════════════════════
export const equipementService = {
  getAll: (params = {}) => api.get("/equipements", { params }),
  getOne: (id) => api.get(`/equipements/${id}`),
  getStats: () => api.get("/equipements/stats"),
  getExpiring: () => api.get("/equipements/alerts/expiring"),
  getCheckRequired: () => api.get("/equipements/alerts/check-required"),
  create: (data) => api.post("/equipements", data),
  update: (id, data) => api.put(`/equipements/${id}`, data),
  updateEtat: (id, etat, notes) =>
    api.patch(`/equipements/${id}/status`, { etat, notes }),
  assign: (id, uniteId) => api.patch(`/equipements/${id}/assign`, { uniteId }),
  unassign: (id) => api.patch(`/equipements/${id}/unassign`),
  delete: (id) => api.delete(`/equipements/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// MAINTENANCES
// ════════════════════════════════════════════════════════════════════════════
export const maintenanceService = {
  getAll: (params = {}) => api.get("/maintenances", { params }),
  getOne: (id) => api.get(`/maintenances/${id}`),
  getStats: () => api.get("/maintenances/stats"),
  create: (data) => api.post("/maintenances", data),
  update: (id, data) => api.patch(`/maintenances/${id}`, data),
  updateStatut: (id, statut) =>
    api.patch(`/maintenances/${id}/status`, { statut }),
  delete: (id) => api.delete(`/maintenances/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// FACTURES
// ════════════════════════════════════════════════════════════════════════════
export const factureService = {
  getAll: (params = {}) => api.get("/factures", { params }),
  getOne: (id) => api.get(`/factures/${id}`),
  getStats: () => api.get("/factures/stats"),
  create: (data) => api.post("/factures", data),
  update: (id, data) => api.patch(`/factures/${id}`, data),
  updateStatut: (id, statut) => api.patch(`/factures/${id}/statut`, { statut }),
  delete: (id) => api.delete(`/factures/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS INDIVIDUELS — rétrocompatibilité avec les anciens imports directs
// ════════════════════════════════════════════════════════════════════════════
export const getInterventions = (params) => interventionService.getAll(params);
export const createIntervention = (data) => interventionService.create(data);
export const updateInterventionStatus = (id, s) =>
  interventionService.updateStatus(id, s);
export const getUnits = (params) => unitService.getAll(params);
export const updateUnitStatus = (id, s) => unitService.updateStatus(id, s);
export const analyzeIncident = (data) => aiService.analyze(data);

// Alias pour interventionCompletionExtension (rétrocompatibilité)
export const interventionCompletionExtension = {
  evaluateCompletion: (id) => missionCompletionService.evaluate(id),
  confirmCompletion: (id) => missionCompletionService.confirm(id),
  markDestinationReached: (id, c) =>
    missionCompletionService.markDestination(id, c),
};
