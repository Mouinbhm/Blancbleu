const mongoose = require("mongoose");
const { STATUTS, LABELS } = require("../services/stateMachine");

// ─── Sous-schéma : entrée journal de transitions ──────────────────────────────
const journalSchema = new mongoose.Schema(
  {
    de: { type: String },
    vers: { type: String },
    timestamp: { type: Date, default: Date.now },
    utilisateur: { type: String, default: "système" },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

// ─── Sous-schéma : patient ────────────────────────────────────────────────────
const patientSchema = new mongoose.Schema(
  {
    nom: { type: String, default: "Inconnu" },
    age: { type: Number, min: 0, max: 150 },
    sexe: { type: String, enum: ["M", "F", "inconnu"], default: "inconnu" },
    etat: {
      type: String,
      enum: ["conscient", "inconscient", "critique", "stable", "inconnu"],
      default: "inconnu",
    },
    symptomes: [{ type: String }],
    nbVictimes: { type: Number, default: 1, min: 1 },
    antecedents: { type: String, default: "" },
  },
  { _id: false },
);

// ─── Schéma principal ─────────────────────────────────────────────────────────
const interventionSchema = new mongoose.Schema(
  {
    // ── Identification ────────────────────────────────────────────────────────
    numero: {
      type: String,
      unique: true,
      index: true,
    },

    // ── Classification ────────────────────────────────────────────────────────
    typeIncident: {
      type: String,
      required: [true, "Le type d'incident est obligatoire"],
      enum: [
        "Arrêt cardiaque",
        "Accident de la route",
        "AVC",
        "Traumatisme grave",
        "Détresse respiratoire",
        "Douleur thoracique",
        "Intoxication",
        "Accouchement",
        "Malaise",
        "Brûlure",
        "Chute",
        "Autre",
      ],
    },

    priorite: {
      type: String,
      enum: ["P1", "P2", "P3"],
      default: "P2",
      index: true,
    },

    scoreIA: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // ── STATUT — State Machine ────────────────────────────────────────────────
    statut: {
      type: String,
      enum: Object.values(STATUTS),
      default: STATUTS.CREATED,
      index: true,
    },

    // ── Localisation ──────────────────────────────────────────────────────────
    adresse: {
      type: String,
      required: [true, "L'adresse est obligatoire"],
    },

    coordonnees: {
      lat: { type: Number },
      lng: { type: Number },
    },

    // ── Horodatages par statut ────────────────────────────────────────────────
    heureCreation: { type: Date },
    heureValidation: { type: Date },
    heureAssignation: { type: Date },
    heureDepart: { type: Date }, // EN_ROUTE
    heureArrivee: { type: Date }, // ON_SITE
    heureTransport: { type: Date }, // TRANSPORTING
    heureTerminee: { type: Date }, // COMPLETED
    heureAnnulation: { type: Date }, // CANCELLED

    // ── Durée calculée (en minutes) ───────────────────────────────────────────
    dureeMinutes: { type: Number },

    // ── Patient ───────────────────────────────────────────────────────────────
    patient: { type: patientSchema, default: {} },

    // ── Ressources ────────────────────────────────────────────────────────────
    unitAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
    },

    dispatcher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ── Destination (hôpital d'accueil) ──────────────────────────────────────
    hopitalDestination: {
      nom: { type: String, default: "" },
      adresse: { type: String, default: "" },
      coords: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },

    // ── Journal des transitions (state machine) ───────────────────────────────
    journal: [journalSchema],

    // ── Annulation ────────────────────────────────────────────────────────────
    raisonAnnulation: { type: String, default: "" },

    // ── Notes ─────────────────────────────────────────────────────────────────
    notes: { type: String, default: "" },
  },
  {
    timestamps: true, // createdAt + updatedAt automatiques
  },
);

// ── Index composés pour les requêtes fréquentes ───────────────────────────────
interventionSchema.index({ statut: 1, priorite: 1 });
interventionSchema.index({ createdAt: -1 });
interventionSchema.index({ unitAssignee: 1, statut: 1 });

// ── Génération automatique du numéro ─────────────────────────────────────────
interventionSchema.pre("save", async function (next) {
  // Horodatage création
  if (this.isNew) {
    this.heureCreation = new Date();
  }

  // Numéro unique : INT-YYYYMMDD-XXXX
  if (!this.numero) {
    const today = new Date();
    const date = today.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await mongoose.model("Intervention").countDocuments();
    this.numero = `INT-${date}-${String(count + 1).padStart(4, "0")}`;
  }

  next();
});

// ── Méthodes virtuelles ───────────────────────────────────────────────────────
interventionSchema.virtual("label").get(function () {
  return LABELS[this.statut]?.fr || this.statut;
});

interventionSchema.virtual("progression").get(function () {
  const ordre = [
    "CREATED",
    "VALIDATED",
    "ASSIGNED",
    "EN_ROUTE",
    "ON_SITE",
    "TRANSPORTING",
    "COMPLETED",
  ];
  const idx = ordre.indexOf(this.statut);
  return idx === -1 ? null : Math.round((idx / (ordre.length - 1)) * 100);
});

interventionSchema.virtual("estTerminee").get(function () {
  return ["COMPLETED", "CANCELLED"].includes(this.statut);
});

interventionSchema.virtual("tmr").get(function () {
  if (!this.heureCreation || !this.heureArrivee) return null;
  return Math.round(
    (new Date(this.heureArrivee) - new Date(this.heureCreation)) / 60000,
  );
});

interventionSchema.set("toJSON", { virtuals: true });
interventionSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Intervention", interventionSchema);
