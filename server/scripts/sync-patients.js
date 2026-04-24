/**
 * BlancBleu — Synchronisation des patients depuis les transports existants
 *
 * Parcourt tous les transports avec un sous-document patient et crée
 * les entrées manquantes dans la collection Patient.
 *
 * Usage :
 *   node server/scripts/sync-patients.js [--dry-run]
 *
 * Idempotent : relançable sans créer de doublons.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Transport = require("../models/Transport");
const Patient   = require("../models/Patient");

const DRY_RUN = process.argv.includes("--dry-run");

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";

async function chercherPatientExistant(p) {
  const conditions = [];

  // Priorité 1 : numéro de sécurité sociale (identifiant fort)
  if (p.numeroSecu && p.numeroSecu.trim()) {
    conditions.push({ numeroSecu: p.numeroSecu.trim() });
  }

  // Priorité 2 : nom + prénom (insensible à la casse)
  conditions.push({
    nom:    { $regex: new RegExp(`^${p.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    prenom: { $regex: new RegExp(`^${(p.prenom || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  return Patient.findOne({ $or: conditions });
}

async function sync() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log(`${CYAN}BlancBleu — Synchronisation des patients${RESET}`);
  if (DRY_RUN) console.log(`${YELLOW}[DRY-RUN] Aucune modification ne sera effectuée${RESET}`);
  console.log("");

  const transports = await Transport.find({
    "patient.nom": { $exists: true, $ne: null },
  }).lean();

  console.log(`📋 ${transports.length} transport(s) à analyser\n`);

  let crees    = 0;
  let existants = 0;
  let erreurs  = 0;

  for (const t of transports) {
    const p = t.patient;
    if (!p?.nom) continue;

    let existe;
    try {
      existe = await chercherPatientExistant(p);
    } catch (err) {
      console.log(`${RED}✗ Recherche échouée pour ${p.nom} ${p.prenom || ""} : ${err.message}${RESET}`);
      erreurs++;
      continue;
    }

    if (existe) {
      existants++;
      console.log(`${DIM}⏭️  Existant : ${p.nom} ${p.prenom || ""}${RESET}`);

      // Si le transport n'a pas encore de patientId, on le lie rétroactivement
      if (!t.patientId && !DRY_RUN) {
        await Transport.findByIdAndUpdate(t._id, { patientId: existe._id });
      }
      continue;
    }

    if (DRY_RUN) {
      console.log(`${DIM}[DRY] Serait créé : ${p.nom} ${p.prenom || ""}${RESET}`);
      crees++;
      continue;
    }

    try {
      const nouveauPatient = await Patient.create({
        nom:           p.nom,
        prenom:        p.prenom        || "",
        dateNaissance: p.dateNaissance || null,
        telephone:     p.telephone     || "",
        numeroSecu:    p.numeroSecu && p.numeroSecu.trim() ? p.numeroSecu.trim() : "",
        mobilite:      p.mobilite      || "ASSIS",
        oxygene:       p.oxygene       || false,
        brancardage:   p.brancardage   || false,
        accompagnateur:p.accompagnateur|| false,
        antecedents:   p.antecedents   || "",
        notes:         p.notes         || "",
        actif:         true,
      });

      // Relier le transport à ce patient
      await Transport.findByIdAndUpdate(t._id, { patientId: nouveauPatient._id });

      crees++;
      console.log(`${GREEN}✅ Créé : ${p.nom} ${p.prenom || ""}${RESET}`);
    } catch (err) {
      erreurs++;
      console.log(`${RED}⚠️  Erreur pour ${p.nom} ${p.prenom || ""} : ${err.message}${RESET}`);
    }
  }

  console.log("");
  console.log(`${DIM}════════════════════════${RESET}`);
  if (DRY_RUN) {
    console.log(`${CYAN}DRY-RUN terminé`);
    console.log(`  → ${crees} patient(s) seraient créés`);
    console.log(`  → ${existants} déjà existant(s)${RESET}`);
  } else {
    console.log(`${GREEN}✅ ${crees} patient(s) créé(s)${RESET}`);
    console.log(`${DIM}⏭️  ${existants} déjà existant(s)${RESET}`);
    if (erreurs) console.log(`${RED}✗ ${erreurs} erreur(s)${RESET}`);
  }
  console.log(`${DIM}════════════════════════${RESET}`);

  await mongoose.disconnect();
  process.exit(0);
}

sync().catch((err) => {
  console.error(`${RED}❌ ${err.message}${RESET}`);
  process.exit(1);
});
