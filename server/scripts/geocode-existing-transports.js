/**
 * Migration : géocode les transports dont adresseDepart ou adresseDestination
 * n'ont pas de coordonnées GPS.
 *
 * Usage : node server/scripts/geocode-existing-transports.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Transport = require("../models/Transport");
const { geocodeTransport } = require("../utils/geocodeUtils");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connecté");

  const transports = await Transport.find({
    $or: [
      { "adresseDepart.coordonnees.lat": { $exists: false } },
      { "adresseDepart.coordonnees.lat": null },
      { "adresseDestination.coordonnees.lat": { $exists: false } },
      { "adresseDestination.coordonnees.lat": null },
    ],
  }).lean();

  console.log(`📦 ${transports.length} transport(s) sans coordonnées GPS`);
  let updated = 0;

  for (const t of transports) {
    const manqueDepart = !t.adresseDepart?.coordonnees?.lat;
    const manqueDest   = !t.adresseDestination?.coordonnees?.lat;

    try {
      const [geoD, geoDest] = await geocodeTransport(
        manqueDepart ? t.adresseDepart : null,
        manqueDest   ? t.adresseDestination : null,
      );

      const update = {};
      if (manqueDepart && geoD) {
        update["adresseDepart.coordonnees"] = { lat: geoD.lat, lng: geoD.lng };
        console.log(`  ✓ ${t.numero} départ  → ${geoD.lat}, ${geoD.lng} (score ${geoD.score?.toFixed(2)})`);
      }
      if (manqueDest && geoDest) {
        update["adresseDestination.coordonnees"] = { lat: geoDest.lat, lng: geoDest.lng };
        console.log(`  ✓ ${t.numero} dest    → ${geoDest.lat}, ${geoDest.lng} (score ${geoDest.score?.toFixed(2)})`);
      }

      if (Object.keys(update).length) {
        await Transport.updateOne({ _id: t._id }, { $set: update });
        updated++;
      } else {
        console.log(`  ⚠ ${t.numero} — BAN n'a rien retourné`);
      }

      await new Promise((r) => setTimeout(r, 200)); // respecter le rate-limit BAN
    } catch (err) {
      console.error(`  ✗ ${t.numero} — ${err.message}`);
    }
  }

  console.log(`\n✅ Migration terminée — ${updated}/${transports.length} transport(s) mis à jour`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("❌ Erreur migration :", err.message);
  process.exit(1);
});
