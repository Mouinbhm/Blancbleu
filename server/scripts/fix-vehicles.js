/**
 * BlancBleu — Script de réparation des véhicules bloqués
 *
 * Corrige les véhicules restés en statut "en_mission" après la fin de leur
 * transport (COMPLETED / CANCELLED / NO_SHOW / BILLED).
 *
 * Idempotent : peut être relancé plusieurs fois sans effet de bord.
 *
 * Usage :
 *   node server/scripts/fix-vehicles.js
 *   MONGO_URI=mongodb://... node server/scripts/fix-vehicles.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const Transport = require("../models/Transport");

// Statuts de transport qui signifient que la mission est encore active
const STATUTS_ACTIFS = new Set([
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION",
  "WAITING_AT_DESTINATION",
  "RETURN_TO_BASE",
]);

// Statuts de transport qui signifient que la mission est terminée
const STATUTS_TERMINES = new Set([
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "BILLED",
]);

async function libererVehicule(vehiculeId) {
  await Vehicle.findByIdAndUpdate(vehiculeId, {
    statut: "disponible",
    transportEnCours: null,
  });
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ Variable MONGO_URI non définie dans .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✔  Connecté à MongoDB\n");

  const vehiculesEnMission = await Vehicle.find({
    statut: "en_mission",
    deletedAt: null,
  });

  console.log(
    `🔍 ${vehiculesEnMission.length} véhicule(s) en statut "en_mission" trouvé(s)\n`,
  );

  let liberes = 0;
  let actifs = 0;
  let inchanges = 0;

  for (const vehicule of vehiculesEnMission) {
    const label = `[${vehicule.nom} — ${vehicule.immatriculation}]`;

    // ── Cas 1 : aucun transport lié ──────────────────────────────────────────
    if (!vehicule.transportEnCours) {
      await libererVehicule(vehicule._id);
      console.log(`✅ ${label} libéré — aucun transport associé`);
      liberes++;
      continue;
    }

    // ── Récupérer le transport lié ────────────────────────────────────────────
    const transport = await Transport.findById(vehicule.transportEnCours).select(
      "numero statut dateTransport",
    );

    // ── Cas 2 : transport introuvable en base ─────────────────────────────────
    if (!transport) {
      await libererVehicule(vehicule._id);
      console.log(
        `✅ ${label} libéré — transport introuvable (id: ${vehicule.transportEnCours})`,
      );
      liberes++;
      continue;
    }

    // ── Cas 3 : transport terminé → libérer le véhicule ──────────────────────
    if (STATUTS_TERMINES.has(transport.statut)) {
      await libererVehicule(vehicule._id);
      console.log(
        `✅ ${label} libéré — transport ${transport.numero} est ${transport.statut}`,
      );
      liberes++;
      continue;
    }

    // ── Cas 4 : transport actif → ne pas toucher ──────────────────────────────
    if (STATUTS_ACTIFS.has(transport.statut)) {
      console.log(
        `⏳ ${label} en mission active — transport ${transport.numero} (${transport.statut}) — non modifié`,
      );
      actifs++;
      continue;
    }

    // ── Cas 5 : statut inconnu (REQUESTED, CONFIRMED, SCHEDULED…) ────────────
    console.log(
      `🔒 ${label} — statut transport non opérationnel (${transport.statut}) — non modifié`,
    );
    inchanges++;
  }

  console.log(
    `\n✅ ${liberes} véhicule(s) libéré(s) | ⏳ ${actifs} en mission active | 🔒 ${inchanges} inchangés`,
  );
}

main()
  .catch((err) => {
    console.error("❌ Erreur fatale :", err.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
