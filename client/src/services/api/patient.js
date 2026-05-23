import api from "./client";

export const patientService = {
  getAll:   (params = {}) => api.get("/patients", { params }),
  getOne:   (id)          => api.get(`/patients/${id}`),
  getStats: ()            => api.get("/patients/stats"),
  create:   (data)        => api.post("/patients", data),
  update:   (id, data)    => api.patch(`/patients/${id}`, data),
  delete:   (id)          => api.delete(`/patients/${id}`),

  // ── Dossier complet (RGPD + transports + prescriptions + factures) ──────
  getFullProfile:    (id)         => api.get(`/patients/${id}/full-profile`),
  exportData:        (id)         => api.get(`/patients/${id}/data-export`, { responseType: "blob" }),
  updateConsent:     (id, data)   => api.post(`/patients/${id}/consent`, data),
  getConsentHistory: (id)         => api.get(`/patients/${id}/consent-history`),
  anonymize:         (id, reason) => api.post(`/patients/${id}/anonymize`, { reason }),
  requestDeletion:   (id, reason) => api.post(`/patients/${id}/request-deletion`, { reason }),
  cancelDeletion:    (id)         => api.post(`/patients/${id}/cancel-deletion-request`),
  getAuditSummary:   (id)         => api.get(`/patients/${id}/audit-summary`),
};

export const gdprService = {
  exportMyData: ()         => api.get("/gdpr/export", { responseType: "blob" }),
  eraseMyData:  (password) => api.delete("/gdpr/me", { data: { password } }),
};
