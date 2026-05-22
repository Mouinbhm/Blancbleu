/**
 * BlancBleu — Entrypoint des workers BullMQ.
 * À lancer dans un process séparé (pas dans le serveur Express).
 *
 * Usage Docker  : `node workers/start.js` (cf. service `worker` dans docker-compose.yml)
 * Usage local   : `node server/workers/start.js`
 *
 * Connecte Mongoose (les workers ont besoin de l'ORM pour mettre à jour les
 * documents : Prescription.ocr, Facture.pdf, etc.) puis instancie tous les
 * workers définis dans workers/index.js. Programme les jobs récurrents
 * cleanup à intervalles fixes.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const logger   = require("../utils/logger");
const { queues, QUEUES } = require("../queues");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info("[workers] MongoDB connecté");

  require("./index");
  logger.info("[workers] Workers BullMQ démarrés");

  // Jobs récurrents (cleanup)
  // BullMQ utilise jobId stable + repeat pour dédoublonner
  await queues[QUEUES.CLEANUP].add(
    "vehicles",
    {},
    { repeat: { every: 60 * 60 * 1000 }, jobId: "cleanup:vehicles:hourly" },
  );
  await queues[QUEUES.CLEANUP].add(
    "notifs",
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "cleanup:notifs:daily" },
  );
  logger.info("[workers] Jobs récurrents programmés (vehicles 1h, notifs 24h)");
}

main().catch((err) => {
  logger.error("[workers] Démarrage échoué", { err: err.message });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  logger.info("[workers] SIGTERM — arrêt propre");
  await mongoose.disconnect();
  process.exit(0);
});
