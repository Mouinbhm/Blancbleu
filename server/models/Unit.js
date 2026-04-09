/**
 * BlancBleu — Modèle Unit v2.0
 * Ambulances avec géolocalisation temps réel
 */
const mongoose = require("mongoose");

const equipageSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true },
    role: {
      type: String,
      enum: ["Médecin", "Infirmier", "Ambulancier", "Secouriste", "Chauffeur"],
      required: true,
    },
  },
  { _id: false },
);

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    adresse: { type: String, default: "" },
    vitesse: { type: Number, default: 0, min: 0 }, // km/h
    cap: { type: Number, default: 0, min: 0, max: 360 }, // degrés
    precision: { type: Number, default: 10 }, // mètres
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const unitSchema = new mongoose.Schema(
  {
    // ── Identification ─────────────────────────────────────────────────────
    immatriculation: {
      type: String,
      required: [true, "Immatriculation obligatoire"],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9\-]+$/, "Format immatriculation invalide"],
    },

    nom: {
      type: String,
      required: [true, "Nom obligatoire"],
      trim: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["VSAV", "SMUR", "VSL", "VPSP", "AR"],
      index: true,
    },

    // ── Statut opérationnel ────────────────────────────────────────────────
    statut: {
      type: String,
      enum: [
        "disponible",
        "en_mission",
        "maintenance",
        "hors_service",
        "pause",
      ],
      default: "disponible",
      index: true,
    },

    // ── Géolocalisation temps réel ─────────────────────────────────────────
    position: {
      type: locationSchema,
      default: () => ({
        lat: 43.7102,
        lng: 7.262,
        adresse: "Base principale Nice",
      }),
    },

    // Historique des 10 dernières positions (trail sur la carte)
    positionsHistorique: {
      type: [locationSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "Maximum 10 positions dans l'historique",
      },
    },

    // ── Équipage ───────────────────────────────────────────────────────────
    equipage: {
      type: [equipageSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: "Maximum 5 membres d'équipage",
      },
    },

    // ── Véhicule ───────────────────────────────────────────────────────────
    carburant: { type: Number, min: 0, max: 100, default: 100 },
    annee: { type: Number, min: 2000, max: new Date().getFullYear() + 1 },
    kilometrage: { type: Number, min: 0, default: 0 },

    // ── Intervention en cours ──────────────────────────────────────────────
    interventionEnCours: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Intervention",
      default: null,
    },

    // ── Socket.IO ─────────────────────────────────────────────────────────
    socketId: { type: String, default: null }, // socket de l'ambulance mobile

    // ── Notes ─────────────────────────────────────────────────────────────
    notes: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

// ── Index géospatial 2dsphere ──────────────────────────────────────────────
unitSchema.index({ "position.lat": 1, "position.lng": 1 });
unitSchema.index({ statut: 1, type: 1 });
unitSchema.index({ socketId: 1 }, { sparse: true });

// ── Méthodes ───────────────────────────────────────────────────────────────
unitSchema.methods.updateLocation = async function (lat, lng, metadata = {}) {
  // Sauvegarder position actuelle dans l'historique (max 10)
  if (this.position?.lat) {
    this.positionsHistorique.unshift({
      ...(this.position.toObject?.() || this.position),
    });
    if (this.positionsHistorique.length > 10) {
      this.positionsHistorique = this.positionsHistorique.slice(0, 10);
    }
  }
  // Mettre à jour position courante
  this.position = {
    lat,
    lng,
    adresse: metadata.adresse || this.position.adresse,
    vitesse: metadata.vitesse || 0,
    cap: metadata.cap || 0,
    precision: metadata.precision || 10,
    updatedAt: new Date(),
  };
  return this.save();
};

// ── Virtual : est disponible ───────────────────────────────────────────────
unitSchema.virtual("estDisponible").get(function () {
  return this.statut === "disponible";
});

unitSchema.set("toJSON", { virtuals: true });
unitSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Unit", unitSchema);
