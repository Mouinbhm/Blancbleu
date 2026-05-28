/**
 * BlancBleu — Tests RGPD : chiffrement at-rest des champs médicaux.
 *
 * Vérifie le round-trip transparent :
 *   1. Patient.create({antecedents: "x"})  → pre('save') chiffre
 *   2. La collection raw stocke un ciphertext (format iv:tag:cipher b64)
 *   3. Patient.findById().select("+antecedents") déchiffre via post('init')
 *   4. select:false : antecedents/allergies absents par défaut
 *
 * Couvre Patient + Personnel (numeroPermis + salaire*Enc shadow).
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-rgpd-medical";
  process.env.NODE_ENV = "test";
  // ENCRYPTION_KEY : 32 bytes en base64 (clé fixe pour les tests).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, "blancbleu-rgpd-test-key-padded!").toString(
    "base64",
  );
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Patient = require("../../models/Patient");
  const Personnel = require("../../models/Personnel");
  await Patient.deleteMany({});
  await Personnel.deleteMany({});
});

function looksEncrypted(v) {
  if (typeof v !== "string" || !v) return false;
  const parts = v.split(":");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p));
}

describe("Patient.antecedents / Patient.allergies — chiffrement at-rest", () => {
  test("la valeur en DB est chiffrée (raw collection)", async () => {
    const Patient = require("../../models/Patient");
    const created = await Patient.create({
      nom: "Dupont",
      antecedents: "Diabète type 2",
      allergies: "Pénicilline",
    });

    const raw = await mongoose.connection.collection("patients").findOne({ _id: created._id });
    expect(looksEncrypted(raw.antecedents)).toBe(true);
    expect(looksEncrypted(raw.allergies)).toBe(true);
    expect(raw.antecedents).not.toBe("Diabète type 2");
    expect(raw.allergies).not.toBe("Pénicilline");
  });

  test("findById sans select → antecedents/allergies absents (select:false)", async () => {
    const Patient = require("../../models/Patient");
    const created = await Patient.create({ nom: "Test", antecedents: "X", allergies: "Y" });
    const found = await Patient.findById(created._id);
    expect(found.antecedents).toBeUndefined();
    expect(found.allergies).toBeUndefined();
  });

  test("findById avec .select('+antecedents +allergies') → déchiffrés transparents", async () => {
    const Patient = require("../../models/Patient");
    const created = await Patient.create({
      nom: "Test",
      antecedents: "Diabète",
      allergies: "Arachides",
    });
    const found = await Patient.findById(created._id).select("+antecedents +allergies");
    expect(found.antecedents).toBe("Diabète");
    expect(found.allergies).toBe("Arachides");
  });

  test("re-save sans modifier → pas de double chiffrement", async () => {
    const Patient = require("../../models/Patient");
    const created = await Patient.create({ nom: "Test", antecedents: "Asthme" });
    const reloaded = await Patient.findById(created._id).select("+antecedents");
    reloaded.nom = "Test2"; // change un autre champ
    await reloaded.save();
    const after = await Patient.findById(created._id).select("+antecedents");
    expect(after.antecedents).toBe("Asthme");
  });
});

describe("Personnel — numeroPermis + salaire*Enc shadow", () => {
  test("numeroPermis chiffré en DB + déchiffré au reload", async () => {
    const Personnel = require("../../models/Personnel");
    const created = await Personnel.create({
      nom: "Martin",
      prenom: "Paul",
      role: "Ambulancier",
      numeroPermis: "AB12345678",
    });
    const raw = await mongoose.connection.collection("personnels").findOne({ _id: created._id });
    expect(looksEncrypted(raw.numeroPermis)).toBe(true);

    const found = await Personnel.findById(created._id).select("+numeroPermis");
    expect(found.numeroPermis).toBe("AB12345678");
  });

  test("salaire*Enc populé depuis salaireBrut/salaireNet en clair", async () => {
    const Personnel = require("../../models/Personnel");
    const created = await Personnel.create({
      nom: "Durand",
      prenom: "Marie",
      role: "Infirmier",
      salaireBrut: 2500,
      salaireNet: 1950,
    });
    const raw = await mongoose.connection.collection("personnels").findOne({ _id: created._id });
    // Number en clair (pour les agrégations Mongo)
    expect(raw.salaireBrut).toBe(2500);
    expect(raw.salaireNet).toBe(1950);
    // Shadow strings chiffrés
    expect(looksEncrypted(raw.salaireBrutEnc)).toBe(true);
    expect(looksEncrypted(raw.salaireNetEnc)).toBe(true);
  });
});
