/**
 * BlancBleu — Modèle AuditLog v4.0
 * Transport sanitaire NON urgent
 *
 * Trace chaque action critique de la plateforme.
 * Conservation : 90 jours (TTL) — conformité RGPD données de santé.
 */
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    // ── Qui ───────────────────────────────────────────────────────────────────
    utilisateur: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      email: { type: String, default: "système" },
      role: { type: String, default: "système" },
      ip: { type: String, default: "" },
    },

    // ── Quoi ──────────────────────────────────────────────────────────────────
    action: {
      type: String,
      required: true,
      enum: [
        // ── Transport (cycle de vie complet) ──────────────────────────────
        "TRANSPORT_CREATED",
        "TRANSPORT_UPDATED",
        "TRANSPORT_DELETED",
        "TRANSPORT_CONFIRMED",
        "TRANSPORT_SCHEDULED",
        "TRANSPORT_CANCELLED",
        "TRANSPORT_NO_SHOW",
        "TRANSPORT_RESCHEDULED",
        "STATUT_CHANGED",

        // ── Affectation ───────────────────────────────────────────────────
        "VEHICULE_ASSIGNED",
        "VEHICULE_UNASSIGNED",
        "DISPATCH_AUTO",
        "DISPATCH_MANUEL",

        // ── Véhicule ──────────────────────────────────────────────────────
        "VEHICULE_CREATED",
        "VEHICULE_UPDATED",
        "VEHICULE_STATUS_CHANGED",
        "VEHICULE_DELETED",

        // ── PMT (Prescription Médicale de Transport) ──────────────────────
        "PMT_UPLOADED",
        "PMT_EXTRACTED",
        "PMT_VALIDATED",
        "PMT_REJECTED",
        "PMT_CORRECTED",

        // ── IA ────────────────────────────────────────────────────────────
        "IA_DISPATCH_SUGGESTION",
        "IA_DISPATCH_REQUESTED",
        "IA_DISPATCH_RECOMMENDED",
        "IA_DISPATCH_ACCEPTED",
        "IA_DISPATCH_REJECTED",
        "IA_DISPATCH_FALLBACK_USED",
        "IA_ROUTE_OPTIMIZATION",
        "IA_FALLBACK",

        // ── Facturation ───────────────────────────────────────────────────
        "FACTURE_CREATED",
        "FACTURE_UPDATED",
        "FACTURE_PAID",

        // ── Patient — RGPD ────────────────────────────────────────────────
        "PATIENT_VIEWED",
        "PATIENT_CREATED",
        "PATIENT_UPDATED",
        "PATIENT_EXPORTED",
        "PATIENT_ANONYMIZED",
        "PATIENT_DELETION_REQUESTED",
        "PATIENT_DELETION_CANCELLED",
        "PATIENT_CONSENT_UPDATED",

        // ── Documents médicaux ────────────────────────────────────────────
        "PRESCRIPTION_VIEWED",
        "INVOICE_VIEWED",

        // ── Authentification ──────────────────────────────────────────────
        "LOGIN",
        "LOGOUT",
        "LOGIN_FAILED",
        "PASSWORD_RESET",
      ],
    },

    // ── Origine de l'action ───────────────────────────────────────────────────
    origine: {
      type: String,
      enum: ["IA", "HUMAIN", "SYSTÈME", "API"],
      default: "HUMAIN",
    },

    // ── Ressource concernée ───────────────────────────────────────────────────
    ressource: {
      type: { type: String, default: "Autre" },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      reference: { type: String, default: "" }, // ex: "TRS-20240115-0042"
    },

    // ── Détail de l'événement ─────────────────────────────────────────────────
    details: {
      avant: { type: mongoose.Schema.Types.Mixed, default: null },
      apres: { type: mongoose.Schema.Types.Mixed, default: null },
      metadata: { type: mongoose.Schema.Types.Mixed, default: null },
      message: { type: String, default: "" },
    },

    // ── Résultat ──────────────────────────────────────────────────────────────
    succes: { type: Boolean, default: true },
    erreur: { type: String, default: "" },

    // ── Contexte HTTP ─────────────────────────────────────────────────────────
    route: { type: String, default: "" },
    methode: { type: String, default: "" },
    dureeMs: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// TTL automatique — suppression après 90 jours (RGPD)
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// Index pour les requêtes fréquentes
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ "ressource.id": 1 });
auditLogSchema.index({ "utilisateur.email": 1 });
auditLogSchema.index({ origine: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
