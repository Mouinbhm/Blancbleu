/**
 * BlancBleu — Réparation des véhicules bloqués en statut "en_mission"
 *
 * Usage :
 *   node server/scripts/fix-vehicles.js
 *
 * Idempotent : sans effet de bord si relancé plusieurs fois.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");
const Transport = require("../models/Transport");

// Statuts où le transport est réellement en cours → ne pas toucher le véhicule
const STATUTS_ACTIFS = new Set([
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION",
]);

// Statuts où le transport est terminé → libérer le véhicule
const STATUTS_TERMINES = new Set([
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

async function liberer(vehiculeId) {
  await Vehicle.findByIdAndUpdate(vehiculeId, {
    statut: "disponible",
    transportEnCours: null,
  });
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  Variable MONGO_URI absente du fichier .env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const vehicules = await Vehicle.find({ statut: "en_mission", deletedAt: null });

  if (vehicules.length === 0) {
    console.log("ℹ️  Aucun véhicule en statut \"en_mission\" trouvé.");
    return;
  }

  let liberes = 0;
  let actifs = 0;

  for (const v of vehicules) {
    const label = `${v.nom} (${v.immatriculation})`;

    // ── CAS A : aucun transport lié ───────────────────────────────────────────
    if (!v.transportEnCours) {
      await liberer(v._id);
      console.log(`✅ ${label} → libéré (aucun transport lié)`);
      liberes++;
      continue;
    }

    // ── Récupérer le transport lié ────────────────────────────────────────────
    const transport = await Transport.findById(v.transportEnCours).select("statut numero").lean();

    // ── Transport introuvable en base ─────────────────────────────────────────
    if (!transport) {
      await liberer(v._id);
      console.log(`✅ ${label} → libéré (transport introuvable en base)`);
      liberes++;
      continue;
    }

    // ── CAS B : transport terminé → libérer ───────────────────────────────────
    if (STATUTS_TERMINES.has(transport.statut)) {
      await liberer(v._id);
      console.log(`✅ ${label} → libéré (transport ${transport.statut})`);
      liberes++;
      continue;
    }

    // ── CAS B : transport actif → ignorer ─────────────────────────────────────
    if (STATUTS_ACTIFS.has(transport.statut)) {
      console.log(`⏳ ${label} → ignoré (transport ${transport.statut} actif)`);
      actifs++;
      continue;
    }

    // ── Statut non opérationnel (REQUESTED, CONFIRMED, SCHEDULED…) ───────────
    // Le véhicule est "en_mission" alors que le transport n'est pas encore actif.
    // On libère par sécurité.
    await liberer(v._id);
    console.log(`✅ ${label} → libéré (statut transport non opérationnel : ${transport.statut})`);
    liberes++;
  }

  console.log("\n================================");
  console.log(`✅ ${liberes} véhicule(s) libéré(s)`);
  console.log(`⏳ ${actifs} en mission active (non touché)`);
  console.log("================================");
}

main()
  .catch((err) => {
    console.error("❌  Erreur fatale :", err.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
