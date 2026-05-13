/**
 * BlancBleu — Modèle Notification (PART E)
 *
 * Persistance des notifications liées aux événements du transport.
 * Complète le canal Socket.IO temps réel par un historique consultable.
 */

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // ── Destinataire ──────────────────────────────────────────────────────────
    recipientId:   { type: mongoose.Schema.Types.ObjectId, ref: "User",      default: null },
    recipientRole: { type: String, default: null }, // diffusion par rôle (admin, dispatcher…)

    // ── Contenu ───────────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: [
        "TRANSPORT_CREATED",
        "TRANSPORT_CONFIRMED",
        "TRANSPORT_SCHEDULED",
        "VEHICLE_ASSIGNED",
        "DRIVER_ACCEPTED",
        "DRIVER_REJECTED",
        "EN_ROUTE",
        "ARRIVED_PICKUP",
        "PATIENT_ON_BOARD",
        "ARRIVED_DESTINATION",
        "COMPLETED",
        "NO_SHOW",
        "CANCELLED",
        "RESCHEDULED",
        "BILLING_PENDING",
        "BILLED",
        "PAID",
        "FAILED",
        "SIGNATURE_ADDED",
        "PMT_UPLOADED",
        "PMT_OCR_DONE",
        "STATUS_CHANGED",
        // ── Alertes flotte (PHASE 5) ──────────────────────────────────────────
        "MAINTENANCE_DUE",
        "MAINTENANCE_OVERDUE",
        "VEHICLE_BLOCKED",
        "VEHICLE_OUT_OF_SERVICE",
        "HIGH_UTILIZATION",
        "LOW_UTILIZATION",
      ],
      required: true,
    },
    title:   { type: String, required: true },
    message: { type: String, default: "" },

    // ── Liens ─────────────────────────────────────────────────────────────────
    transportId: { type: mongoose.Schema.Types.ObjectId, ref: "Transport", default: null },
    vehicleId:   { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle",   default: null },
    metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── État ──────────────────────────────────────────────────────────────────
    read:      { type: Boolean, default: false },
    readAt:    { type: Date,    default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, read: 1, createdAt: -1 });
notificationSchema.index({ transportId: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
