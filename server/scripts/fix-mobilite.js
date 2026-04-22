/**
 * BlancBleu — Réparation de la cohérence mobilité ↔ typeTransport
 *
 * Règles métier :
 *   VSL       → patient.mobilite doit être ASSIS
 *   TPMR      → patient.mobilite doit être FAUTEUIL_ROULANT
 *   AMBULANCE → patient.mobilite doit être ALLONGE ou CIVIERE
 *
 * Usage :
 *   node server/scripts/fix-mobilite.js
 *   node server/scripts/fix-mobilite.js --dry-run   (rapport seul, aucune écriture)
 *
 * Idempotent : relancer le script ne modifie pas les transports déjà corrects.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const readline = require("readline");
const Transport = require("../models/Transport");

const DRY_RUN = process.argv.includes("--dry-run");

// Mobilité correcte attendue pour chaque type de véhicule
const MOBILITE_CORRECTE = {
  VSL:       "ASSIS",
  TPMR:      "FAUTEUIL_ROULANT",
  AMBULANCE: "ALLONGE", // valeur par défaut pour AMBULANCE
};

// Mobilités acceptables (sans correction nécessaire) par type de véhicule
const MOBILITES_OK = {
  VSL:       ["ASSIS"],
  TPMR:      ["FAUTEUIL_ROULANT"],
  AMBULANCE: ["ALLONGE", "CIVIERE"],
};

function demanderConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (reponse) => {
      rl.close();
      resolve(reponse.trim().toLowerCase());
    });
  });
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  Variable MONGO_URI absente du fichier .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connecté à MongoDB\n");

  if (DRY_RUN) {
    console.log("ℹ️  Mode DRY-RUN : aucune modification ne sera appliquée.\n");
  }

  // ── Trouver les transports incohérents ────────────────────────────────────
  const transports = await Transport.find({
    typeTransport: { $in: ["VSL", "TPMR", "AMBULANCE"] },
    "patient.mobilite": { $exists: true },
    deletedAt: null,
  })
    .select("numero typeTransport patient.mobilite patient.nom patient.prenom statut")
    .lean();

  const aReparer = transports.filter((t) => {
    const mobilites = MOBILITES_OK[t.typeTransport];
    return mobilites && !mobilites.includes(t.patient?.mobilite);
  });

  // ── Rapport ───────────────────────────────────────────────────────────────
  console.log(`📋 Transports analysés : ${transports.length}`);
  console.log(`🔧 Transports à corriger : ${aReparer.length}\n`);

  if (aReparer.length === 0) {
    console.log("✅ Aucune incohérence détectée. Base de données cohérente.");
    return;
  }

  console.log("┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│  Num transport       Patient                  Type     Mobilité      │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");

  for (const t of aReparer) {
    const num    = (t.numero || "N/A").padEnd(20);
    const nom    = `${t.patient?.nom || ""} ${t.patient?.prenom || ""}`.trim().padEnd(24);
    const type   = (t.typeTransport || "").padEnd(9);
    const mob    = (t.patient?.mobilite || "").padEnd(14);
    const correct = MOBILITE_CORRECTE[t.typeTransport] || "?";
    console.log(`│  ${num} ${nom} ${type} ${mob} → ${correct}  │`);
  }

  console.log("└─────────────────────────────────────────────────────────────────────┘\n");

  if (DRY_RUN) {
    console.log("ℹ️  Mode DRY-RUN : terminé sans modification.");
    return;
  }

  // ── Demande de confirmation ───────────────────────────────────────────────
  const reponse = await demanderConfirmation(
    `⚠️  Appliquer les corrections sur ${aReparer.length} transport(s) ? [oui/non] : `
  );

  if (reponse !== "oui" && reponse !== "o") {
    console.log("\n❌ Opération annulée par l'utilisateur.");
    return;
  }

  // ── Application des corrections ───────────────────────────────────────────
  let corriges = 0;
  let erreurs  = 0;

  for (const t of aReparer) {
    const mobiliteCorrecte = MOBILITE_CORRECTE[t.typeTransport];
    try {
      await Transport.findByIdAndUpdate(
        t._id,
        { $set: { "patient.mobilite": mobiliteCorrecte } }
      );
      console.log(`✅ ${t.numero} — ${t.typeTransport} : ${t.patient?.mobilite} → ${mobiliteCorrecte}`);
      corriges++;
    } catch (err) {
      console.error(`❌ ${t.numero} — Erreur : ${err.message}`);
      erreurs++;
    }
  }

  console.log("\n================================");
  console.log(`✅ ${corriges} transport(s) corrigé(s)`);
  if (erreurs > 0) {
    console.log(`❌ ${erreurs} erreur(s)`);
  }
  console.log("================================");
}

main()
  .catch((err) => {
    console.error("❌  Erreur fatale :", err.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
