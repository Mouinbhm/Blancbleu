/**
 * Test fonctionnel de l'index 2dsphere sur Vehicle.location.
 *
 * Insère 3 véhicules (Nice, Cannes, Marseille), exécute une requête $near
 * depuis Nice avec $maxDistance: 50000 (50 km), vérifie qu'on récupère
 * Nice + Cannes (à ~33 km) mais PAS Marseille (~160 km).
 *
 * Usage :
 *   MONGO_URI=... node server/scripts/test-2dsphere.js
 *
 * ⚠️ Ce script crée et supprime des véhicules dans la base — à n'utiliser
 *    qu'en dev/test sur une base dédiée.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const FIXTURES = [
  { immatriculation: "TEST-NICE-1", nom: "Nice-test",      type: "VSL", lat: 43.7102, lng: 7.262 },
  { immatriculation: "TEST-CAN-1",  nom: "Cannes-test",    type: "VSL", lat: 43.5528, lng: 7.0174 },
  { immatriculation: "TEST-MAR-1",  nom: "Marseille-test", type: "VSL", lat: 43.2965, lng: 5.3698 },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const Vehicle = require("../models/Vehicle");

  // Nettoyer les fixtures éventuelles
  await Vehicle.deleteMany({ immatriculation: { $in: FIXTURES.map((f) => f.immatriculation) } });

  for (const f of FIXTURES) {
    await Vehicle.create({
      immatriculation: f.immatriculation,
      nom: f.nom,
      type: f.type,
      position: { lat: f.lat, lng: f.lng },
    });
    console.log(`  inséré ${f.immatriculation}`);
  }

  // Requête $near depuis le centre de Nice, rayon 50 km
  const proches = await Vehicle.find({
    immatriculation: { $in: FIXTURES.map((f) => f.immatriculation) },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [7.262, 43.7102] },
        $maxDistance: 50000,
      },
    },
  }).select("immatriculation nom");

  console.log(`\nRésultats $near (50 km autour de Nice) :`);
  proches.forEach((v) => console.log(`  → ${v.immatriculation} (${v.nom})`));

  const noms = proches.map((v) => v.immatriculation);
  const expected = ["TEST-NICE-1", "TEST-CAN-1"];
  const ok = expected.every((e) => noms.includes(e)) && !noms.includes("TEST-MAR-1");

  console.log(`\n${ok ? "✓ OK" : "✗ KO"} : on attendait Nice + Cannes, sans Marseille.`);

  await Vehicle.deleteMany({ immatriculation: { $in: FIXTURES.map((f) => f.immatriculation) } });
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error("test-2dsphere échoué :", err.message);
  process.exit(1);
});
