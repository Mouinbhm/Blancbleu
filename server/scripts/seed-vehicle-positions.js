#!/usr/bin/env node
/**
 * Seed des positions GPS pour les véhicules existants qui n'en ont pas.
 *
 * Usage :
 *   node server/scripts/seed-vehicle-positions.js          # dry-run (affiche ce qui serait fait)
 *   node server/scripts/seed-vehicle-positions.js --apply  # applique les changements
 *
 * Cible : tous les Vehicle avec statut "Disponible" qui n'ont PAS de position.lat/lng
 * (et donc pas de `location` GeoJSON, ce qui casse le $near de /api/ai/dispatch).
 *
 * Positions : 8 points dispatchés autour de Nice (Madeleine, Pasteur, Magnan,
 * Cimiez, Saint-Roch, Riquier, Vieux-Nice, Aéroport). Si plus de 8 véhicules,
 * on tourne en round-robin.
 *
 * IMPORTANT : utilise vehicle.save() (pas findOneAndUpdate) pour que le hook
 * pre('save') synchronise position -> location GeoJSON.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");

// 8 points stratégiques à Nice (lat, lng, label)
const NICE_POSITIONS = [
  { lat: 43.7034, lng: 7.2663, adresse: "Madeleine, Nice" },
  { lat: 43.6961, lng: 7.2761, adresse: "CHU Pasteur, Nice" },
  { lat: 43.7185, lng: 7.2496, adresse: "Magnan, Nice" },
  { lat: 43.7253, lng: 7.2730, adresse: "Cimiez, Nice" },
  { lat: 43.7038, lng: 7.2868, adresse: "Saint-Roch, Nice" },
  { lat: 43.7000, lng: 7.2935, adresse: "Riquier, Nice" },
  { lat: 43.6960, lng: 7.2752, adresse: "Vieux-Nice" },
  { lat: 43.6584, lng: 7.2156, adresse: "Aéroport Nice" },
];

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI manquant dans .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connecté : ${mongoose.connection.host}/${mongoose.connection.name}`);

  // Tous les Disponibles sans position.lat — on cible aussi ceux sans location
  // (cas où position existe mais location pas synchro car save() jamais appelé)
  const cibles = await Vehicle.find({
    statut: "Disponible",
    $or: [
      { "position.lat": { $in: [null, undefined] } },
      { location: { $exists: false } },
      { "location.coordinates": { $in: [null, undefined] } },
    ],
  });

  console.log(`\n${cibles.length} véhicule(s) Disponible(s) sans position GPS valide :`);
  cibles.forEach((v, i) => {
    const pos = NICE_POSITIONS[i % NICE_POSITIONS.length];
    console.log(`  - ${v.nom || v.immatriculation} → (${pos.lat}, ${pos.lng}) ${pos.adresse}`);
  });

  if (cibles.length === 0) {
    console.log("\nRien à faire.");
    process.exit(0);
  }

  if (!apply) {
    console.log("\n[DRY-RUN] Relancer avec --apply pour appliquer.");
    process.exit(0);
  }

  let ok = 0;
  for (let i = 0; i < cibles.length; i += 1) {
    const v = cibles[i];
    const pos = NICE_POSITIONS[i % NICE_POSITIONS.length];
    v.position = { lat: pos.lat, lng: pos.lng, adresse: pos.adresse, updatedAt: new Date() };
    // save() déclenche le hook pre('save') qui peuple `location` GeoJSON
    await v.save();
    ok += 1;
  }
  console.log(`\n${ok}/${cibles.length} véhicule(s) mis à jour.`);

  // Vérification : compter ceux qui ont maintenant un `location` GeoJSON
  const avecLoc = await Vehicle.countDocuments({
    statut: "Disponible",
    "location.coordinates": { $exists: true, $ne: null },
  });
  console.log(`${avecLoc} véhicule(s) Disponible(s) avec location GeoJSON valide.`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});
