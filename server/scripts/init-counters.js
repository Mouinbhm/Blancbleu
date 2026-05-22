/**
 * Initialisation des compteurs Counter pour les modèles à numérotation atomique.
 *
 * Pour chaque modèle (Patient, Prescription, Facture), trouve le max(seq) extrait
 * du champ numéro existant et seed Counter.seq à cette valeur — pour ne pas régresser.
 *
 * Idempotent : ré-exécutable sans casse (compare et set au max(courant, calculé)).
 *
 * Usage :
 *   MONGO_URI=... node server/scripts/init-counters.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Extrait le suffixe XXXX d'un numéro comme "PAT-20260520-0042" → 42
function extractSuffix(numero) {
  if (!numero) return 0;
  const parts = String(numero).split("-");
  const n = parseInt(parts[parts.length - 1], 10);
  return isNaN(n) ? 0 : n;
}

async function maxSuffix(Model, field) {
  // Itérer en streaming pour ne pas charger 1M docs en RAM
  let max = 0;
  const cursor = Model.find({ [field]: { $exists: true, $ne: null } }).select(field).cursor();
  for await (const doc of cursor) {
    const n = extractSuffix(doc[field]);
    if (n > max) max = n;
  }
  return max;
}

async function seedCounter(Counter, id, value) {
  const existing = await Counter.findById(id).lean();
  const currentSeq = existing?.seq || 0;
  const target = Math.max(currentSeq, value);
  if (target === currentSeq && existing) {
    console.log(`  [${id}] seq déjà à ${currentSeq} ≥ ${value} → inchangé`);
    return;
  }
  await Counter.findOneAndUpdate(
    { _id: id },
    { $set: { seq: target } },
    { upsert: true },
  );
  console.log(`  [${id}] seq ${currentSeq} → ${target}`);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const Counter      = require("../models/Counter");
  const Patient      = require("../models/Patient");
  const Prescription = require("../models/Prescription");
  const Facture      = require("../models/Facture");

  console.log("Calcul des max(seq) actuels…");
  const [patMax, presMax, facMax] = await Promise.all([
    maxSuffix(Patient,      "numeroPatient"),
    maxSuffix(Prescription, "numero"),
    maxSuffix(Facture,      "numero"),
  ]);

  console.log(`Patient.max = ${patMax} / Prescription.max = ${presMax} / Facture.max = ${facMax}`);

  await seedCounter(Counter, "patient",      patMax);
  await seedCounter(Counter, "prescription", presMax);
  await seedCounter(Counter, "facture",      facMax);

  console.log("Compteurs initialisés.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("init-counters échoué :", err.message);
  process.exit(1);
});
