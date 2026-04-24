/**
 * BlancBleu — Modèle Personnel v2.0
 * Transport sanitaire NON urgent
 */
const mongoose = require("mongoose");

const certificationSchema = new mongoose.Schema(
  {
    nom:            { type: String },
    dateObtention:  { type: Date },
    dateExpiration: { type: Date },
  },
  { _id: false },
);

const personnelSchema = new mongoose.Schema(
  {
    // ─── Identité ─────────────────────────────────────────────────────────────
    nom:            { type: String, required: true, trim: true },
    prenom:         { type: String, required: true, trim: true },
    dateNaissance:  { type: Date },
    adresse:        { type: String, default: "" },
    photoUrl:       { type: String, default: "" },

    // ─── Rôle professionnel ───────────────────────────────────────────────────
    role: {
      type: String,
      required: true,
      enum: ["Ambulancier", "Secouriste", "Infirmier", "Médecin", "Chauffeur", "Autre"],
    },

    // ─── Contrat ──────────────────────────────────────────────────────────────
    typeContrat: {
      type: String,
      enum: ["CDI", "CDD", "Intérim", "Stage", "Alternance", ""],
      default: "",
    },
    dateEmbauche: { type: Date },

    // ─── Statut opérationnel ──────────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["en-service", "conge", "formation", "maladie", "inactif"],
      default: "en-service",
    },

    // ─── Véhicule assigné ─────────────────────────────────────────────────────
    uniteAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },

    // ─── Lien compte de connexion (optionnel) ─────────────────────────────────
    // Permet de relier un employé métier à un compte User (login) si nécessaire.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ─── Coordonnées ──────────────────────────────────────────────────────────
    telephone: { type: String, trim: true },
    email:     { type: String, trim: true, lowercase: true },

    // ─── Permis de conduire ───────────────────────────────────────────────────
    numeroPermis:    { type: String, default: "" },
    permisExpiration:{ type: Date },

    // ─── Certifications & formations ─────────────────────────────────────────
    certifications: { type: [certificationSchema], default: [] },

    // ─── Disponibilités (jours de la semaine) ─────────────────────────────────
    // { Lundi: true, Mardi: false, ... }
    disponibilites: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ─── Divers RH ────────────────────────────────────────────────────────────
    notes:  { type: String, default: "" },
    actif:  { type: Boolean, default: true },
  },
  { timestamps: true },
);

personnelSchema.index({ statut: 1, role: 1 });
personnelSchema.index({ nom: 1, prenom: 1 });

module.exports = mongoose.model("Personnel", personnelSchema);
