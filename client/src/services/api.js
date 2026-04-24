/**
 * BlancBleu — Client HTTP centralisé v2.0
 * Transport sanitaire NON urgent
 */
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ─── Intercepteur requête — injecte le JWT ────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Intercepteur réponse — gère les 401 et le refresh automatique ────────────
let isRefreshing = false;
let pendingQueue = [];

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

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      if (isRefreshing) {
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
        const { data } = await api.post("/auth/refresh");
        const newToken = data.token;
        localStorage.setItem("token", newToken);
        if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
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
// TRANSPORTS (remplace interventions)
// ════════════════════════════════════════════════════════════════════════════
export const transportService = {
  getAll: (params) => api.get("/transports", { params }),
  estimerTarif: (params) => api.get("/transports/estimation", { params }),
  getOne: (id) => api.get(`/transports/${id}`),
  getStats: () => api.get("/transports/stats"),
  create: (data) => api.post("/transports", data),
  creerRecurrents: (data) => api.post("/transports/recurrents", data),
  update: (id, data) => api.patch(`/transports/${id}`, data),
  delete: (id) => api.delete(`/transports/${id}`),
  // Actions lifecycle
  confirmer: (id) => api.patch(`/transports/${id}/confirm`),
  planifier: (id) => api.patch(`/transports/${id}/schedule`),
  assigner: (id, data) => api.patch(`/transports/${id}/assign`, data),
  enRoute: (id) => api.patch(`/transports/${id}/en-route`),
  arriveePatient: (id, pos) =>
    api.patch(`/transports/${id}/arrived`, { position: pos }),
  patientABord: (id) => api.patch(`/transports/${id}/on-board`),
  arriveeDestination: (id) => api.patch(`/transports/${id}/destination`),
  completer: (id) => api.patch(`/transports/${id}/complete`),
  attendreDestination: (id, dureeAttenteMinutes) => api.patch(`/transports/${id}/wait`, { dureeAttenteMinutes }),
  retourBase: (id, position) => api.patch(`/transports/${id}/return-base`, { position }),
  facturer: (id, referenceFacture) => api.patch(`/transports/${id}/bill`, { referenceFacture }),
  noShow: (id, raison) => api.patch(`/transports/${id}/no-show`, { raison }),
  annuler: (id, raison) => api.patch(`/transports/${id}/cancel`, { raison }),
  reprogrammer: (id, data) => api.patch(`/transports/${id}/reschedule`, data),
};

// ════════════════════════════════════════════════════════════════════════════
// VÉHICULES (remplace unités)
// ════════════════════════════════════════════════════════════════════════════
export const vehicleService = {
  getAll: (params) => api.get("/vehicles", { params }),
  getOne: (id) => api.get(`/vehicles/${id}`),
  getStats: () => api.get("/vehicles/stats"),
  create: (data) => api.post("/vehicles", data),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  updateStatut: (id, statut) => api.patch(`/vehicles/${id}/statut`, { statut }),
  updateLocation: (id, pos) => api.patch(`/vehicles/${id}/location`, pos),
  delete: (id) => api.delete(`/vehicles/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// PLANNING
// ════════════════════════════════════════════════════════════════════════════
export const planningService = {
  daily: (date) => api.get("/planning/daily", { params: { date } }),
  week: (date) => api.get("/planning/week", { params: { date } }),
  unassigned: () => api.get("/planning/unassigned"),
};

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════════════════
export const analyticsService = {
  dashboard: () => api.get("/analytics/dashboard"),
  transports: (jours) =>
    api.get("/analytics/transports", { params: { jours } }),
  flotte: () => api.get("/analytics/flotte"),
  historique: (jours) =>
    api.get("/analytics/historique", { params: { jours } }),
  predictionFlotte: (jours = 7) =>
    api.get("/analytics/prediction-flotte", { params: { jours } }),
};

// ════════════════════════════════════════════════════════════════════════════
// MODULE IA — Transport sanitaire non urgent
// ════════════════════════════════════════════════════════════════════════════
export const aiService = {
  // Statut du microservice IA Python
  getStatus: () => api.get("/ai/status"),
  getModelStatus: () => api.get("/ai/status"), // alias rétrocompat

  // Module 1 — Extraction PMT (Prescription Médicale de Transport)
  extrairePMT: (formData) =>
    api.post("/ai/pmt/extract", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30000, // OCR peut prendre jusqu'à 30s
    }),
  validerPMT: (transportId, extraction) =>
    api.patch(`/ai/pmt/validate/${transportId}`, { extraction }),

  // Module 2 — Dispatch (recommandation véhicule)
  recommanderDispatch: (transportId) =>
    api.post(`/ai/dispatch/${transportId}`),
  recommanderDispatchManuel: (form) =>
    api.post("/ai/dispatch/manual", form),

  // Module 3 — Optimisation de tournée
  optimiserTournee: (data) => api.post("/ai/routing/optimize", data),
};

// ════════════════════════════════════════════════════════════════════════════
// GÉOLOCALISATION
// ════════════════════════════════════════════════════════════════════════════
export const geoService = {
  geocode: (adresse) => api.get("/geo/geocode", { params: { adresse } }),
  distance: (lat1, lng1, lat2, lng2) =>
    api.get("/geo/distance", { params: { lat1, lng1, lat2, lng2 } }),
  vehiclesNearby: (lat, lng, limit = 5) =>
    api.get("/geo/vehicles/nearby", { params: { lat, lng, limit } }),
};

// ════════════════════════════════════════════════════════════════════════════
// AUDIT & TRAÇABILITÉ
// ════════════════════════════════════════════════════════════════════════════
export const auditService = {
  getLogs: (params = {}) => api.get("/audit", { params }),
  getStats: () => api.get("/audit/stats"),
  getByTransport: (id) => api.get(`/audit/intervention/${id}`),
  getOne: (id) => api.get(`/audit/${id}`),
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
  assignerVehicle: (id, uniteId) =>
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
// PATIENTS
// ════════════════════════════════════════════════════════════════════════════
export const patientService = {
  getAll: (params = {}) => api.get("/patients", { params }),
  getOne: (id) => api.get(`/patients/${id}`),
  getStats: () => api.get("/patients/stats"),
  create: (data) => api.post("/patients", data),
  update: (id, data) => api.patch(`/patients/${id}`, data),
  delete: (id) => api.delete(`/patients/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// PRESCRIPTIONS (PMT)
// ════════════════════════════════════════════════════════════════════════════
export const prescriptionService = {
  getAll: (params = {}) => api.get("/prescriptions", { params }),
  getOne: (id) => api.get(`/prescriptions/${id}`),
  getStats: () => api.get("/prescriptions/stats"),
  getByPatient: (patientId) => api.get("/prescriptions", { params: { patientId } }),
  create: (data) => api.post("/prescriptions", data),
  update: (id, data) => api.patch(`/prescriptions/${id}`, data),
  valider: (id, contenuExtrait) => api.patch(`/prescriptions/${id}/valider`, { contenuExtrait }),
  delete: (id) => api.delete(`/prescriptions/${id}`),
};

// ════════════════════════════════════════════════════════════════════════════
// MISSIONS
// ════════════════════════════════════════════════════════════════════════════
export const missionService = {
  getAll: (params = {}) => api.get("/missions", { params }),
  getOne: (id) => api.get(`/missions/${id}`),
  getStats: () => api.get("/missions/stats"),
  create: (data) => api.post("/missions", data),
  update: (id, data) => api.patch(`/missions/${id}`, data),
  updateStatut: (id, statut, extra = {}) => api.patch(`/missions/${id}/statut`, { statut, ...extra }),
  terminer: (id, data) => api.post(`/missions/${id}/terminer`, data),
};

// ════════════════════════════════════════════════════════════════════════════
// ALIASES rétrocompatibilité (anciens imports directs)
// ════════════════════════════════════════════════════════════════════════════
export const unitService = vehicleService;
export const interventionService = transportService;
export const getInterventions = (params) => transportService.getAll(params);
export const createIntervention = (data) => transportService.create(data);
export const getUnits = (params) => vehicleService.getAll(params);
export const analyzeIncident = (data) => aiService.analyze(data);
