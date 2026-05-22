/**
 * Backfill du champ Vehicle.location (GeoJSON Point) à partir de position {lat, lng}.
 *
 * Idempotent : ne touche pas les véhicules ayant déjà un champ location valide.
 *
 * Usage :
 *   MONGO_URI=... node server/scripts/migrate-vehicle-location.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const Vehicle = require("../models/Vehicle");

  const total = await Vehicle.countDocuments();
  // Cible : véhicules avec position.lat/lng et sans location.coordinates
  const cursor = Vehicle.find({
    "position.lat": { $exists: true, $ne: null },
    "position.lng": { $exists: true, $ne: null },
    $or: [
      { location: { $exists: false } },
      { "location.coordinates": { $exists: false } },
      { "location.coordinates": { $size: 0 } },
    ],
  }).cursor();

  let migrés = 0;
  for await (const veh of cursor) {
    const lat = veh.position.lat;
    const lng = veh.position.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    await Vehicle.updateOne(
      { _id: veh._id },
      {
        $set: {
          location: { type: "Point", coordinates: [lng, lat] },
        },
      },
    );
    migrés++;
    if (migrés % 100 === 0) console.log(`  ${migrés} véhicules migrés…`);
  }

  console.log(`Migration terminée — ${migrés} véhicule(s) sur ${total} total.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("migrate-vehicle-location échoué :", err.message);
  process.exit(1);
});
