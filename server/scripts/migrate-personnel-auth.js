/**
 * Migration : Lier les comptes User ambulancier/chauffeur aux fiches Personnel existantes
 *
 * Ce script NE SUPPRIME AUCUNE DONNÉE. Il est idempotent.
 *
 * Pour chaque User avec role ambulancier ou chauffeur :
 *   1. Cherche une fiche Personnel avec le même email
 *   2. Si trouvé ET que la fiche n'a pas encore de password → copie le hash bcrypt du User
 *      et active forcePasswordChange = true
 *   3. Si non trouvé → crée une fiche Personnel minimale (nom, prenom, email, role)
 *      avec forcePasswordChange = true et un mot de passe temporaire généré
 *   4. Imprime un rapport sans modifier les Users
 *
 * Usage :
 *   node server/scripts/migrate-personnel-auth.js
 *
 * Variables d'environnement requises dans server/.env :
 *   MONGO_URI=mongodb+srv://...
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Personnel = require("../models/Personnel");

const DRIVER_ROLES = ["ambulancier", "chauffeur", "driver"];

function genTempPassword() {
  return "BlancBleu@" + String(Math.floor(1000 + Math.random() * 9000));
}

function mapRole(userRole) {
  if (userRole === "chauffeur") return "Chauffeur";
  return "Ambulancier";
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB\n");

  const users = await User.find({ role: { $in: DRIVER_ROLES } }).select("+password");
  console.log(`Trouvé ${users.length} User(s) avec rôle ambulancier/chauffeur/driver\n`);

  let linked = 0,
    created = 0,
    alreadyDone = 0;
  const tempPasswords = [];

  for (const u of users) {
    const email = u.email?.toLowerCase().trim();
    if (!email) {
      console.log(`  SKIP User ${u._id} — pas d'email`);
      continue;
    }

    const personnel = await Personnel.findOne({ email }).select("+password");

    if (personnel) {
      if (personnel.password) {
        console.log(`  OK   ${email} — Personnel déjà activé (password présent)`);
        alreadyDone++;
      } else {
        // Copy hashed password from User
        personnel.password = u.password;
        personnel.forcePasswordChange = true;
        if (!personnel.role) personnel.role = mapRole(u.role);
        await personnel.save({ validateBeforeSave: false });
        console.log(
          `  LINK ${email} — hash copié depuis User → Personnel (forcePasswordChange=true)`,
        );
        linked++;
      }
    } else {
      // Create minimal Personnel record
      const tempPwd = genTempPassword();
      const hashedPwd = await bcrypt.hash(tempPwd, 12);
      const [prenom, ...restNom] = (u.nom || "Inconnu Inconnu").split(" ");
      const nom = restNom.join(" ") || prenom;

      await Personnel.create({
        nom,
        prenom,
        email,
        role: mapRole(u.role),
        password: hashedPwd,
        forcePasswordChange: true,
        actif: u.actif !== false,
      });

      tempPasswords.push({ email, tempPassword: tempPwd });
      console.log(`  NEW  ${email} — Personnel créé avec mot de passe temporaire`);
      created++;
    }
  }

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`Résultat :`);
  console.log(`  Liés (hash copié)         : ${linked}`);
  console.log(`  Créés (nouveau Personnel) : ${created}`);
  console.log(`  Déjà actifs               : ${alreadyDone}`);
  console.log(`  Total traités             : ${users.length}`);

  if (tempPasswords.length > 0) {
    console.log(`\nMots de passe temporaires à communiquer :`);
    for (const { email, tempPassword } of tempPasswords) {
      console.log(`  ${email.padEnd(40)} ${tempPassword}`);
    }
  }

  console.log(`\nAucun User ni donnée supprimée — migration non destructive.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Erreur migration :", err.message);
  process.exit(1);
});
