import api from "./client";

export const analyticsService = {
  dashboard:        ()      => api.get("/analytics/dashboard"),
  transports:       (jours) => api.get("/analytics/transports", { params: { jours } }),
  flotte:           ()      => api.get("/analytics/flotte"),
  historique:       (jours) => api.get("/analytics/historique", { params: { jours } }),
  predictionFlotte: (jours = 7) => api.get("/analytics/prediction-flotte", { params: { jours } }),
};
