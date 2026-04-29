/**
 * BlancBleu — Correction des statuts terrain incohérents
 *
 * Remet à ASSIGNED les transports dont la date est dans le futur
 * mais qui se retrouvent en statut terrain (EN_ROUTE, ARRIVED…)
 * à cause de simulations ou de seeds de démo.
 *
 * Idempotent : sans effet si relancé sur des transports déjà corrigés.
 *
 * Usage :
 *   node server/scripts/fix-transport-status.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Transport = require("../models/Transport");

const STATUTS_TERRAIN = [
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION",
  "WAITING_AT_DESTINATION",
  "RETURN_TO_BASE",
];

// Champs timestamps terrain à effacer (doivent être null pour ASSIGNED)
const TIMESTAMPS_TERRAIN = [
  "heureEnRoute",
  "heurePriseEnCharge",
  "heureArriveeDestination",
  "heureDebutAttente",
  "heureDepartRetour",
  "heureTerminee",
];

async function main() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/blancbleu";

  await mongoose.connect(uri);
  console.log(`✔ Connecté à MongoDB : ${uri.replace(/\/\/.*@/, "//***@")}`);

  // Début de demain : on ne touche PAS aux transports du jour en cours
  const debutDemain = new Date();
  debutDemain.setDate(debutDemain.getDate() + 1);
  debutDemain.setHours(0, 0, 0, 0);

  console.log(`\n📅 Recherche des transports en statut terrain avec dateTransport ≥ ${debutDemain.toLocaleDateString("fr-FR")}…`);

  const transports = await Transport.find({
    statut: { $in: STATUTS_TERRAIN },
    dateTransport: { $gte: debutDemain },
  }).select("numero statut vehicule dateTransport heureRDV journal");

  if (transports.length === 0) {
    console.log("✅ Aucun transport à corriger.\n");
    await mongoose.disconnect();
    return;
  }

  console.log(`⚠️  ${transports.length} transport(s) à corriger :\n`);

  const corriges = [];
  const erreurs = [];

  for (const t of transports) {
    const statutCible = t.vehicule ? "ASSIGNED" : "SCHEDULED";
    const ancienStatut = t.statut;
    const dateStr = t.dateTransport
      ? t.dateTransport.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : "date inconnue";

    try {
      // Entrée journal — champs selon le schéma journalSchema du modèle
      t.journal.push({
        de: ancienStatut,
        vers: statutCible,
        timestamp: new Date(),
        utilisateur: "script-correction",
        notes: `Correction automatique — statut incohérent (date future : ${dateStr})`,
      });

      // Reset du statut
      t.statut = statutCible;

      // Effacement des timestamps terrain
      for (const champ of TIMESTAMPS_TERRAIN) {
        t[champ] = null;
      }

      // Bypass du middleware pour éviter les guards de transition (save direct)
      await Transport.findByIdAndUpdate(
        t._id,
        {
          statut: statutCible,
          $push: {
            journal: t.journal[t.journal.length - 1],
          },
          $set: Object.fromEntries(TIMESTAMPS_TERRAIN.map((c) => [c, null])),
        },
        { runValidators: false },
      );

      corriges.push({ numero: t.numero, de: ancienStatut, vers: statutCible, date: dateStr });
      console.log(`  ✅ ${t.numero.padEnd(20)} ${ancienStatut.padEnd(26)} → ${statutCible.padEnd(12)} [${dateStr}]`);
    } catch (err) {
      erreurs.push({ numero: t.numero, err: err.message });
      console.error(`  ❌ ${t.numero} — ERREUR : ${err.message}`);
    }
  }

  console.log("\n──────────────────────────────────────────");
  console.log(`Transports corrigés : ${corriges.length}`);
  if (erreurs.length > 0) {
    console.log(`Erreurs           : ${erreurs.length}`);
  }
  console.log("──────────────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("✔ Déconnecté de MongoDB\n");
}

main().catch((err) => {
  console.error("\n❌ ERREUR FATALE :", err.message);
  process.exit(1);
});
