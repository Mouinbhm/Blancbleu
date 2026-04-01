import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
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
    const isLoginRequest = error.config?.url === "/auth/login";
    if (error.response?.status === 401 && !isLoginRequest) {
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
