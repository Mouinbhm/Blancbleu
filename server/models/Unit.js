const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    // ─── Identification ───────────────────────────────────────────────
    immatriculation: {
      type: String,
      required: [true, "L'immatriculation est obligatoire"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    nom: {
      type: String,
      required: [true, "Le nom de l'unité est obligatoire"],
      trim: true,
    },
    type: {
      type: String,
      enum: ["VSAV", "UMH", "VSL", "SMUR", "Hélicoptère"],
      default: "VSAV",
    },

    // ─── Statut opérationnel ──────────────────────────────────────────
    statut: {
      type: String,
      enum: ["disponible", "en_mission", "indisponible", "maintenance"],
      default: "disponible",
    },

    // ─── Position GPS ─────────────────────────────────────────────────
    position: {
      lat: { type: Number, default: 48.8566 },
      lng: { type: Number, default: 2.3522 },
      adresse: { type: String, default: "Base principale" },
      derniereMaj: { type: Date, default: Date.now },
    },

    // ─── Équipage ─────────────────────────────────────────────────────
    equipage: [
      {
        nom: { type: String },
        role: {
          type: String,
          enum: ["Ambulancier", "Infirmier", "Médecin", "Secouriste"],
        },
        actif: { type: Boolean, default: true },
      },
    ],

    // ─── Intervention en cours ────────────────────────────────────────
    interventionEnCours: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Intervention",
      default: null,
    },

    // ─── Infos véhicule ───────────────────────────────────────────────
    annee: { type: Number },
    kilometrage: { type: Number, default: 0 },
    carburant: { type: Number, min: 0, max: 100, default: 100 },
    notes: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Unit", unitSchema);
