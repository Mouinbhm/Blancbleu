/**
 * BlancBleu — Modèle Equipement
 * Adapté transport sanitaire — ref Vehicle au lieu de Unit
 */
const mongoose = require("mongoose");

const equipementSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, "Nom obligatoire"],
      trim: true,
      index: true,
    },
    numeroSerie: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    fabricant: { type: String, trim: true, default: "" },
    modele: { type: String, trim: true, default: "" },

    categorie: {
      type: String,
      required: true,
      index: true,
      enum: [
        "Défibrillateur",
        "Monitoring",
        "Ventilation",
        "Oxymétrie",
        "Perfusion",
        "Immobilisation",
        "Protection",
        "Médicament",
        "Autre",
      ],
    },
    niveauPriorite: {
      type: String,
      enum: ["critique", "élevé", "normal", "faible"],
      default: "normal",
    },
    quantite: { type: Number, default: 1, min: 0 },
    prix:     { type: Number, default: 0, min: 0 },

    etat: {
      type: String,
      index: true,
      enum: [
        "opérationnel",
        "en-panne",
        "à-vérifier",
        "retiré",
        "en-réparation",
      ],
      default: "opérationnel",
    },
    estActif: { type: Boolean, default: true, index: true },

    // ← ref "Vehicle" remplace "Unit"
    uniteAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
      index: true,
    },
    typeLocalisation: {
      type: String,
      enum: ["ambulance", "base", "hôpital", "dépôt", "inconnu"],
      default: "base",
    },

    dateExpiration: { type: Date },
    prochainControle: { type: Date },
    dateAchat: { type: Date },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Equipement", equipementSchema);
