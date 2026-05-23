/**
 * Backfill du dataset d'entraînement TransportFeature à partir des transports
 * COMPLETED/BILLED/PAID existants. Idempotent (upsert sur transportId).
 *
 * Usage :
 *   MONGO_URI=... node server/scripts/backfill-features.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const Transport = require("../models/Transport");
  const collector = require("../services/featureCollectorService");

  const FINAL_STATUS = ["COMPLETED", "BILLING_PENDING", "BILLED", "PAID"];
  const total = await Transport.countDocuments({ statut: { $in: FINAL_STATUS } });
  console.log(`Cible : ${total} transport(s) en statut final`);

  const cursor = Transport.find({ statut: { $in: FINAL_STATUS } }).cursor();

  let captured = 0;
  let skipped  = 0;
  let errors   = 0;
  const skipReasons = {};

  for await (const t of cursor) {
    const res = await collector.captureTransportFeatures(t);
    if (!res) { errors++; continue; }
    if (res.skipped) {
      skipped++;
      skipReasons[res.skipped] = (skipReasons[res.skipped] || 0) + 1;
    } else {
      captured++;
    }
    if ((captured + skipped + errors) % 100 === 0) {
      console.log(`  progression : captured=${captured} skipped=${skipped} errors=${errors}`);
    }
  }

  console.log(`\nBackfill terminé.`);
  console.log(`  captured : ${captured}`);
  console.log(`  skipped  : ${skipped} ${JSON.stringify(skipReasons)}`);
  console.log(`  errors   : ${errors}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("backfill-features échoué :", err.message);
  process.exit(1);
});
