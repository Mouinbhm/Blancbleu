/**
 * Migration des recommandations IA stockées dans Transport.aiDispatch
 * vers la nouvelle collection DispatchRecommendation.
 *
 * Idempotent : ne crée pas de nouveau DispatchRecommendation si le transport
 * a déjà un lastRecommendationId pointant vers un document existant.
 *
 * Conserve Transport.aiDispatch intact pour rétrocompatibilité ; ce sous-doc
 * sera retiré dans un sprint ultérieur.
 *
 * Usage :
 *   MONGO_URI=... node server/scripts/migrate-aidispatch-to-collection.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const Transport               = require("../models/Transport");
  const DispatchRecommendation  = require("../models/DispatchRecommendation");

  // Sélectionne uniquement les transports ayant une recommandation persistée
  const cursor = Transport.find({
    "aiDispatch.score":      { $ne: null },
    "aiDispatch.recommendedVehicleId": { $ne: null },
  }).cursor();

  let créés = 0;
  let ignorés = 0;

  for await (const t of cursor) {
    // Idempotence : déjà migré ?
    if (t.aiDispatch?.lastRecommendationId) {
      const exists = await DispatchRecommendation.exists({ _id: t.aiDispatch.lastRecommendationId });
      if (exists) { ignorés++; continue; }
    }

    const isFallback = t.aiDispatch.fallbackUsed === true || t.aiDispatch.source === "fallback";

    // Mapping du sous-doc dénormalisé → candidate complet
    const best = {
      vehiculeId:  t.aiDispatch.recommendedVehicleId,
      chauffeurId: t.aiDispatch.recommendedDriverId,
      vehicleName: t.aiDispatch.vehicleName,
      driverName:  t.aiDispatch.driverName,
      score:       t.aiDispatch.score,
      criteriaScores: t.aiDispatch.criteriaScores || undefined,
      explanation: t.aiDispatch.explanation || [],
      risks:       t.aiDispatch.risks || [],
      warnings:    t.aiDispatch.warnings || [],
    };

    let decisionStatus = "pending";
    if (t.aiDispatch.acceptedByDispatcher === true)  decisionStatus = "accepted";
    if (t.aiDispatch.acceptedByDispatcher === false) decisionStatus = "rejected";

    const rec = await DispatchRecommendation.create({
      transportId:        t._id,
      generatedAt:        t.aiDispatch.generatedAt || t.updatedAt || new Date(),
      source:             isFallback ? "fallback_node" : "ia",
      recommendations:    [best],
      bestRecommendation: best,
      summary: {
        totalCandidates:    null,
        eligibleCandidates: 1,
        excludedCandidates: 0,
      },
      decision: {
        status:          decisionStatus,
        decidedAt:       decisionStatus === "pending" ? null : (t.aiDispatch.acceptedAt || null),
        rejectionReason: decisionStatus === "rejected" ? (t.aiDispatch.rejectedReason || "") : undefined,
        finalVehiculeId:  decisionStatus === "accepted" ? (t.vehicule || null) : undefined,
        finalChauffeurId: decisionStatus === "accepted" ? (t.chauffeur || null) : undefined,
      },
    });

    await Transport.updateOne({ _id: t._id }, { $set: { "aiDispatch.lastRecommendationId": rec._id } });
    créés++;
    if (créés % 100 === 0) console.log(`  ${créés} recommandations migrées…`);
  }

  console.log(`Migration terminée — ${créés} créé(es), ${ignorés} déjà migré(es).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("migrate-aidispatch-to-collection échoué :", err.message);
  process.exit(1);
});
