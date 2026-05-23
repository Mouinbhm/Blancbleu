import api from "./client";

export const personnelService = {
  getAll:           (params = {}) => api.get("/personnel", { params }),
  getOne:           (id)          => api.get(`/personnel/${id}`),
  getStats:         ()            => api.get("/personnel/stats"),
  create:           (data)        => api.post("/personnel", data),
  update:           (id, data)    => api.patch(`/personnel/${id}`, data),
  updateStatut:     (id, statut)  => api.patch(`/personnel/${id}/status`, { statut }),
  assignerVehicle:  (id, uniteId) => api.patch(`/personnel/${id}/assign`, { uniteId }),
  resetPassword:    (id)          => api.patch(`/personnel/${id}/reset-password`),
  delete:           (id)          => api.delete(`/personnel/${id}`),
};
