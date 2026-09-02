/**
 * Répare les transports « à moitié assignés » : vehicule/chauffeur renseignés
 * alors que le statut n'a jamais atteint ASSIGNED.
 *
 * Cet état venait du conflit shift/assignation : le claim atomique refusait un
 * véhicule passé "En service" par un shift actif, et l'assignation échouait
 * après l'écriture des champs du transport — le revert best-effort ne
 * rattrapait pas tous les cas. Résultat : transport bloqué en SCHEDULED, mais
 * refusé par l'auto-dispatch ("Transport déjà assigné") et invisible côté
 * chauffeur.
 *
 * On remet les champs à null pour revenir à un SCHEDULED propre, ré-assignable
 * normalement. On ne touche NI au statut NI au journal : aucune transition n'a
 * eu lieu, il n'y a donc rien à réécrire.
 *
 * Usage :
 *   node server/scripts/fix-assignation-orpheline.js          # rapport seul
 *   node server/scripts/fix-assignation-orpheline.js --apply  # applique
 */

require("../config/env");
const mongoose = require("mongoose");

// Tout statut à partir duquel un véhicule est légitimement renseigné.
const APRES_ASSIGNATION = [
  "ASSIGNED",
  "DRIVER_ACCEPTED",
  "DRIVER_REJECTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION",
  "WAITING_AT_DESTINATION",
  "RETURN_TO_BASE",
  "COMPLETED",
  "BILLING_PENDING",
  "BILLED",
  "PAID",
  "CANCELLED",
  "NO_SHOW",
  "FAILED",
];

async function run() {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);

  const Transport = require("../models/Transport");
  const Vehicle = require("../models/Vehicle");

  const orphelins = await Transport.find({
    vehicule: { $ne: null },
    statut: { $nin: APRES_ASSIGNATION },
  })
    .select("numero statut vehicule chauffeur scoreDispatch")
    .lean();

  console.log(`${orphelins.length} transport(s) avec véhicule mais sans assignation :`);
  for (const t of orphelins) {
    console.log(`  - ${t.numero} (${t.statut}) véhicule=${t.vehicule} score=${t.scoreDispatch}`);
  }

  if (!orphelins.length) {
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log("\nMode rapport — relancer avec --apply pour corriger.");
    await mongoose.disconnect();
    return;
  }

  for (const t of orphelins) {
    await Transport.updateOne(
      { _id: t._id },
      { $set: { vehicule: null, chauffeur: null, shiftId: null, scoreDispatch: null } },
    );
    // Le véhicule ne doit pas rester marqué en mission sur ce transport.
    await Vehicle.updateOne(
      { _id: t.vehicule, transportEnCours: t._id },
      { $set: { transportEnCours: null } },
    );
    console.log(`  ✓ ${t.numero} remis à un ${t.statut} propre`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("fix-assignation-orpheline échoué :", err.message);
  process.exit(1);
});
