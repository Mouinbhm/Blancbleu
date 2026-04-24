/**
 * BlancBleu — Modèle Facture v2.0
 * Facture CPAM générée à partir d'un transport terminé.
 * Workflow : brouillon → emise → en_attente → payee | annulee
 */
const mongoose = require("mongoose");

const factureSchema = new mongoose.Schema(
  {
    // ── Numéro auto : FAC-YYYY-XXXX ───────────────────────────────────────────
    numero: { type: String, unique: true, index: true },

    // ── Liens métier ──────────────────────────────────────────────────────────
    transportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      required: [true, "Le transport est obligatoire"],
      index: true,
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
    },

    // ── Informations patient (dénormalisées pour archive) ─────────────────────
    patientNom: { type: String, default: "" },
    patientPrenom: { type: String, default: "" },
    patientNumeroSecu: { type: String, default: "" },

    // ── Dates ─────────────────────────────────────────────────────────────────
    dateEmission: { type: Date, default: Date.now },
    datePaiement: { type: Date, default: null },
    dateEcheance: { type: Date, default: null },

    // ── Motif & type ──────────────────────────────────────────────────────────
    motif: { type: String, default: "" },
    typeVehicule: {
      type: String,
      enum: ["VSL", "TPMR", "AMBULANCE"],
      default: "VSL",
    },
    allerRetour: { type: Boolean, default: false },

    // ── Distance & calcul CPAM ────────────────────────────────────────────────
    distanceKm: { type: Number, default: 0, min: 0 },
    montantBase: { type: Number, default: 0, min: 0 },
    majoration: { type: Number, default: 0, min: 0 }, // Nuit, dimanche, urgence
    montantTotal: { type: Number, default: 0, min: 0 },
    tauxPriseEnCharge: { type: Number, default: 65, min: 0, max: 100 }, // % CPAM
    montantCPAM: { type: Number, default: 0, min: 0 },
    montantPatient: { type: Number, default: 0, min: 0 }, // Ticket modérateur

    // ── Statut ────────────────────────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["brouillon", "emise", "en_attente", "payee", "annulee"],
      default: "brouillon",
    },
    modePaiement: {
      type: String,
      enum: ["virement", "cheque", "cb", "especes", "cpam_direct", ""],
      default: "",
    },

    // ── Établissement ─────────────────────────────────────────────────────────
    lieuPrise: { type: String, default: "" },
    lieuDestination: { type: String, default: "" },

    notes: { type: String, default: "" },

    // ── Détails du calcul tarifaire (barème CPAM 2024) ────────────────────────
    detailsCalcul: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Référence externe CPAM (numéro texte, ex : "PMT-20260424-0002") ───────
    referenceExterne: { type: String, default: null },
  },
  { timestamps: true },
);

// ── Index ─────────────────────────────────────────────────────────────────────
factureSchema.index({ statut: 1, dateEmission: -1 });
factureSchema.index({ patientId: 1 });

// ── Numéro automatique ────────────────────────────────────────────────────────
factureSchema.pre("save", async function (next) {
  if (!this.numero) {
    const count = await mongoose.model("Facture").countDocuments();
    const y = new Date().getFullYear();
    this.numero = `FAC-${y}-${String(count + 1).padStart(4, "0")}`;
  }
  // Calcul automatique montantTotal et parts CPAM/patient
  if (this.isModified("montantBase") || this.isModified("majoration") || this.isModified("tauxPriseEnCharge")) {
    this.montantTotal = parseFloat((this.montantBase + this.majoration).toFixed(2));
    this.montantCPAM = parseFloat((this.montantTotal * this.tauxPriseEnCharge / 100).toFixed(2));
    this.montantPatient = parseFloat((this.montantTotal - this.montantCPAM).toFixed(2));
  }
  next();
});

// ── Virtual : libellé statut ──────────────────────────────────────────────────
factureSchema.virtual("statutLabel").get(function () {
  const labels = {
    brouillon: "Brouillon",
    emise: "Émise",
    en_attente: "En attente",
    payee: "Payée",
    annulee: "Annulée",
  };
  return labels[this.statut] || this.statut;
});

factureSchema.set("toJSON", { virtuals: true });
factureSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Facture", factureSchema);
