/**
 * BlancBleu — Modèle Facture v3.0
 * Facture CPAM générée à partir d'un transport terminé.
 *
 * Workflow facture : brouillon → emise → en_attente → payee | annulee
 * Statuts étendus : payment_failed, remboursee, partiellement_remboursee, en_retard
 * Statuts paiement : UNPAID → PENDING → SUCCEEDED | FAILED | REFUNDED | PARTIALLY_REFUNDED
 */
const mongoose = require("mongoose");
const Counter = require("./Counter");

// ── Sous-schéma historique ─────────────────────────────────────────────────────
const historyEntrySchema = new mongoose.Schema(
  {
    from:     { type: String, default: "" },
    to:       { type: String, default: "" },
    action:   { type: String, required: true },
    by:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byEmail:  { type: String, default: "système" },
    at:       { type: Date, default: Date.now },
    reason:   { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const factureSchema = new mongoose.Schema(
  {
    // ── Numéro auto : FAC-YYYY-XXXX ───────────────────────────────────────────
    numero: { type: String, unique: true, index: true },

    // ── Liens métier ──────────────────────────────────────────────────────────
    transportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      required: [true, "Le transport est obligatoire"],
    },
    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mission",
      default: null,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
      index: true,
    },

    // ── Informations patient (dénormalisées pour archive) ─────────────────────
    patientNom:       { type: String, default: "" },
    patientPrenom:    { type: String, default: "" },
    patientNumeroSecu:{ type: String, default: "" },

    // ── Dates ─────────────────────────────────────────────────────────────────
    dateEmission: { type: Date, default: Date.now },
    datePaiement: { type: Date, default: null },
    dateEcheance: { type: Date, default: null },

    // ── Motif & type ──────────────────────────────────────────────────────────
    motif:       { type: String, default: "" },
    typeVehicule:{ type: String, enum: ["VSL", "TPMR", "AMBULANCE"], default: "VSL" },
    allerRetour: { type: Boolean, default: false },

    // ── Distance & calcul CPAM ────────────────────────────────────────────────
    distanceKm:         { type: Number, default: 0, min: 0 },
    montantBase:        { type: Number, default: 0, min: 0 },
    majoration:         { type: Number, default: 0, min: 0 },
    montantTotal:       { type: Number, default: 0, min: 0 },
    tauxPriseEnCharge:  { type: Number, default: 65, min: 0, max: 100 },
    montantCPAM:        { type: Number, default: 0, min: 0 },
    montantPatient:     { type: Number, default: 0, min: 0 },

    // ── Statut facture ────────────────────────────────────────────────────────
    statut: {
      type: String,
      enum: [
        "brouillon",
        "emise",
        "en_attente",
        "payee",
        "annulee",
        "payment_failed",
        "remboursee",
        "partiellement_remboursee",
        "en_retard",
      ],
      default: "brouillon",
      index: true,
    },

    // ── Statut paiement (séparé du statut facture) ────────────────────────────
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      default: "UNPAID",
      index: true,
    },

    modePaiement: {
      type: String,
      enum: ["virement", "cheque", "cb", "especes", "cpam_direct", "stripe", ""],
      default: "",
    },

    // ── Établissement ─────────────────────────────────────────────────────────
    lieuPrise:       { type: String, default: "" },
    lieuDestination: { type: String, default: "" },
    notes:           { type: String, default: "" },

    // ── Détails du calcul tarifaire (barème CPAM 2024) ────────────────────────
    detailsCalcul: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Référence externe CPAM / Stripe (rétrocompatibilité) ─────────────────
    referenceExterne: { type: String, default: null },

    // ── Paiement Stripe ───────────────────────────────────────────────────────
    payment: {
      provider:               { type: String, default: "stripe" },
      stripeCustomerId:       { type: String, default: null },
      stripePaymentIntentId:  { type: String, default: null, index: true, sparse: true },
      stripeChargeId:         { type: String, default: null },
      stripeReceiptUrl:       { type: String, default: null },
      paidAt:                 { type: Date, default: null },
      failedAt:               { type: Date, default: null },
      failureReason:          { type: String, default: null },
      refundedAt:             { type: Date, default: null },
      refundAmount:           { type: Number, default: 0 },
      refundReason:           { type: String, default: null },
      stripeRefundId:         { type: String, default: null },
      attempts:               { type: Number, default: 0 },
    },

    // ── PDF ───────────────────────────────────────────────────────────────────
    pdf: {
      invoicePdfUrl: { type: String, default: null },
      receiptPdfUrl: { type: String, default: null },
      generatedAt:   { type: Date, default: null },
    },

    // ── Comptabilité ──────────────────────────────────────────────────────────
    accounting: {
      exported:       { type: Boolean, default: false, index: true },
      exportedAt:     { type: Date, default: null },
      exportBatchId:  { type: String, default: null },
      accountingCode: { type: String, default: null },
    },

    // ── Historique des transitions ────────────────────────────────────────────
    history: [historyEntrySchema],
  },
  { timestamps: true },
);

// ── Index composés ────────────────────────────────────────────────────────────
factureSchema.index({ statut: 1, dateEmission: -1 });
factureSchema.index({ paymentStatus: 1, dateEmission: -1 });
factureSchema.index({ patientId: 1, dateEmission: -1 });
factureSchema.index({ transportId: 1 }, { unique: true, sparse: true, partialFilterExpression: { statut: { $ne: "annulee" } } });
factureSchema.index({ "accounting.exported": 1, dateEmission: -1 });

// ── Numéro atomique : FAC-YYYY-XXXX ──────────────────────────────────────────
// Counter MongoDB atomique ($inc + upsert) → pas de race condition multi-instance.
// Numérotation globale (non remise à zéro chaque année — préserve l'unicité absolue).
factureSchema.pre("save", async function (next) {
  if (!this.numero) {
    const counter = await Counter.findOneAndUpdate(
      { _id: "facture" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const y = new Date().getFullYear();
    this.numero = `FAC-${y}-${String(counter.seq).padStart(4, "0")}`;
  }
  // Calcul automatique montantTotal et parts CPAM/patient
  if (
    this.isModified("montantBase") ||
    this.isModified("majoration") ||
    this.isModified("tauxPriseEnCharge")
  ) {
    this.montantTotal    = parseFloat((this.montantBase + this.majoration).toFixed(2));
    this.montantCPAM     = parseFloat((this.montantTotal * this.tauxPriseEnCharge / 100).toFixed(2));
    this.montantPatient  = parseFloat((this.montantTotal - this.montantCPAM).toFixed(2));
  }
  next();
});

// ── Virtual : libellé statut ──────────────────────────────────────────────────
factureSchema.virtual("statutLabel").get(function () {
  const labels = {
    brouillon:                 "Brouillon",
    emise:                     "Émise",
    en_attente:                "En attente",
    payee:                     "Payée",
    annulee:                   "Annulée",
    payment_failed:            "Échec paiement",
    remboursee:                "Remboursée",
    partiellement_remboursee:  "Partiellement remboursée",
    en_retard:                 "En retard",
  };
  return labels[this.statut] || this.statut;
});

factureSchema.virtual("paymentStatusLabel").get(function () {
  const labels = {
    UNPAID:            "Non payé",
    PENDING:           "En attente",
    SUCCEEDED:         "Payé",
    FAILED:            "Échec",
    REFUNDED:          "Remboursé",
    PARTIALLY_REFUNDED:"Partiellement remboursé",
  };
  return labels[this.paymentStatus] || this.paymentStatus;
});

factureSchema.set("toJSON",   { virtuals: true });
factureSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Facture", factureSchema);
