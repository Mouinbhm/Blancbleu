import api from "./client";

export const prescriptionService = {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  getAll:       (params = {}) => api.get("/prescriptions", { params }),
  getOne:       (id)          => api.get(`/prescriptions/${id}`),
  getStats:     ()            => api.get("/prescriptions/stats"),
  getByPatient: (patientId)   => api.get("/prescriptions", { params: { patientId } }),
  create:       (data)        => api.post("/prescriptions", data),
  update:       (id, data)    => api.patch(`/prescriptions/${id}`, data),
  valider:      (id, contenuExtrait) => api.patch(`/prescriptions/${id}/valider`, { contenuExtrait }),
  incomplet:    (id, commentaire)    => api.patch(`/prescriptions/${id}/incomplet`, { commentaire }),
  delete:       (id)          => api.delete(`/prescriptions/${id}`),

  // ── PMT Workflow ──────────────────────────────────────────────────────────
  upload: (formData) => api.post("/prescriptions/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  getPendingValidation: (params = {}) => api.get("/prescriptions/pending-validation", { params }),
  getOcrResult:  (id)              => api.get(`/prescriptions/${id}/ocr-result`),
  getValidation: (id)              => api.get(`/prescriptions/${id}/validation`),
  correct:       (id, donneesCorrigees, notes = "") =>
    api.patch(`/prescriptions/${id}/correct`, { donneesCorrigees, notes }),
  validatePmt:   (id, contenuFinal) =>
    api.patch(`/prescriptions/${id}/validate`, { contenuFinal }),
  rejectPmt:     (id, motif)       =>
    api.patch(`/prescriptions/${id}/reject`, { motif }),
  linkPatient:   (id, patientId)   =>
    api.patch(`/prescriptions/${id}/link-patient`, { patientId }),
  linkTransport: (id, transportId) =>
    api.patch(`/prescriptions/${id}/link-transport`, { transportId }),
};
