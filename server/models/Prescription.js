/**
 * BlancBleu — Modèle Prescription (PMT) v1.0
 * Prescription Médicale de Transport — entité propre liée à un Patient.
 * Une prescription peut couvrir plusieurs transports (ex: dialyse hebdomadaire).
 */
const mongoose = require("mongoose");
const Counter = require("./Counter");

const medecinSchema = new mongoose.Schema(
  {
    nom: { type: String, default: "" },
    prenom: { type: String, default: "" },
    rpps: { type: String, default: "" }, // Numéro RPPS
    telephone: { type: String, default: "" },
    specialite: { type: String, default: "" },
    etablissement: { type: String, default: "" },
  },
  { _id: false },
);

const prescriptionSchema = new mongoose.Schema(
  {
    // ── Numéro auto : PMT-YYYYMMDD-XXXX ──────────────────────────────────────
    numero: { type: String, unique: true, index: true },

    // ── Liens métier ──────────────────────────────────────────────────────────
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: [true, "Le patient est obligatoire"],
      index: true,
    },

    // ── Informations médicales ─────────────────────────────────────────────────
    medecin: { type: medecinSchema, default: () => ({}) },
    dateEmission: { type: Date, required: [true, "La date d'émission est obligatoire"] },
    dateExpiration: { type: Date },
    motif: {
      type: String,
      enum: [
        "Dialyse",
        "Chimiothérapie",
        "Radiothérapie",
        "Consultation",
        "Hospitalisation",
        "Sortie hospitalisation",
        "Rééducation",
        "Analyse",
        "Autre",
      ],
      required: [true, "Le motif est obligatoire"],
    },
    etablissementDestination: { type: String, default: "" },

    // ── Statut de la prescription ─────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["active", "expiree", "annulee", "en_attente_validation", "incomplet"],
      default: "en_attente_validation",
    },

    // ── Commentaire dispatcher (statut incomplet) ─────────────────────────────
    commentaireDispatcher: { type: String, default: "" },

    // ── Origine ───────────────────────────────────────────────────────────────
    source: {
      type: String,
      enum: ["DISPATCHER", "PATIENT_APP"],
      default: "DISPATCHER",
    },

    // ── Document original ─────────────────────────────────────────────────────
    fichierUrl: { type: String, default: "" },
    fichierNom: { type: String, default: "" },

    // ── Extraction IA (OCR + NLP) — champs legacy conservés ──────────────────
    extractionIA: { type: mongoose.Schema.Types.Mixed, default: null },
    confiance: { type: Number, min: 0, max: 1, default: null },
    champsManquants: [{ type: String }],

    // ── Validation humaine — champs legacy conservés ──────────────────────────
    validee: { type: Boolean, default: false },
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    valideAt: { type: Date, default: null },

    // ── Contenu extrait/validé (champs structurés finaux) ─────────────────────
    contenuExtrait: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── OCR workflow ──────────────────────────────────────────────────────────
    ocr: {
      statut: {
        type: String,
        enum: ["pending", "processing", "processed", "failed"],
        default: "pending",
      },
      confiance:    { type: Number, min: 0, max: 1, default: null },
      donneesExtraites: { type: mongoose.Schema.Types.Mixed, default: null },
      champsIncertains: [{ type: String }],
      erreurs:      [{ type: String }],
      traiteAt:     { type: Date, default: null },
      fournisseur:  { type: String, default: "tesseract+spacy" },
    },

    // ── Validation workflow ───────────────────────────────────────────────────
    validation: {
      statut: {
        type: String,
        enum: ["en_attente", "corrige", "valide", "rejete"],
        default: "en_attente",
      },
      validePar:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      valideAt:     { type: Date, default: null },
      notesCorrection: { type: String, default: "" },
      donneesOriginales: { type: mongoose.Schema.Types.Mixed, default: null },
      donneesCorrigees:  { type: mongoose.Schema.Types.Mixed, default: null },
      motifRejet:   { type: String, default: "" },
    },

    // ── Document numérique ────────────────────────────────────────────────────
    document: {
      fileUrl:     { type: String, default: "" },
      fileName:    { type: String, default: "" },
      mimeType:    { type: String, default: "" },
      uploadedAt:  { type: Date, default: null },
      uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },

    // ── Lien transport (optionnel) ────────────────────────────────────────────
    linkedTransportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
      index: true,
    },

    // ── Historique de validation ──────────────────────────────────────────────
    validationHistory: [
      {
        action:     { type: String },
        par:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at:         { type: Date, default: Date.now },
        notes:      { type: String, default: "" },
        donnees:    { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],

    notes: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ── Index ─────────────────────────────────────────────────────────────────────
prescriptionSchema.index({ patientId: 1, statut: 1 });
prescriptionSchema.index({ dateExpiration: 1 });
prescriptionSchema.index({ deletedAt: 1 });
prescriptionSchema.index({ "ocr.statut": 1 });
prescriptionSchema.index({ "validation.statut": 1 });

// ── Numéro atomique : PMT-YYYYMMDD-XXXX ──────────────────────────────────────
// Counter MongoDB atomique ($inc + upsert) → pas de race condition multi-instance.
prescriptionSchema.pre("save", async function (next) {
  if (!this.numero) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const counter = await Counter.findOneAndUpdate(
      { _id: "prescription" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.numero = `PMT-${date}-${String(counter.seq).padStart(4, "0")}`;
  }
  next();
});

// ── Auto-expiration au statut ─────────────────────────────────────────────────
prescriptionSchema.pre("save", function (next) {
  if (this.dateExpiration && this.dateExpiration < new Date() && this.statut === "active") {
    this.statut = "expiree";
  }
  next();
});

module.exports = mongoose.model("Prescription", prescriptionSchema);
