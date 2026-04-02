const mongoose = require("mongoose");

const maintenanceSchema = new mongoose.Schema(
  {
    // ─── Unité concernée ──────────────────────────────────────────
    unite: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },

    // ─── Type d'intervention ──────────────────────────────────────
    type: {
      type: String,
      required: true,
      enum: [
        "Révision complète",
        "Vidange + filtres",
        "Changement freins",
        "Changement pneus",
        "Contrôle technique",
        "Réparation moteur",
        "Carrosserie",
        "Électricité",
        "Autre",
      ],
    },

    // ─── Statut ───────────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["planifié", "en-cours", "terminé", "annulé"],
      default: "planifié",
    },

    // ─── Planning ─────────────────────────────────────────────────
    dateDebut: { type: Date, required: true },
    dateFin: { type: Date },

    // ─── Prestataire ──────────────────────────────────────────────
    garage: { type: String, trim: true },
    cout: { type: Number, default: 0 },

    // ─── Kilométrage au moment de la maintenance ──────────────────
    kilometrage: { type: Number },

    // ─── Responsable ─────────────────────────────────────────────
    responsable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ─── Notes ────────────────────────────────────────────────────
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Maintenance", maintenanceSchema);
