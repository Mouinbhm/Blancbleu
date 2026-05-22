/**
 * Backfill numeroSecuHash pour les patients existants.
 *
 * Le hook pre('save') calcule le hash automatiquement sur les nouveaux patients.
 * Ce script déchiffre l'ancien numeroSecu (via le hook post('init') du modèle)
 * et calcule + persiste numeroSecuHash pour les patients qui n'en ont pas encore.
 *
 * Usage :
 *   ENCRYPTION_KEY=... MONGO_URI=... node server/scripts/backfill-numerosecu-hash.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  // Charger le modèle APRÈS la connexion (le hook post('init') déchiffre automatiquement)
  const Patient = require("../models/Patient");
  const { hashDeterministic } = require("../utils/hashing");

  // Itérer sur les patients sans hash (par batches de 100)
  const cursor = Patient.find({ numeroSecuHash: { $exists: false }, numeroSecu: { $ne: "" } })
    .select("+numeroSecuHash")
    .cursor();

  let traités = 0;
  let ignorés = 0;

  for await (const patient of cursor) {
    // Le hook post('init') a déjà déchiffré patient.numeroSecu en clair
    const plainText = patient.numeroSecu;
    if (!plainText) { ignorés++; continue; }

    const hash = hashDeterministic(plainText);
    await Patient.updateOne({ _id: patient._id }, { $set: { numeroSecuHash: hash } });
    traités++;

    if (traités % 100 === 0) {
      console.log(`  ${traités} patients traités...`);
    }
  }

  console.log(`Backfill terminé — ${traités} patient(s) mis à jour, ${ignorés} ignoré(s) (numeroSecu vide).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Backfill échoué :", err.message);
  process.exit(1);
});
