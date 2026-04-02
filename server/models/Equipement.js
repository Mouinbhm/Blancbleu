const mongoose = require("mongoose");

const equipementSchema = new mongoose.Schema(
  {
    // ─── Identification ───────────────────────────────────────────
    nom: { type: String, required: true, trim: true },
    reference: { type: String, trim: true },
    categorie: {
      type: String,
      enum: [
        "Défibrillateur",
        "Oxymétrie",
        "Ventilation",
        "Immobilisation",
        "Médicament",
        "Monitoring",
        "Autre",
      ],
      default: "Autre",
    },

    // ─── Unité assignée ───────────────────────────────────────────
    uniteAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
    },

    // ─── État ─────────────────────────────────────────────────────
    etat: {
      type: String,
      enum: ["opérationnel", "à-vérifier", "en-panne", "réformé"],
      default: "opérationnel",
    },

    // ─── Dates de contrôle ────────────────────────────────────────
    dernierControle: { type: Date },
    prochainControle: { type: Date },
    dateExpiration: { type: Date },

    // ─── Notes ────────────────────────────────────────────────────
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Equipement", equipementSchema);
