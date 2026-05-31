#!/usr/bin/env node
/**
 * Synchronise les indexes Mongoose avec MongoDB.
 *
 * Usage :
 *   npm --prefix server run db:sync-indexes
 *
 * Pour chaque modèle listé : appelle Model.syncIndexes() qui :
 *   - crée les indexes déclarés dans le schema mais absents de la collection
 *   - drop les indexes présents en collection mais retirés du schema
 *
 * IMPORTANT — exécution en prod :
 *   1. Faire un mongodump avant
 *   2. Vérifier d'abord avec Model.diffIndexes() (dry-run intégré ci-dessous)
 *   3. Les indexes uniques sont créés en arrière-plan ; un doublon existant
 *      fera échouer la création — nettoyer en amont.
 *
 * Script idempotent : peut être relancé sans risque.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("../utils/logger");

const MODELS = [
  { name: "Transport", path: "../models/Transport" },
  { name: "Vehicle", path: "../models/Vehicle" },
  { name: "Patient", path: "../models/Patient" },
  { name: "Personnel", path: "../models/Personnel" },
  { name: "Facture", path: "../models/Facture" },
];

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    logger.error("MONGO_URI absent — sortie");
    process.exit(1);
  }

  await mongoose.connect(uri);
  logger.info("Connecté à MongoDB", { mode: DRY_RUN ? "DRY-RUN" : "APPLY" });

  let totalDropped = 0;
  let totalAfter = 0;

  for (const { name, path } of MODELS) {
    const Model = require(path);

    if (DRY_RUN) {
      const diff = await Model.diffIndexes();
      logger.info(`${name} — diff`, {
        toCreate: diff.toCreate.length,
        toDrop: diff.toDrop.length,
      });
      if (diff.toCreate.length) logger.info(`  toCreate`, diff.toCreate);
      if (diff.toDrop.length) logger.info(`  toDrop`, diff.toDrop);
      continue;
    }

    // syncIndexes() crée la collection au besoin et retourne les indexes droppés.
    const dropped = await Model.syncIndexes();
    const after = await Model.collection.indexes();

    logger.info(`${name} — synchronisé`, {
      indexesApres: after.length,
      droppes: Array.isArray(dropped) ? dropped.length : 0,
      dropList: dropped,
    });

    totalDropped += Array.isArray(dropped) ? dropped.length : 0;
    totalAfter += after.length;
  }

  if (!DRY_RUN) {
    logger.info("Synchronisation terminée", {
      totalIndexes: totalAfter,
      totalDroppes: totalDropped,
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error("Erreur sync-indexes", { error: err.message, stack: err.stack });
  process.exit(1);
});
