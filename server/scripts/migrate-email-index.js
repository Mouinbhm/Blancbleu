/**
 * BlancBleu — Migration : remplacement de l'index unique email par un index composé (email + role)
 *
 * Problème corrigé :
 *   L'ancien index { email: 1 } unique global empêchait un patient de s'inscrire
 *   avec un email déjà utilisé par un compte dispatcher/admin.
 *
 * Solution :
 *   Index composé { email: 1, role: 1 } unique — le même email peut exister une
 *   fois par type de compte (patient, dispatcher, admin...).
 *
 * Usage :
 *   node server/scripts/migrate-email-index.js
 *
 * Variables requises dans server/.env :
 *   MONGO_URI=mongodb://...
 */

require("../config/env");
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI manquant dans .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅  Connecté à MongoDB :", uri.replace(/\/\/.*@/, "//***@"));

  const db = mongoose.connection.db;
  const col = db.collection("users");

  // ── 1. Lister les index existants ──────────────────────────────────────────
  const indexes = await col.indexes();
  console.log("\nIndex actuels :");
  indexes.forEach((idx) => console.log(" •", idx.name, JSON.stringify(idx.key)));

  // ── 2. Supprimer l'ancien index unique sur email seul ──────────────────────
  const oldIndex = indexes.find(
    (idx) => idx.key.email === 1 && Object.keys(idx.key).length === 1 && idx.unique === true,
  );

  if (oldIndex) {
    console.log(`\n⚠️  Suppression de l'index "${oldIndex.name}"...`);
    await col.dropIndex(oldIndex.name);
    console.log("✅  Index supprimé.");
  } else {
    console.log("\nℹ️  Aucun index unique simple sur email trouvé — peut-être déjà migré.");
  }

  // ── 3. Créer le nouvel index composé (email + role) ────────────────────────
  const existingCompound = indexes.find((idx) => idx.key.email === 1 && idx.key.role === 1);

  if (existingCompound) {
    console.log("ℹ️  Index composé email+role déjà présent — rien à créer.");
  } else {
    console.log("\n⚙️  Création de l'index composé { email: 1, role: 1 }...");
    await col.createIndex({ email: 1, role: 1 }, { unique: true, name: "email_role_unique" });
    console.log("✅  Index email_role_unique créé.");
  }

  // ── 4. Vérification finale ─────────────────────────────────────────────────
  const finalIndexes = await col.indexes();
  console.log("\nIndex après migration :");
  finalIndexes.forEach((idx) => console.log(" •", idx.name, JSON.stringify(idx.key)));

  await mongoose.disconnect();
  console.log("\n✅  Migration terminée.");
}

run().catch((err) => {
  console.error("❌  Erreur de migration :", err.message);
  process.exit(1);
});
