/**
 * Tests d'intégration : transactions Mongoose dans transportLifecycle.
 *
 * Utilise MongoMemoryReplSet (in-memory + replica set) pour valider que :
 *   1. withTransactionOrFallback ouvre bien une transaction
 *   2. En cas d'erreur en cours, ni Transport ni Vehicle ne sont modifiés
 */

const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replset.getUri();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-tx";
  process.env.ENCRYPTION_KEY = require("crypto").randomBytes(32).toString("base64");
  await mongoose.connect(process.env.MONGO_URI);
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
}, 30000);

afterEach(async () => {
  const Transport = require("../../models/Transport");
  const Vehicle   = require("../../models/Vehicle");
  await Promise.all([Transport.deleteMany({}), Vehicle.deleteMany({})]);
});

describe("withTransactionOrFallback — replica set actif", () => {
  test("rollback si une étape échoue : ni Transport ni Vehicle modifiés", async () => {
    const Transport = require("../../models/Transport");
    const Vehicle   = require("../../models/Vehicle");
    const { withTransactionOrFallback } = require("../../utils/withTransaction");

    const veh = await Vehicle.create({
      immatriculation: "AB-001-CD",
      nom: "Test",
      type: "VSL",
      statut: "Disponible",
    });
    const trs = await Transport.create({
      patient: { nom: "Doe", prenom: "John", mobilite: "ASSIS" },
      typeTransport: "VSL",
      motif: "Consultation",
      dateTransport: new Date(),
      heureRDV: "09:00",
      adresseDepart: { nom: "A", ville: "Nice" },
      adresseDestination: { nom: "B", ville: "Nice" },
    });

    const initialStatutVeh = veh.statut;
    const initialStatutTrs = trs.statut;

    // Tentative : update Transport + Vehicle, puis throw → doit rollback
    await expect(
      withTransactionOrFallback(async (session) => {
        await Transport.findByIdAndUpdate(trs._id,
          { statut: "ASSIGNED", vehicule: veh._id },
          { session: session || undefined },
        );
        await Vehicle.findByIdAndUpdate(veh._id,
          { statut: "En service", transportEnCours: trs._id },
          { session: session || undefined },
        );
        // Échec après les writes — la transaction doit être annulée
        throw new Error("Erreur simulée");
      })
    ).rejects.toThrow("Erreur simulée");

    // Vérifier que rien n'a été persisté
    const trsAfter = await Transport.findById(trs._id);
    const vehAfter = await Vehicle.findById(veh._id);
    expect(trsAfter.statut).toBe(initialStatutTrs);
    expect(vehAfter.statut).toBe(initialStatutVeh);
    expect(trsAfter.vehicule).toBeNull();
  });

  test("commit normal : Transport et Vehicle sont bien mis à jour", async () => {
    const Transport = require("../../models/Transport");
    const Vehicle   = require("../../models/Vehicle");
    const { withTransactionOrFallback } = require("../../utils/withTransaction");

    const veh = await Vehicle.create({
      immatriculation: "AB-002-CD",
      nom: "Test2",
      type: "VSL",
      statut: "Disponible",
    });
    const trs = await Transport.create({
      patient: { nom: "Smith", prenom: "Jane", mobilite: "ASSIS" },
      typeTransport: "VSL",
      motif: "Consultation",
      dateTransport: new Date(),
      heureRDV: "10:00",
      adresseDepart: { nom: "A", ville: "Nice" },
      adresseDestination: { nom: "B", ville: "Nice" },
    });

    await withTransactionOrFallback(async (session) => {
      await Transport.findByIdAndUpdate(trs._id,
        { vehicule: veh._id },
        { session: session || undefined },
      );
      await Vehicle.findByIdAndUpdate(veh._id,
        { statut: "En service", transportEnCours: trs._id },
        { session: session || undefined },
      );
    });

    const trsAfter = await Transport.findById(trs._id);
    const vehAfter = await Vehicle.findById(veh._id);
    expect(String(trsAfter.vehicule)).toBe(String(veh._id));
    expect(vehAfter.statut).toBe("En service");
  });
});
