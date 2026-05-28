/**
 * BlancBleu — Migration RGPD : chiffrement at-rest des champs médicaux
 *
 * Parcourt les collections existantes et chiffre (AES-256-GCM) les champs
 * actuellement en clair :
 *   - Patient.antecedents, Patient.allergies
 *   - Transport.patient.antecedents, Transport.patient.allergies
 *   - Prescription.commentaireDispatcher, Prescription.notes
 *   - Personnel.numeroPermis
 *   - Personnel.salaireBrutEnc (depuis salaireBrut), salaireNetEnc (depuis salaireNet)
 *
 * IDEMPOTENT : la détection "déjà chiffré" repose sur le format produit par
 * utils/encryption.encrypt() : `<iv_b64>:<tag_b64>:<cipher_b64>` (3 segments
 * base64 séparés par `:`). Une valeur en clair n'a presque jamais ce pattern
 * exact, et le re-run skip les valeurs déjà au format.
 *
 * BYPASS des hooks Mongoose : on utilise Model.collection.{find,updateOne}
 * (driver natif) pour NE PAS déclencher post('init') qui déchiffrerait
 * immédiatement → on ne verrait jamais le ciphertext et on re-chiffrerait
 * (double encryption).
 *
 * AVANT DE LANCER : mongodump --uri "$MONGO_URI" --out backup-$(date +%Y%m%d)
 *
 * Usage :
 *   ENCRYPTION_KEY=... MONGO_URI=... node server/scripts/encrypt-medical-fields.js
 *   ENCRYPTION_KEY=... MONGO_URI=... node server/scripts/encrypt-medical-fields.js --dry-run
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { encrypt } = require("../utils/encryption");

const DRY_RUN = process.argv.includes("--dry-run");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

/**
 * Détecte si une chaîne est déjà au format encrypt() :
 * `<iv_b64>:<tag_b64>:<cipher_b64>` — 3 segments base64.
 * Le format base64 contient [A-Za-z0-9+/=] uniquement.
 */
function isAlreadyEncrypted(v) {
  if (typeof v !== "string" || !v) return false;
  const parts = v.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p) && p.length > 0);
}

/**
 * Encrypt une valeur si elle est en clair, sinon retourne null (rien à faire).
 * Renvoie null pour les valeurs vides/null/undefined (rien à chiffrer).
 */
function maybeEncrypt(v) {
  if (v === null || v === undefined || v === "") return null;
  if (isAlreadyEncrypted(String(v))) return null;
  return encrypt(String(v));
}

async function migrateCollection({ collection, idLabel, fields }) {
  const coll = mongoose.connection.collection(collection);
  const cursor = coll.find({});
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    scanned++;
    const $set = {};

    for (const { from, to } of fields) {
      const value = from.split(".").reduce((o, k) => (o == null ? undefined : o[k]), doc);
      const enc = maybeEncrypt(value);
      if (enc !== null) $set[to] = enc;
    }

    if (Object.keys($set).length === 0) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await coll.updateOne({ _id: doc._id }, { $set });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  ${DIM}…${updated} ${idLabel} mis à jour${RESET}`);
    }
  }

  return { scanned, updated, skipped };
}

async function run() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY non défini. Abort.");
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI non défini. Abort.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`${CYAN}BlancBleu — Migration RGPD : chiffrement médical${RESET}`);
  if (DRY_RUN) console.log(`${YELLOW}[DRY-RUN] Aucune écriture${RESET}`);
  console.log("");

  // ─── Patient ──────────────────────────────────────────────────────────────
  console.log(`${CYAN}▶ Patient.antecedents / Patient.allergies${RESET}`);
  const r1 = await migrateCollection({
    collection: "patients",
    idLabel: "patients",
    fields: [
      { from: "antecedents", to: "antecedents" },
      { from: "allergies", to: "allergies" },
    ],
  });
  console.log(
    `  ${GREEN}${r1.updated}${RESET} chiffrés, ${DIM}${r1.skipped} déjà chiffrés/vides${RESET}, total scanné : ${r1.scanned}`,
  );

  // ─── Transport.patient (subdoc) ──────────────────────────────────────────
  console.log(`${CYAN}▶ Transport.patient.antecedents / Transport.patient.allergies${RESET}`);
  const r2 = await migrateCollection({
    collection: "transports",
    idLabel: "transports",
    fields: [
      { from: "patient.antecedents", to: "patient.antecedents" },
      { from: "patient.allergies", to: "patient.allergies" },
    ],
  });
  console.log(
    `  ${GREEN}${r2.updated}${RESET} chiffrés, ${DIM}${r2.skipped} déjà chiffrés/vides${RESET}, total scanné : ${r2.scanned}`,
  );

  // ─── Prescription ────────────────────────────────────────────────────────
  console.log(`${CYAN}▶ Prescription.commentaireDispatcher / Prescription.notes${RESET}`);
  const r3 = await migrateCollection({
    collection: "prescriptions",
    idLabel: "prescriptions",
    fields: [
      { from: "commentaireDispatcher", to: "commentaireDispatcher" },
      { from: "notes", to: "notes" },
    ],
  });
  console.log(
    `  ${GREEN}${r3.updated}${RESET} chiffrés, ${DIM}${r3.skipped} déjà chiffrés/vides${RESET}, total scanné : ${r3.scanned}`,
  );

  // ─── Personnel.numeroPermis + Personnel.salaire*Enc ──────────────────────
  console.log(`${CYAN}▶ Personnel.numeroPermis + salaireBrutEnc/salaireNetEnc${RESET}`);
  // numeroPermis : chiffre la valeur existante en place (string).
  // salaire*Enc : populate depuis salaireBrut/salaireNet (Number en clair, qu'on garde).
  const personnelColl = mongoose.connection.collection("personnels");
  let pScanned = 0,
    pUpdated = 0,
    pSkipped = 0;
  for await (const doc of personnelColl.find({})) {
    pScanned++;
    const $set = {};

    const encPermis = maybeEncrypt(doc.numeroPermis);
    if (encPermis !== null) $set.numeroPermis = encPermis;

    // salaireBrutEnc : populate si vide ; sinon skip (idempotent).
    if (!doc.salaireBrutEnc || !isAlreadyEncrypted(doc.salaireBrutEnc)) {
      $set.salaireBrutEnc = encrypt(String(doc.salaireBrut || 0));
    }
    if (!doc.salaireNetEnc || !isAlreadyEncrypted(doc.salaireNetEnc)) {
      $set.salaireNetEnc = encrypt(String(doc.salaireNet || 0));
    }

    if (Object.keys($set).length === 0) {
      pSkipped++;
      continue;
    }

    if (!DRY_RUN) {
      await personnelColl.updateOne({ _id: doc._id }, { $set });
    }
    pUpdated++;
    if (pUpdated % 50 === 0) {
      console.log(`  ${DIM}…${pUpdated} personnels mis à jour${RESET}`);
    }
  }
  console.log(
    `  ${GREEN}${pUpdated}${RESET} chiffrés, ${DIM}${pSkipped} déjà chiffrés/vides${RESET}, total scanné : ${pScanned}`,
  );

  console.log("");
  console.log(`${GREEN}════════════════════════${RESET}`);
  console.log(`${GREEN}Migration terminée${RESET}${DRY_RUN ? ` ${YELLOW}(DRY-RUN)${RESET}` : ""}`);
  console.log(`${GREEN}════════════════════════${RESET}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration échouée :", err);
  process.exit(1);
});
