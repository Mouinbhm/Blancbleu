import api from "./client";

export const transportService = {
  // ── CRUD ─────────────────────────────────────────────────────────────────
  getAll:           (params)       => api.get("/transports", { params }),
  estimerTarif:     (params)       => api.get("/transports/estimation", { params }),
  getOne:           (id)           => api.get(`/transports/${id}`),
  getStats:         ()             => api.get("/transports/stats"),
  create:           (data)         => api.post("/transports", data),
  creerRecurrents:  (data)         => api.post("/transports/recurrents", data),
  update:           (id, data)     => api.patch(`/transports/${id}`, data),
  delete:           (id)           => api.delete(`/transports/${id}`),

  // ── Actions lifecycle ────────────────────────────────────────────────────
  confirmer:           (id)        => api.patch(`/transports/${id}/confirm`),
  planifier:           (id)        => api.patch(`/transports/${id}/schedule`),
  assigner:            (id, data)  => api.patch(`/transports/${id}/assign`, data),
  enRoute:             (id)        => api.patch(`/transports/${id}/en-route`),
  arriveePatient:      (id, pos)   => api.patch(`/transports/${id}/arrived`, { position: pos }),
  patientABord:        (id)        => api.patch(`/transports/${id}/on-board`),
  arriveeDestination:  (id)        => api.patch(`/transports/${id}/destination`),
  completer:           (id)        => api.patch(`/transports/${id}/complete`),
  attendreDestination: (id, dureeAttenteMinutes) => api.patch(`/transports/${id}/wait`, { dureeAttenteMinutes }),
  retourBase:          (id, position) => api.patch(`/transports/${id}/return-base`, { position }),
  accepterDriver:      (id)        => api.patch(`/transports/${id}/accept-driver`),
  refuserDriver:       (id, raison) => api.patch(`/transports/${id}/reject-driver`, { raison }),
  billingPending:      (id)        => api.patch(`/transports/${id}/billing-pending`),
  facturer:            (id, payload) =>
    api.patch(`/transports/${id}/bill`,
      typeof payload === "string" ? { referenceFacture: payload } : payload,
    ),
  paid:                (id)        => api.patch(`/transports/${id}/paid`),
  fail:                (id, raison) => api.patch(`/transports/${id}/fail`, { raison }),
  noShow:              (id, raison) => api.patch(`/transports/${id}/no-show`, { raison }),
  annuler:             (id, raison) => api.patch(`/transports/${id}/cancel`, { raison }),
  reprogrammer:        (id, data)  => api.patch(`/transports/${id}/reschedule`, data),

  // ── PART A — Timeline ────────────────────────────────────────────────────
  getTimeline: (id) => api.get(`/transports/${id}/timeline`),

  // ── PART B — Signature ───────────────────────────────────────────────────
  addSignature:     (id, data)     => api.post(`/transports/${id}/signature`, data),
  addSignatureFile: (id, formData) => api.post(`/transports/${id}/signature`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),

  // ── PART C — PMT ─────────────────────────────────────────────────────────
  uploadPmt: (id, formData) => api.post(`/transports/${id}/pmt`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  getPmt:    (id)         => api.get(`/transports/${id}/pmt`),
  deletePmt: (id, docId)  => api.delete(`/transports/${id}/pmt/${docId}`),

  // ── PART D — PDF ─────────────────────────────────────────────────────────
  exportPdf: (id) => api.get(`/transports/${id}/pdf`, { responseType: "blob" }),
};
