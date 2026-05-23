import api from "./client";

export const factureService = {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  getAll:       (params = {}) => api.get("/factures", { params }),
  getOne:       (id)          => api.get(`/factures/${id}`),
  getStats:     ()            => api.get("/factures/stats"),
  create:       (data)        => api.post("/factures", data),
  update:       (id, data)    => api.patch(`/factures/${id}`, data),
  updateStatut: (id, statut)  => api.patch(`/factures/${id}/statut`, { statut }),
  delete:       (id)          => api.delete(`/factures/${id}`),

  // ── Génération depuis transport ──────────────────────────────────────────
  createFromTransport: (transportId) => api.post(`/factures/from-transport/${transportId}`),
  getByTransport:      (transportId) => api.get("/factures", { params: { transportId } }),

  // ── Transitions ──────────────────────────────────────────────────────────
  issue:  (id) => api.patch(`/factures/${id}/issue`),

  // ── Remboursement ────────────────────────────────────────────────────────
  refund: (id, amount, reason) => api.post(`/factures/${id}/refund`, { amount, reason }),

  // ── PDF & Reçu ───────────────────────────────────────────────────────────
  downloadPdf:     (id) => api.get(`/factures/${id}/pdf`,     { responseType: "blob" }),
  downloadReceipt: (id) => api.get(`/factures/${id}/receipt`, { responseType: "blob" }),

  // ── Historique ───────────────────────────────────────────────────────────
  getHistory: (id) => api.get(`/factures/${id}/history`),

  // ── Recalcul montants ────────────────────────────────────────────────────
  recalculateAmounts: () => api.post("/factures/recalculate-amounts"),
};

export const paymentService = {
  // Crée un PaymentIntent — retourne { clientSecret, paymentIntentId, amount, currency }
  createPaymentIntent: (invoiceId) =>
    api.post("/payments/stripe/create-payment-intent", { invoiceId }),

  // Confirme un paiement après succès côté client (fallback webhook)
  confirmPayment: (paymentIntentId, factureId) =>
    api.post("/payments/stripe/confirm", { paymentIntentId, factureId }),
};

export const comptabiliteService = {
  getDashboard:      (params = {}) => api.get("/comptabilite/dashboard", { params }),
  exportInvoicesCsv: (params = {}) =>
    api.get("/comptabilite/export/invoices.csv", { params, responseType: "blob" }),
  exportPaymentsCsv: (params = {}) =>
    api.get("/comptabilite/export/payments.csv", { params, responseType: "blob" }),
  exportBatch:       (params = {}) =>
    api.post("/comptabilite/export/batch", {}, { params, responseType: "blob" }),
};
