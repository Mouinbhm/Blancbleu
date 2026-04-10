/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — Modèle Equipement v2.0                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const mongoose = require("mongoose");

const equipementSchema = new mongoose.Schema(
  {
    // ── Identification ─────────────────────────────────────────────────────
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

    // ── Classification ─────────────────────────────────────────────────────
    categorie: {
      type: String,
      required: true,
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
      index: true,
    },

    niveauPriorite: {
      type: String,
      enum: ["critique", "élevé", "normal", "faible"],
      default: "normal",
    },

    quantite: {
      type: Number,
      default: 1,
      min: [0, "Quantité ne peut pas être négative"],
    },

    // ── ÉTAT ──────────────────────────────────────────────────────────────
    etat: {
      type: String,
      enum: [
        "opérationnel",
        "en-panne",
        "à-vérifier",
        "retiré",
        "en-réparation",
      ],
      default: "opérationnel",
      index: true,
    },

    estActif: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ── AFFECTATION ────────────────────────────────────────────────────────
    uniteAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
      index: true,
    },

    typeLocalisation: {
      type: String,
      enum: ["ambulance", "base", "hôpital", "dépôt", "inconnu"],
      default: "base",
    },

    // ── DATES CRITIQUES ────────────────────────────────────────────────────
    dateAchat: {
      type: Date,
      default: null,
    },

    dernierControle: {
      type: Date,
      default: null,
      index: true,
    },

    prochainControle: {
      type: Date,
      default: null,
      index: true,
    },

    dateExpiration: {
      type: Date,
      default: null,
      index: true,
    },

    // Intervalle de contrôle en jours (ex: 90 pour tous les 3 mois)
    intervalleControlJours: {
      type: Number,
      default: 90,
      min: 1,
    },

    // ── NOTES ──────────────────────────────────────────────────────────────
    notes: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

// ── Index composés ─────────────────────────────────────────────────────────
equipementSchema.index({ etat: 1, estActif: 1 });
equipementSchema.index({ dateExpiration: 1, estActif: 1 });
equipementSchema.index({ prochainControle: 1, estActif: 1 });
equipementSchema.index({ uniteAssignee: 1, etat: 1 });

// ── Virtuals ───────────────────────────────────────────────────────────────

// Est expiré ?
equipementSchema.virtual("estExpire").get(function () {
  if (!this.dateExpiration) return false;
  return new Date(this.dateExpiration) < new Date();
});

// Contrôle en retard ?
equipementSchema.virtual("controleEnRetard").get(function () {
  if (!this.prochainControle) return false;
  return new Date(this.prochainControle) < new Date();
});

// Jours avant expiration
equipementSchema.virtual("joursAvantExpiration").get(function () {
  if (!this.dateExpiration) return null;
  return Math.ceil(
    (new Date(this.dateExpiration) - new Date()) / (1000 * 3600 * 24),
  );
});

// ── Pre-save : calculer prochain contrôle auto ─────────────────────────────
equipementSchema.pre("save", function (next) {
  if (this.isModified("dernierControle") && this.dernierControle) {
    const d = new Date(this.dernierControle);
    d.setDate(d.getDate() + (this.intervalleControlJours || 90));
    this.prochainControle = d;
  }
  next();
});

equipementSchema.set("toJSON", { virtuals: true });
equipementSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Equipement", equipementSchema);
