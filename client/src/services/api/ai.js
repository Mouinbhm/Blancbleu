import api from "./client";

export const aiService = {
  // Statut du microservice IA Python
  getStatus:      () => api.get("/ai/status"),
  getModelStatus: () => api.get("/ai/status"), // alias rétrocompat

  // Module 1 — Extraction PMT (Prescription Médicale de Transport)
  extrairePMT: (formData) =>
    api.post("/ai/pmt/extract", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30000, // OCR peut prendre jusqu'à 30s
    }),
  validerPMT: (transportId, extraction) =>
    api.patch(`/ai/pmt/validate/${transportId}`, { extraction }),

  // Module 2 — Dispatch intelligent (scoring multicritère explicable)
  recommanderDispatch:        (transportId) => api.post(`/ai/dispatch/${transportId}`),
  recommanderDispatchManuel:  (form)        => api.post("/ai/dispatch/manual", form),
  getDispatchExplanation:     (transportId) => api.get(`/ai/dispatch/${transportId}/explanation`),
  // accept / reject — montés sur /api/transports/:id pour cohérence métier
  accepterRecommandation:     (transportId) => api.patch(`/transports/${transportId}/ai-recommendation/accept`),
  refuserRecommandation:      (transportId, raison) =>
    api.patch(`/transports/${transportId}/ai-recommendation/reject`, { raison }),

  // Module 3 — Optimisation de tournée
  optimiserTournee: (data) => api.post("/ai/routing/optimize", data),
};
