/**
 * BlancBleu — TransportFeature
 *
 * Snapshot des features (entrée modèle) + cible (durée réelle observée) capturé
 * à la complétion de chaque transport. Sert de dataset d'entraînement pour le
 * DurationPredictor (cf. ai-service/data/train_real.py).
 *
 * Idempotent : transportId unique → un featureCollectorService.capture est sûr
 * à rejouer (upsert sur transportId).
 */
const mongoose = require("mongoose");

const transportFeatureSchema = new mongoose.Schema(
  {
    transportId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Transport",
      required: true,
      unique:   true,
      index:    true,
    },

    // ── Features (entrée modèle) ─────────────────────────────────────────────
    distanceKm:   { type: Number, required: true, min: 0 },
    heureDepart:  { type: Number, min: 0, max: 23 }, // heure entière 0-23
    jourSemaine:  { type: Number, min: 0, max: 6 },  // 0 = dimanche
    mobilite:     { type: String, enum: ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"] },
    typeVehicule: { type: String, enum: ["VSL", "TPMR", "AMBULANCE"] },
    motif:        { type: String },
    allerRetour:  { type: Boolean, default: false },
    oxygene:      { type: Boolean, default: false },
    brancardage:  { type: Boolean, default: false },

    // ── Cible (sortie modèle) ────────────────────────────────────────────────
    dureeReelleMinutes: { type: Number, required: true, min: 0 },

    // ── Méta ─────────────────────────────────────────────────────────────────
    completedAt: { type: Date, required: true, index: true },
    source:      { type: String, default: "real", enum: ["real", "synthetic"] },
  },
  { timestamps: true },
);

transportFeatureSchema.index({ completedAt: -1 });

module.exports = mongoose.model("TransportFeature", transportFeatureSchema);
