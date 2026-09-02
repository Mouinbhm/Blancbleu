/**
 * BlancBleu — Tests intégration : numérotation métier résiliente à la dérive.
 *
 * Reproduit le bug "E11000 duplicate key … index: numero_1 dup key: FAC-2026-0020" :
 * le Counter est en retard sur les numéros réellement présents (restauration
 * partielle, import, collection `counters` vidée) et regénère un numéro déjà pris.
 *
 * Attendu : utils/sequence recale le compteur et alloue un numéro inédit.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-numerotation";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, "bb-numerotation-test-key-pad!").toString("base64");
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Facture = require("../../models/Facture");
  const Counter = require("../../models/Counter");
  await Facture.deleteMany({});
  await Counter.deleteMany({});
});

function donneesFacture(overrides = {}) {
  return {
    transportId: new mongoose.Types.ObjectId(),
    patientNom: "Ferrero",
    patientPrenom: "Anna",
    montantBase: 50,
    tauxPriseEnCharge: 65,
    ...overrides,
  };
}

describe("Numérotation Facture — dérive du compteur", () => {
  it("alloue un numéro inédit quand le compteur est en retard", async () => {
    const Facture = require("../../models/Facture");
    const Counter = require("../../models/Counter");
    const annee = new Date().getFullYear();

    // 20 factures déjà numérotées (import) mais compteur resté à 0.
    await Facture.insertMany(
      Array.from({ length: 20 }, (_, i) =>
        donneesFacture({ numero: `FAC-${annee}-${String(i + 1).padStart(4, "0")}` }),
      ),
    );
    expect(await Counter.findById("facture")).toBeNull();

    const facture = await Facture.create(donneesFacture());

    expect(facture.numero).toBe(`FAC-${annee}-0021`);
    expect(await Counter.findById("facture")).toMatchObject({ seq: 21 });
  });

  it("reste unique sur des créations concurrentes après recalage", async () => {
    const Facture = require("../../models/Facture");
    const annee = new Date().getFullYear();

    await Facture.create(donneesFacture({ numero: `FAC-${annee}-0001` }));
    await Facture.create(donneesFacture({ numero: `FAC-${annee}-0002` }));

    const resultats = await Promise.all(
      Array.from({ length: 5 }, () => Facture.create(donneesFacture())),
    );

    const numeros = resultats.map((f) => f.numero);
    expect(new Set(numeros).size).toBe(5);
    expect(await Facture.countDocuments()).toBe(7);
  });
});
