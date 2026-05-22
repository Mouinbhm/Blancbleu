/**
 * BlancBleu — Modèle Patient v1.0
 * Entité propre représentant un patient suivi par la société de transport sanitaire.
 * Un patient peut avoir plusieurs transports, prescriptions et factures.
 */
const mongoose = require("mongoose");
const Counter = require("./Counter");
const { encrypt, decrypt } = require("../utils/encryption");
const { hashDeterministic } = require("../utils/hashing");

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
    // Hash HMAC-SHA256 déterministe du numéro de sécu en clair — utilisé pour la recherche
    // car le champ numeroSecu stocke un ciphertext AES-GCM (IV aléatoire, non recherchable).
    numeroSecuHash: { type: String, sparse: true, index: true, select: false },
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
// Index sur numeroSecu supprimé — le ciphertext AES-GCM (IV aléatoire) est non-déterministe.
// La recherche se fait via numeroSecuHash (HMAC-SHA256, défini dans le schéma ci-dessus).
patientSchema.index({ telephone: 1 }, { sparse: true });
patientSchema.index({ email: 1 }, { sparse: true });
patientSchema.index({ deletedAt: 1 });
patientSchema.index({ "gdpr.anonymized": 1 });
patientSchema.index({ "gdpr.deletionRequested": 1 });

// ── Chiffrement du numéro de sécurité sociale (AES-256-GCM) ──────────────────
patientSchema.pre("save", function (next) {
  if (this.isModified("numeroSecu") && this.numeroSecu) {
    // Hash calculé sur la valeur EN CLAIR avant chiffrement (HMAC-SHA256 déterministe)
    this.numeroSecuHash = hashDeterministic(this.numeroSecu);
    this.numeroSecu = encrypt(this.numeroSecu);
  }
  next();
});

patientSchema.post("init", function (doc) {
  if (doc.numeroSecu) {
    doc.numeroSecu = decrypt(doc.numeroSecu);
  }
});

// ── Numéro patient atomique : PAT-YYYYMMDD-XXXX ──────────────────────────────
// Counter MongoDB atomique ($inc + upsert) → pas de race condition multi-instance.
patientSchema.pre("save", async function (next) {
  if (!this.numeroPatient) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const counter = await Counter.findOneAndUpdate(
      { _id: "patient" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.numeroPatient = `PAT-${date}-${String(counter.seq).padStart(4, "0")}`;
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
