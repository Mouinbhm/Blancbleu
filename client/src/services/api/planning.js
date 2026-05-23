import api from "./client";

export const planningService = {
  daily:      (date) => api.get("/planning/daily", { params: { date } }),
  week:       (date) => api.get("/planning/week", { params: { date } }),
  unassigned: ()     => api.get("/planning/unassigned"),
  mensuel:    (annee, mois) => {
    const dateDebut = new Date(annee, mois, 1).toISOString().split("T")[0];
    const dateFin   = new Date(annee, mois + 1, 0).toISOString().split("T")[0];
    return api.get("/transports", { params: { dateDebut, dateFin, limit: 500 } });
  },
};

export const shiftService = {
  getToday: () => api.get("/v1/shifts/today"),
  getList:  (date) => api.get("/v1/shifts", { params: { date } }),
};
