/**
 * Backfill des champs Transport.adresseDepart.location et
 * Transport.adresseDestination.location (GeoJSON Point) à partir des
 * coordonnees.{lat,lng} existantes.
 *
 * Idempotent : ne touche pas les transports dont les deux locations sont déjà
 * renseignées.
 *
 * Usage :
 *   MONGO_URI=... node server/scripts/migrate-transport-location.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

function buildPoint(adresse) {
  const lat = adresse?.coordonnees?.lat;
  const lng = adresse?.coordonnees?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { type: "Point", coordinates: [lng, lat] };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const Transport = require("../models/Transport");

  const total = await Transport.countDocuments();
  let migrés = 0;

  // Cible : au moins une adresse avec coords mais sans location.coordinates
  const cursor = Transport.find({
    $or: [
      {
        "adresseDepart.coordonnees.lat":  { $exists: true, $ne: null },
        "adresseDepart.coordonnees.lng":  { $exists: true, $ne: null },
        "adresseDepart.location.coordinates": { $exists: false },
      },
      {
        "adresseDestination.coordonnees.lat":  { $exists: true, $ne: null },
        "adresseDestination.coordonnees.lng":  { $exists: true, $ne: null },
        "adresseDestination.location.coordinates": { $exists: false },
      },
    ],
  }).cursor();

  for await (const t of cursor) {
    const set = {};
    const depart = buildPoint(t.adresseDepart);
    if (depart && !t.adresseDepart?.location?.coordinates?.length) {
      set["adresseDepart.location"] = depart;
    }
    const dest = buildPoint(t.adresseDestination);
    if (dest && !t.adresseDestination?.location?.coordinates?.length) {
      set["adresseDestination.location"] = dest;
    }
    if (Object.keys(set).length === 0) continue;

    await Transport.updateOne({ _id: t._id }, { $set: set });
    migrés++;
    if (migrés % 100 === 0) console.log(`  ${migrés} transports migrés…`);
  }

  console.log(`Migration terminée — ${migrés} transport(s) sur ${total} total.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("migrate-transport-location échoué :", err.message);
  process.exit(1);
});
