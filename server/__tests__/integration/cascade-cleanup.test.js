/**
 * BlancBleu — Tests intégration : cascade cleanup via hooks Mongoose.
 *
 * Couvre les hooks pre("findOneAndDelete") ajoutés sur Vehicle, Personnel et
 * Patient pour éviter les références orphelines Transport.vehicule / .chauffeur
 * / .patientId :
 *  - Vehicle  : refus si transport actif référence le véhicule, sinon soft-flag
 *  - Personnel: même règle pour chauffeur
 *  - Patient  : suppression directe TOUJOURS refusée → anonymisation requise
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-cascade";
  process.env.ENCRYPTION_KEY = require("crypto").randomBytes(32).toString("base64");
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  const Transport = require("../../models/Transport");
  const Vehicle = require("../../models/Vehicle");
  const Personnel = require("../../models/Personnel");
  await Promise.all([Transport.deleteMany({}), Vehicle.deleteMany({}), Personnel.deleteMany({})]);
});

function baseTransportPayload(overrides = {}) {
  return {
    patient: { nom: "Doe", prenom: "Jane", mobilite: "ASSIS" },
    typeTransport: "VSL",
    motif: "Consultation",
    dateTransport: new Date(),
    heureRDV: "10:00",
    adresseDepart: { rue: "1 rue A", ville: "Nice", codePostal: "06000" },
    adresseDestination: { rue: "1 rue B", ville: "Nice", codePostal: "06000" },
    ...overrides,
  };
}

describe("Vehicle.pre('findOneAndDelete') — cascade cleanup", () => {
  test("refuse la suppression si un transport actif référence le véhicule", async () => {
    const Vehicle = require("../../models/Vehicle");
    const Transport = require("../../models/Transport");

    const veh = await Vehicle.create({
      immatriculation: "AA-100-AA",
      nom: "Test VSL actif",
      type: "VSL",
      statut: "Disponible",
    });
    await Transport.create(baseTransportPayload({ vehicule: veh._id, statut: "ASSIGNED" }));

    await expect(Vehicle.findByIdAndDelete(veh._id)).rejects.toThrow(
      /Suppression refusée : 1 transport\(s\) actif/,
    );

    // Vérifier que le véhicule n'a pas été supprimé
    const stillThere = await Vehicle.findById(veh._id).lean();
    expect(stillThere).not.toBeNull();
  });

  test("autorise la suppression si aucun transport actif + flag soft-cascade sur l'historique", async () => {
    const Vehicle = require("../../models/Vehicle");
    const Transport = require("../../models/Transport");

    const veh = await Vehicle.create({
      immatriculation: "BB-200-BB",
      nom: "Test VSL terminé",
      type: "VSL",
      statut: "Disponible",
    });
    const trsCompleted = await Transport.create(
      baseTransportPayload({ vehicule: veh._id, statut: "COMPLETED" }),
    );
    const trsPaid = await Transport.create(
      baseTransportPayload({ vehicule: veh._id, statut: "PAID" }),
    );

    const deleted = await Vehicle.findByIdAndDelete(veh._id);
    expect(deleted).not.toBeNull();

    // Véhicule effectivement supprimé
    expect(await Vehicle.findById(veh._id).lean()).toBeNull();

    // Transports flaggés mais préservés (audit / facturation)
    const t1 = await Transport.findById(trsCompleted._id).lean();
    const t2 = await Transport.findById(trsPaid._id).lean();
    expect(t1.vehiculeDeleted).toBe(true);
    expect(t1.vehiculeDeletedAt).toBeInstanceOf(Date);
    expect(t2.vehiculeDeleted).toBe(true);
    expect(t2.vehiculeDeletedAt).toBeInstanceOf(Date);
  });

  test("considère BILLING_PENDING comme actif (spec stricte)", async () => {
    const Vehicle = require("../../models/Vehicle");
    const Transport = require("../../models/Transport");

    const veh = await Vehicle.create({
      immatriculation: "CC-300-CC",
      nom: "Test billing pending",
      type: "VSL",
      statut: "Disponible",
    });
    await Transport.create(baseTransportPayload({ vehicule: veh._id, statut: "BILLING_PENDING" }));

    await expect(Vehicle.findByIdAndDelete(veh._id)).rejects.toThrow(/Suppression refusée/);
  });
});

describe("Personnel.pre('findOneAndDelete') — cascade cleanup", () => {
  test("refuse si un transport actif référence le chauffeur", async () => {
    const Personnel = require("../../models/Personnel");
    const Transport = require("../../models/Transport");

    const driver = await Personnel.create({
      nom: "Martin",
      prenom: "Paul",
      role: "Chauffeur",
      email: "paul.actif@blancbleu.fr",
    });
    await Transport.create(
      baseTransportPayload({ chauffeur: driver._id, statut: "EN_ROUTE_TO_PICKUP" }),
    );

    await expect(Personnel.findByIdAndDelete(driver._id)).rejects.toThrow(
      /Suppression refusée : 1 transport\(s\) actif/,
    );
  });

  test("autorise si historique uniquement + soft-flag chauffeurDeleted", async () => {
    const Personnel = require("../../models/Personnel");
    const Transport = require("../../models/Transport");

    const driver = await Personnel.create({
      nom: "Durand",
      prenom: "Marie",
      role: "Ambulancier",
      email: "marie.histo@blancbleu.fr",
    });
    const trs = await Transport.create(
      baseTransportPayload({ chauffeur: driver._id, statut: "COMPLETED" }),
    );

    await Personnel.findByIdAndDelete(driver._id);

    expect(await Personnel.findById(driver._id).lean()).toBeNull();
    const t = await Transport.findById(trs._id).lean();
    expect(t.chauffeurDeleted).toBe(true);
    expect(t.chauffeurDeletedAt).toBeInstanceOf(Date);
  });
});

describe("Patient.pre('findOneAndDelete') — anonymisation requise", () => {
  test("toute suppression directe est refusée — orientation anonymizePatient", async () => {
    const Patient = require("../../models/Patient");

    const p = await Patient.create({
      nom: "Test",
      prenom: "Anon",
      email: "anon@example.fr",
    });

    await expect(Patient.findByIdAndDelete(p._id)).rejects.toThrow(
      /Suppression directe du patient interdite.*anonymizePatient/,
    );

    // Patient toujours présent
    expect(await Patient.findById(p._id).lean()).not.toBeNull();
  });
});
