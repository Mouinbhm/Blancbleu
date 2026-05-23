import api from "./client";

export const vehicleService = {
  getAll: async (params) => {
    const res = await api.get("/vehicles", { params });
    const body = res.data;
    return {
      ...res,
      data: Array.isArray(body) ? body : (body?.data || []),
      pagination: Array.isArray(body) ? null : (body?.pagination || null),
    };
  },
  getOne:         (id)         => api.get(`/vehicles/${id}`),
  getStats:       ()           => api.get("/vehicles/stats"),
  create:         (data)       => api.post("/vehicles", data),
  update:         (id, data)   => api.put(`/vehicles/${id}`, data),
  updateStatut:   (id, statut) => api.patch(`/vehicles/${id}/statut`, { statut }),
  updateLocation: (id, pos)    => api.patch(`/vehicles/${id}/location`, pos),
  delete:         (id)         => api.delete(`/vehicles/${id}`),

  // ── Fleet dashboard (PHASE 2) ───────────────────────────────────────────
  getFleetDashboard:       (params = {})     => api.get("/vehicles/dashboard",            { params }),
  getVehicleAnalytics:     (id, period)      => api.get(`/vehicles/${id}/analytics`,      { params: { period } }),
  getVehicleMissions:      (id, params = {}) => api.get(`/vehicles/${id}/missions`,       { params }),
  getVehicleAvailability:  (date)            => api.get("/vehicles/availability",         { params: { date } }),
  getUpcomingMaintenances: (days = 30)       => api.get("/vehicles/maintenance/upcoming", { params: { days } }),
  recalculateMetrics:      (id)              => api.post(`/vehicles/${id}/recalculate-metrics`),
};

export const equipementService = {
  getAll:            (params = {}) => api.get("/equipements", { params }),
  getOne:            (id)          => api.get(`/equipements/${id}`),
  getStats:          ()            => api.get("/equipements/stats"),
  getExpiring:       ()            => api.get("/equipements/alerts/expiring"),
  getCheckRequired:  ()            => api.get("/equipements/alerts/check-required"),
  create:            (data)        => api.post("/equipements", data),
  update:            (id, data)    => api.put(`/equipements/${id}`, data),
  updateEtat:        (id, etat, notes) => api.patch(`/equipements/${id}/status`, { etat, notes }),
  assign:            (id, uniteId) => api.patch(`/equipements/${id}/assign`, { uniteId }),
  unassign:          (id)          => api.patch(`/equipements/${id}/unassign`),
  delete:            (id)          => api.delete(`/equipements/${id}`),
};

export const maintenanceService = {
  getAll:       (params = {}) => api.get("/maintenances", { params }),
  getOne:       (id)          => api.get(`/maintenances/${id}`),
  getStats:     ()            => api.get("/maintenances/stats"),
  create:       (data)        => api.post("/maintenances", data),
  update:       (id, data)    => api.patch(`/maintenances/${id}`, data),
  updateStatut: (id, statut)  => api.patch(`/maintenances/${id}/status`, { statut }),
  delete:       (id)          => api.delete(`/maintenances/${id}`),
};
