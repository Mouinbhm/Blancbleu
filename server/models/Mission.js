/**
 * BlancBleu — Modèle Mission v1.0
 * Représente l'exécution opérationnelle réelle d'un transport.
 * Transport = demande métier  →  Mission = exécution terrain.
 *
 * Un transport ASSIGNED crée une Mission. Quand la Mission est terminée,
 * le Transport passe à COMPLETED et une Facture peut être générée.
 */
const mongoose = require("mongoose");

const iaRecommendationSchema = new mongoose.Schema(
  {
    suggestedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    suggestedDriverId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel" },
    confidence: { type: Number, min: 0, max: 1 },
    justification: { type: String, default: "" },
    alternatives: [
      {
        vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel" },
        score: { type: Number },
        _id: false,
      },
    ],
    generatedAt: { type: Date },
  },
  { _id: false },
);

const missionSchema = new mongoose.Schema(
  {
    // ── Liens métier ──────────────────────────────────────────────────────────
    transportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      required: [true, "Le transport est obligatoire"],
      unique: true, // Une seule mission active par transport
      index: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    chauffeurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Personnel",
      default: null,
    },
    personnelIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Personnel",
      },
    ],

    // ── Statut opérationnel ───────────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["planifiee", "assignee", "en_cours", "terminee", "annulee"],
      default: "planifiee",
      index: true,
    },

    // ── Mode de dispatch ──────────────────────────────────────────────────────
    dispatchMode: {
      type: String,
      enum: ["manuel", "auto", "ia"],
      default: "manuel",
    },
    scoreDispatch: { type: Number, default: null },
    iaRecommendation: { type: iaRecommendationSchema, default: null },

    // ── Horodatages réels (terrain) ────────────────────────────────────────────
    plannedAt: { type: Date },       // Mission planifiée
    assignedAt: { type: Date },      // Véhicule + chauffeur assignés
    startedAt: { type: Date },       // Départ vers le patient (en route)
    pickupAt: { type: Date },        // Arrivée chez le patient
    onboardAt: { type: Date },       // Patient à bord
    arrivedDestinationAt: { type: Date }, // Arrivée à destination
    waitStartAt: { type: Date },     // Début de l'attente sur place
    returnStartAt: { type: Date },   // Départ retour à la base
    completedAt: { type: Date },     // Mission terminée
    cancelledAt: { type: Date },     // Mission annulée

    // ── Métriques réelles ──────────────────────────────────────────────────────
    dureeReelleMinutes: { type: Number, default: null },
    distanceReelleKm: { type: Number, default: null },
    dureeAttenteMinutes: { type: Number, default: null },

    // ── Retour / aller-retour ──────────────────────────────────────────────────
    estRetour: { type: Boolean, default: false },

    // ── Annulation ────────────────────────────────────────────────────────────
    raisonAnnulation: { type: String, default: "" },

    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

// ── Index ─────────────────────────────────────────────────────────────────────
missionSchema.index({ statut: 1, plannedAt: 1 });
missionSchema.index({ vehicleId: 1, statut: 1 });
missionSchema.index({ chauffeurId: 1, statut: 1 });

// ── Virtual : durée formatée ──────────────────────────────────────────────────
missionSchema.virtual("dureeFormatee").get(function () {
  if (!this.dureeReelleMinutes) return null;
  const h = Math.floor(this.dureeReelleMinutes / 60);
  const m = this.dureeReelleMinutes % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
});

missionSchema.set("toJSON", { virtuals: true });
missionSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Mission", missionSchema);
