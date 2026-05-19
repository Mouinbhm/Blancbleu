/**
 * BlancBleu — Modèle Patient v1.0
 * Entité propre représentant un patient suivi par la société de transport sanitaire.
 * Un patient peut avoir plusieurs transports, prescriptions et factures.
 */
const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/encryption");

const contactUrgenceSchema = new mongoose.Schema(
  {
    nom: { type: String, default: "" },
    telephone: { type: String, default: "" },
    lien: { type: String, default: "" }, // ex: "Conjoint", "Parent", "Tuteur légal"
  },
  { _id: false },
);

const patientSchema = new mongoose.Schema(
  {
    // ── Identité ──────────────────────────────────────────────────────────────
    numeroPatient: { type: String, unique: true, index: true },
    nom: { type: String, required: [true, "Le nom est obligatoire"], trim: true },
    prenom: { type: String, default: "", trim: true },
    dateNaissance: { type: Date },
    genre: { type: String, enum: ["M", "F", "autre"], default: "M" },

    // ── Contact ───────────────────────────────────────────────────────────────
    telephone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    adresse: {
      rue: { type: String, default: "" },
      ville: { type: String, default: "" },
      codePostal: { type: String, default: "" },
    },

    // ── Informations médicales / administratives ──────────────────────────────
    numeroSecu: { type: String, default: "", trim: true },
    caisse: { type: String, default: "" }, // CPAM, MSA, RSI…
    exoneration: { type: Boolean, default: false }, // ALD / 100%
    mutuelle: { type: String, default: "" },

    // ── Mobilité & besoins spécifiques ───────────────────────────────────────
    mobilite: {
      type: String,
      enum: ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"],
      default: "ASSIS",
    },
    oxygene: { type: Boolean, default: false },
    brancardage: { type: Boolean, default: false },
    accompagnateur: { type: Boolean, default: false },

    // ── Contact d'urgence ─────────────────────────────────────────────────────
    contactUrgence: { type: contactUrgenceSchema, default: () => ({}) },

    // ── Informations complémentaires ──────────────────────────────────────────
    antecedents: { type: String, default: "" },
    allergies: { type: String, default: "" },
    preferences: { type: String, default: "" },
    notes: { type: String, default: "" },

    // ── Origine du dossier ────────────────────────────────────────────────────
    // "web" = créé par le dispatcher/admin, "app_mobile" = auto-créé lors de
    // l'inscription via l'app patient Flutter, "papier" = import manuel
    source: {
      type: String,
      enum: ["web", "app_mobile", "papier"],
      default: "web",
      index: true,
    },

    // Lien vers le compte User (auth) — null pour les dossiers créés côté web
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ── Statut ────────────────────────────────────────────────────────────────
    actif: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },

    // ── RGPD — Consentements ──────────────────────────────────────────────────
    gdpr: {
      consentGiven:          { type: Boolean, default: false },
      consentDate:           { type: Date,    default: null  },
      consentVersion:        { type: String,  default: ""    },
      consentSource:         { type: String,  default: ""    }, // "web", "mobile", "papier"
      dataProcessingPurpose: [{ type: String }],
      marketingConsent:      { type: Boolean, default: false },
      medicalDataConsent:    { type: Boolean, default: false },
      dataRetentionUntil:    { type: Date,    default: null  },
      anonymized:            { type: Boolean, default: false },
      anonymizedAt:          { type: Date,    default: null  },
      anonymizedBy:          { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      deletionRequested:     { type: Boolean, default: false },
      deletionRequestedAt:   { type: Date,    default: null  },
      deletionRequestedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      deletionReason:        { type: String,  default: ""    },
    },

    // ── Historique des consentements ──────────────────────────────────────────
    consentHistory: [
      {
        consentType: { type: String, default: "" },       // "data_processing", "medical", "marketing"
        accepted:    { type: Boolean, required: true },
        version:     { type: String,  default: ""    },
        source:      { type: String,  default: ""    },   // "web", "mobile", "papier"
        ipAddress:   { type: String,  default: ""    },
        userAgent:   { type: String,  default: ""    },
        changedAt:   { type: Date,    default: Date.now },
        changedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],

    // ── Historique des accès au dossier ───────────────────────────────────────
    accessHistory: [
      {
        accessedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        role:        { type: String, default: "" },
        accessedAt:  { type: Date,   default: Date.now },
        reason:      { type: String, default: "" },       // "consultation", "transport", "export"
      },
    ],
  },
  { timestamps: true },
);

// ── Index ─────────────────────────────────────────────────────────────────────
patientSchema.index({ nom: 1, prenom: 1 });
patientSchema.index({ numeroSecu: 1 }, { sparse: true });
patientSchema.index({ telephone: 1 }, { sparse: true });
patientSchema.index({ email: 1 }, { sparse: true });
patientSchema.index({ deletedAt: 1 });
patientSchema.index({ "gdpr.anonymized": 1 });
patientSchema.index({ "gdpr.deletionRequested": 1 });

// ── Chiffrement du numéro de sécurité sociale (AES-256-GCM) ──────────────────
patientSchema.pre("save", function (next) {
  if (this.isModified("numeroSecu") && this.numeroSecu) {
    this.numeroSecu = encrypt(this.numeroSecu);
  }
  next();
});

patientSchema.post("init", function (doc) {
  if (doc.numeroSecu) {
    doc.numeroSecu = decrypt(doc.numeroSecu);
  }
});

// ── Numéro patient automatique : PAT-YYYYMMDD-XXXX ───────────────────────────
// Utilise le MAX existant au lieu de countDocuments() pour éviter les doublons
// en cas de suppressions ou d'insertions concurrentes.
patientSchema.pre("save", async function (next) {
  if (!this.numeroPatient) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const last = await mongoose.model("Patient")
      .findOne({ numeroPatient: { $exists: true, $ne: null } })
      .sort({ numeroPatient: -1 })
      .select("numeroPatient")
      .lean();
    let seq = 1;
    if (last?.numeroPatient) {
      const parts = last.numeroPatient.split("-");
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) seq = n + 1;
    }
    this.numeroPatient = `PAT-${date}-${String(seq).padStart(4, "0")}`;
  }
  next();
});

// ── Virtual : nom complet ─────────────────────────────────────────────────────
patientSchema.virtual("nomComplet").get(function () {
  return `${this.nom} ${this.prenom}`.trim();
});

patientSchema.set("toJSON", { virtuals: true });
patientSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Patient", patientSchema);
