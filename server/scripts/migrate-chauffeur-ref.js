/**
 * BlancBleu — Migration : Transport.chauffeur User → Personnel
 *
 * Avant ce correctif, Transport.chauffeur référençait le modèle User (compte de connexion).
 * Il doit référencer Personnel (employé métier).
 *
 * Ce script :
 *  1. Parcourt tous les transports ayant un chauffeur non-null
 *  2. Vérifie si l'ObjectId pointe vers un Personnel existant
 *  3. Si non, cherche un Personnel avec userId correspondant (liaison compte ↔ employé)
 *  4. Si trouvé, met à jour Transport.chauffeur vers Personnel._id
 *  5. Si aucun Personnel trouvé, met Transport.chauffeur à null et loggue le problème
 *
 * Usage :
 *   node server/scripts/migrate-chauffeur-ref.js
 *   NODE_ENV=production node server/scripts/migrate-chauffeur-ref.js --dry-run
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Transport = require("../models/Transport");
const Personnel = require("../models/Personnel");
const User = require("../models/User");

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/blancbleu");
  console.log(`\n🔗 Connecté à MongoDB — mode : ${DRY_RUN ? "DRY RUN (aucune écriture)" : "ÉCRITURE RÉELLE"}\n`);

  const transports = await Transport.find({
    chauffeur: { $ne: null },
    deletedAt: null,
  }).select("numero chauffeur statut");

  console.log(`📋 ${transports.length} transport(s) avec chauffeur non-null\n`);

  let ok = 0;
  let deja_personnel = 0;
  let migrated = 0;
  let cleared = 0;

  for (const t of transports) {
    const chauffeurId = t.chauffeur;

    // 1. Vérifier si l'ID pointe déjà vers un Personnel
    const personnelExistant = await Personnel.findById(chauffeurId).select("_id nom prenom role");
    if (personnelExistant) {
      console.log(`  ✅ [${t.numero}] déjà Personnel : ${personnelExistant.nom} ${personnelExistant.prenom} (${personnelExistant.role})`);
      deja_personnel++;
      ok++;
      continue;
    }

    // 2. Vérifier si c'est un User (ancien modèle)
    const user = await User.findById(chauffeurId).select("_id nom prenom email");
    if (user) {
      // Chercher le Personnel lié via userId
      const personnelLie = await Personnel.findOne({ userId: chauffeurId }).select("_id nom prenom role");
      if (personnelLie) {
        console.log(`  🔄 [${t.numero}] User "${user.email}" → Personnel "${personnelLie.nom} ${personnelLie.prenom}" (${personnelLie.role})`);
        if (!DRY_RUN) {
          await Transport.findByIdAndUpdate(t._id, { chauffeur: personnelLie._id });
        }
        migrated++;
        ok++;
      } else {
        // Tenter de trouver un Personnel avec le même nom/prénom
        const personnelParNom = await Personnel.findOne({
          nom: user.nom,
          prenom: user.prenom,
          role: { $in: ["Chauffeur", "Ambulancier"] },
        }).select("_id nom prenom role");

        if (personnelParNom) {
          console.log(`  🔄 [${t.numero}] User "${user.email}" → Personnel (nom match) "${personnelParNom.nom} ${personnelParNom.prenom}"`);
          if (!DRY_RUN) {
            await Transport.findByIdAndUpdate(t._id, { chauffeur: personnelParNom._id });
            // Lier aussi le userId pour les prochaines fois
            await Personnel.findByIdAndUpdate(personnelParNom._id, { userId: user._id });
          }
          migrated++;
          ok++;
        } else {
          console.log(`  ⚠️  [${t.numero}] User "${user.email}" sans Personnel correspondant → chauffeur mis à null`);
          if (!DRY_RUN) {
            await Transport.findByIdAndUpdate(t._id, { chauffeur: null });
          }
          cleared++;
        }
      }
    } else {
      console.log(`  ❓ [${t.numero}] chauffeur ID ${chauffeurId} introuvable dans User ET Personnel → mis à null`);
      if (!DRY_RUN) {
        await Transport.findByIdAndUpdate(t._id, { chauffeur: null });
      }
      cleared++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Résultat de la migration :
  ✅ Déjà Personnel     : ${deja_personnel}
  🔄 Migré User→Person : ${migrated}
  ⚠️  Mis à null        : ${cleared}
  📊 Total traités      : ${transports.length}
${DRY_RUN ? "\n⚡ Mode DRY RUN — aucune modification en base" : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Erreur migration :", err.message);
  process.exit(1);
});
