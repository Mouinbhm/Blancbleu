import api from "./client";

export const notificationService = {
  getAll:         (params = {}) => api.get("/notifications", { params }),
  getUnreadCount: ()            => api.get("/notifications/unread-count"),
  markAsRead:     (id)          => api.patch(`/notifications/${id}/read`),
  markAllAsRead:  ()            => api.patch("/notifications/read-all"),
  archive:        (id)          => api.patch(`/notifications/${id}/archive`),
  delete:         (id)          => api.delete(`/notifications/${id}`),
};

export const auditService = {
  getLogs:        (params = {}) => api.get("/audit", { params }),
  getStats:       ()            => api.get("/audit/stats"),
  getByTransport: (id)          => api.get(`/audit/intervention/${id}`),
  getOne:         (id)          => api.get(`/audit/${id}`),
};
