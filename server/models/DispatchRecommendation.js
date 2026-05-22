/**
 * BlancBleu — Modèle DispatchRecommendation
 *
 * Une recommandation IA = un snapshot complet du calcul de dispatch pour un
 * transport donné. Stocké dans sa propre collection (au lieu du sous-doc
 * `Transport.aiDispatch`) pour :
 *   - garder un historique (plusieurs recommandations possibles)
 *   - mesurer le taux d'acceptation / rejet
 *   - analyser les critères les plus discriminants
 */

const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    vehiculeId:  { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    chauffeurId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel" },
    vehicleName: String,
    driverName:  String,
    score:       { type: Number, min: 0, max: 100 },
    rank:        Number,
    label:       String, // "Meilleur choix", "Bon choix", "Acceptable", …
    criteriaScores: {
      distance:           Number,
      driverAvailability: Number,
      vehicleTypeMatch:   Number,
      planningLoad:       Number,
      traffic:            Number,
      medicalPriority:    Number,
      punctualityHistory: Number,
    },
    explanation: [String],
    risks:       [String],
    warnings:    [String],
    etaMinutes:  Number,
  },
  { _id: false },
);

const excludedSchema = new mongoose.Schema(
  {
    vehiculeId:      { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    immatriculation: String,
    raison:          String,
  },
  { _id: false },
);

const dispatchRecSchema = new mongoose.Schema(
  {
    transportId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Transport",
      required: true,
      index:    true,
    },
    generatedAt: { type: Date, required: true, default: Date.now },
    source:      { type: String, enum: ["ia", "fallback_node"], default: "ia" },
    weights:     mongoose.Schema.Types.Mixed,

    recommendations:    [candidateSchema],
    bestRecommendation: candidateSchema,
    excludedCandidates: [excludedSchema],

    summary: {
      totalCandidates:    Number,
      eligibleCandidates: Number,
      excludedCandidates: Number,
    },

    // Décision dispatcher
    decision: {
      status: {
        type:    String,
        enum:    ["pending", "accepted", "rejected"],
        default: "pending",
      },
      decidedAt:        Date,
      decidedBy:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rejectionReason:  String,
      finalVehiculeId:  { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
      finalChauffeurId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel" },
    },
  },
  { timestamps: true },
);

dispatchRecSchema.index({ transportId: 1, generatedAt: -1 });
dispatchRecSchema.index({ "decision.status": 1 });

module.exports = mongoose.model("DispatchRecommendation", dispatchRecSchema);
