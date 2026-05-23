/**
 * BlancBleu — DispatchConfig
 *
 * Singleton (un seul document, _id = "default") qui stocke les pondérations
 * du scoring multicritère de dispatch. Édité par les admins via l'UI
 * /admin/dispatch-config, lu par aiClient.recommanderDispatch avant chaque
 * appel au microservice Python.
 *
 * Validation métier : sum(weights) == 1.0 (± 1e-3). Sinon save rejetée.
 */
const mongoose = require("mongoose");

const DEFAULT_WEIGHTS = {
  distance:           0.25,
  driverAvailability: 0.20,
  vehicleTypeMatch:   0.20,
  planningLoad:       0.15,
  traffic:            0.10,
  medicalPriority:    0.05,
  punctualityHistory: 0.05,
};

const dispatchConfigSchema = new mongoose.Schema(
  {
    _id:       { type: String, default: "default" },
    weights: {
      distance:           { type: Number, default: DEFAULT_WEIGHTS.distance,           min: 0, max: 1 },
      driverAvailability: { type: Number, default: DEFAULT_WEIGHTS.driverAvailability, min: 0, max: 1 },
      vehicleTypeMatch:   { type: Number, default: DEFAULT_WEIGHTS.vehicleTypeMatch,   min: 0, max: 1 },
      planningLoad:       { type: Number, default: DEFAULT_WEIGHTS.planningLoad,       min: 0, max: 1 },
      traffic:            { type: Number, default: DEFAULT_WEIGHTS.traffic,            min: 0, max: 1 },
      medicalPriority:    { type: Number, default: DEFAULT_WEIGHTS.medicalPriority,    min: 0, max: 1 },
      punctualityHistory: { type: Number, default: DEFAULT_WEIGHTS.punctualityHistory, min: 0, max: 1 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, _id: false }, // _id custom → désactive l'ObjectId auto
);

// Validation : la somme des poids doit valoir 1.0 (± 1e-3)
function sumWeights(w) {
  if (!w) return 0;
  return Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);
}

dispatchConfigSchema.pre("save", function (next) {
  const sum = sumWeights(this.weights);
  if (Math.abs(sum - 1.0) > 1e-3) {
    return next(new Error(`Somme des poids invalide : ${sum.toFixed(3)} (attendu 1.0 ± 0.001)`));
  }
  next();
});

// Validation aussi sur les updates atomiques utilisés par les routes (PUT)
dispatchConfigSchema.pre(["findOneAndUpdate", "updateOne"], function (next) {
  const update = this.getUpdate() || {};
  const weights = update.weights || update.$set?.weights;
  if (!weights) return next();
  const sum = sumWeights(weights);
  if (Math.abs(sum - 1.0) > 1e-3) {
    return next(new Error(`Somme des poids invalide : ${sum.toFixed(3)} (attendu 1.0 ± 0.001)`));
  }
  next();
});

const DispatchConfig = mongoose.model("DispatchConfig", dispatchConfigSchema);

DispatchConfig.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
module.exports = DispatchConfig;
