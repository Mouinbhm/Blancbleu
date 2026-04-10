import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Injecter le JWT automatiquement ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Gérer les 401 (token expiré → déconnexion) ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
export const authService = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
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
// EXPORTS INDIVIDUELS (compatibilité avec l'ancien api.js)
// ════════════════════════════════════════════════════════════════════════════
export const getInterventions = (params) => interventionService.getAll(params);
export const createIntervention = (data) => interventionService.create(data);
export const updateInterventionStatus = (id, s) =>
  interventionService.updateStatus(id, s);
export const getUnits = (params) => unitService.getAll(params);
export const updateUnitStatus = (id, s) => unitService.updateStatus(id, s);
export const analyzeIncident = (data) => aiService.analyze(data);

export default api;

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
// GÉODÉCISION
// ════════════════════════════════════════════════════════════════════════════
export const geoService = {
  // Unités disponibles triées par proximité depuis un incident
  unitsNearby: (lat, lng, priorite = "P2", limit = 5) =>
    api.get("/geo/units/nearby", { params: { lat, lng, priorite, limit } }),

  // ETA entre une unité et un incident
  calculerETA: (unitId, incidentLat, incidentLng, priorite = "P2") =>
    api.get("/geo/eta", {
      params: { unitId, incidentLat, incidentLng, priorite },
    }),

  // Distance entre 2 points GPS
  distance: (lat1, lng1, lat2, lng2) =>
    api.get("/geo/distance", { params: { lat1, lng1, lat2, lng2 } }),

  // Vérifier zone Nice
  checkZone: (lat, lng) => api.get("/geo/zone/check", { params: { lat, lng } }),
};
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
