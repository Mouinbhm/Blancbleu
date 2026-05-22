/**
 * BlancBleu — Tests unitaires : Patient.numeroSecuHash
 *
 * Vérifie que deux patients créés avec le même numeroSecu partagent le même
 * hash déterministe et sont tous deux retrouvables via numeroSecuHash.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const crypto = require("crypto");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI = uri;
  process.env.NODE_ENV = "test";
  // Clé valide pour AES-256-GCM et HMAC-SHA256
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  const Patient = require("../../models/Patient");
  await Patient.deleteMany({});
});

describe("Patient — numeroSecuHash (recherche déterministe)", () => {
  test("deux patients avec le même numeroSecu partagent le même hash", async () => {
    const Patient = require("../../models/Patient");
    const { hashDeterministic } = require("../../utils/hashing");

    const SECU = "1 85 05 75 108 042 47";

    await Patient.create({ nom: "Martin", prenom: "Alice", numeroSecu: SECU });
    await Patient.create({ nom: "Martin", prenom: "Bob",   numeroSecu: SECU });

    const expectedHash = hashDeterministic(SECU);

    // Les deux patients doivent être retrouvés via le hash
    const found = await Patient.find({ numeroSecuHash: expectedHash }).select("+numeroSecuHash");
    expect(found).toHaveLength(2);
    expect(found[0].numeroSecuHash).toBe(expectedHash);
    expect(found[1].numeroSecuHash).toBe(expectedHash);

    // Le numeroSecu stocké doit être chiffré (pas égal à la valeur en clair)
    const raw = await Patient.findOne({ nom: "Martin", prenom: "Alice" }).lean();
    expect(raw.numeroSecu).not.toBe(SECU);
    expect(raw.numeroSecu).toMatch(/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
  });

  test("patient sans numeroSecu n'a pas de hash", async () => {
    const Patient = require("../../models/Patient");

    await Patient.create({ nom: "Dupont", prenom: "Claire", numeroSecu: "" });

    const found = await Patient.findOne({ nom: "Dupont" }).select("+numeroSecuHash").lean();
    expect(found.numeroSecuHash == null || found.numeroSecuHash === "").toBe(true);
  });
});
