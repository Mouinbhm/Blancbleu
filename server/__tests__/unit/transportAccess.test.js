/**
 * BlancBleu — Tests unitaires : userCanAccessTransport (garde IDOR).
 *
 * Couvre chaque branche d'appartenance basée sur des identifiants immuables :
 * staff, createdBy, chauffeur, patient.email, et tous les refus. C'est aussi la
 * preuve de la logique d'accès de la room socket join:transport (E5), qui
 * réutilise ce helper.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const crypto = require("crypto");

let mongod;
let Transport;
let userCanAccessTransport;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  await mongoose.connect(process.env.MONGO_URI);
  Transport = require("../../models/Transport");
  ({ userCanAccessTransport } = require("../../utils/transportAccess"));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  await Transport.deleteMany({});
});

async function makeTransport(overrides = {}) {
  return Transport.create({
    numero: `TRS-IDOR-U-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patient: {
      nom: "Victime",
      prenom: "Test",
      dateNaissance: new Date("1970-01-01"),
      mobilite: "ASSIS",
      email: overrides.patientEmail || "",
    },
    typeTransport: "VSL",
    motif: "Consultation",
    dateTransport: new Date(),
    heureRDV: "10:00",
    adresseDepart: {
      rue: "1 rue Test",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.71, lng: 7.26 },
    },
    adresseDestination: {
      rue: "2 av Test",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.72, lng: 7.27 },
    },
    statut: "REQUESTED",
    createdBy: overrides.createdBy,
    chauffeur: overrides.chauffeur,
  });
}

describe("userCanAccessTransport", () => {
  test("staff (admin) → true, sans même lire le transport", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const ok = await userCanAccessTransport(
      { _id: new mongoose.Types.ObjectId(), role: "admin" },
      fakeId,
    );
    expect(ok).toBe(true);
  });

  test("createdBy correspond → true", async () => {
    const uid = new mongoose.Types.ObjectId();
    const t = await makeTransport({ createdBy: uid });
    expect(await userCanAccessTransport({ _id: uid, role: "patient" }, t._id.toString())).toBe(
      true,
    );
  });

  test("chauffeur assigné correspond → true", async () => {
    const driverId = new mongoose.Types.ObjectId();
    const t = await makeTransport({
      createdBy: new mongoose.Types.ObjectId(),
      chauffeur: driverId,
    });
    expect(await userCanAccessTransport({ _id: driverId }, t._id.toString())).toBe(true);
  });

  test("patient.email correspond (transport créé par un dispatcher) → true", async () => {
    const t = await makeTransport({
      createdBy: new mongoose.Types.ObjectId(),
      patientEmail: "victime@test.fr",
    });
    expect(
      await userCanAccessTransport(
        { _id: new mongoose.Types.ObjectId(), role: "patient", email: "victime@test.fr" },
        t._id.toString(),
      ),
    ).toBe(true);
  });

  test("aucun identifiant immuable ne correspond → false", async () => {
    const t = await makeTransport({
      createdBy: new mongoose.Types.ObjectId(),
      patientEmail: "victime@test.fr",
    });
    const ok = await userCanAccessTransport(
      { _id: new mongoose.Types.ObjectId(), role: "patient", email: "attaquant@test.fr" },
      t._id.toString(),
    );
    expect(ok).toBe(false);
  });

  test("user nul / transportId nul / transport introuvable → false", async () => {
    expect(await userCanAccessTransport(null, new mongoose.Types.ObjectId().toString())).toBe(
      false,
    );
    expect(await userCanAccessTransport({ _id: new mongoose.Types.ObjectId() }, null)).toBe(false);
    expect(
      await userCanAccessTransport(
        { _id: new mongoose.Types.ObjectId(), role: "patient" },
        new mongoose.Types.ObjectId().toString(),
      ),
    ).toBe(false);
  });
});
