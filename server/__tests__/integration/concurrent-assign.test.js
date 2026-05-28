/**
 * BlancBleu — Tests intégration : assignation atomique de véhicule.
 *
 * Régression : deux dispatchers pouvaient assigner le même véhicule à deux
 * transports simultanément (8+ findByIdAndUpdate sans version check / lock,
 * et withTransactionOrFallback retombait sur du non-transactionnel en
 * standalone Mongo). Depuis le refactor, Vehicle.findOneAndUpdate avec garde
 * stricte `{statut: "Disponible", transportEnCours: null/missing}` rend la
 * claim atomique au niveau document Mongo — exactement 1 succès garanti.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-concurrency";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, "blancbleu-concurrency-test-key!").toString(
    "base64",
  );
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Vehicle = require("../../models/Vehicle");
  const Transport = require("../../models/Transport");
  await Vehicle.deleteMany({});
  await Transport.deleteMany({});
});

async function creerVehiculeDisponible() {
  const Vehicle = require("../../models/Vehicle");
  return Vehicle.create({
    immatriculation: "AA-001-XX",
    nom: "VSL-Test-01",
    type: "VSL",
    statut: "Disponible",
    transportEnCours: null,
    capacitePassagers: 1,
  });
}

async function creerTransportScheduled({ numeroSuffix = "" } = {}) {
  const Transport = require("../../models/Transport");
  return Transport.create({
    numero: `TRS-TEST-${numeroSuffix}-${Date.now()}`,
    patient: {
      nom: "Test",
      prenom: "Patient",
      telephone: "0600000000",
      mobilite: "ASSIS",
    },
    typeTransport: "VSL",
    motif: "Dialyse",
    dateTransport: new Date(),
    heureRDV: "10:00",
    adresseDepart: { nom: "Domicile", rue: "1 rue de Test", ville: "Nice", codePostal: "06000" },
    adresseDestination: { nom: "Centre", rue: "2 av de Test", ville: "Nice", codePostal: "06000" },
    statut: "SCHEDULED",
  });
}

describe("assignerVehicule — race condition (claim atomique du véhicule)", () => {
  test("2 assignations concurrentes du même véhicule → exactement 1 succès + 1 ConflictError", async () => {
    const lifecycle = require("../../services/transportLifecycle");
    const { ConflictError } = require("../../utils/errors");
    const Vehicle = require("../../models/Vehicle");
    const Transport = require("../../models/Transport");

    const vehicule = await creerVehiculeDisponible();
    const transportA = await creerTransportScheduled({ numeroSuffix: "A" });
    const transportB = await creerTransportScheduled({ numeroSuffix: "B" });

    const utilisateur = {
      _id: new mongoose.Types.ObjectId(),
      email: "test@blancbleu.fr",
      role: "dispatcher",
    };

    // Lance les deux assignations en parallèle sur le même véhicule.
    const [resA, resB] = await Promise.allSettled([
      lifecycle.assignerVehicule(transportA._id, { vehiculeId: vehicule._id }, utilisateur),
      lifecycle.assignerVehicule(transportB._id, { vehiculeId: vehicule._id }, utilisateur),
    ]);

    // Exactement un succès, exactement un échec ConflictError.
    const successes = [resA, resB].filter((r) => r.status === "fulfilled");
    const failures = [resA, resB].filter((r) => r.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const failureReason = failures[0].reason;
    expect(failureReason).toBeInstanceOf(ConflictError);
    expect(failureReason.statusCode).toBe(409);

    // Identifie le transport gagnant via le succès retourné par le lifecycle.
    const winningTransport = successes[0].value.transport;
    const winningId = String(winningTransport._id);
    const losingId =
      winningId === String(transportA._id) ? String(transportB._id) : String(transportA._id);

    // Le véhicule pointe sur le transport gagnant, statut "En service".
    const vehiculeFinal = await Vehicle.findById(vehicule._id);
    expect(vehiculeFinal.statut).toBe("En service");
    expect(String(vehiculeFinal.transportEnCours)).toBe(winningId);

    // Le transport perdant reste en SCHEDULED, sans véhicule assigné.
    const transportPerdant = await Transport.findById(losingId);
    expect(transportPerdant.statut).toBe("SCHEDULED");
    expect(transportPerdant.vehicule).toBeFalsy();
  });

  test("assignation sur véhicule déjà En service → ConflictError immédiat (sans toucher au transport)", async () => {
    const lifecycle = require("../../services/transportLifecycle");
    const { ConflictError } = require("../../utils/errors");
    const Vehicle = require("../../models/Vehicle");
    const Transport = require("../../models/Transport");

    const vehicule = await creerVehiculeDisponible();
    const dejaAssigne = await creerTransportScheduled({ numeroSuffix: "PRE" });
    // Place le véhicule en service (simule un transport déjà en cours).
    await Vehicle.findByIdAndUpdate(vehicule._id, {
      statut: "En service",
      transportEnCours: dejaAssigne._id,
    });

    const nouveauTransport = await creerTransportScheduled({ numeroSuffix: "NEW" });
    const utilisateur = {
      _id: new mongoose.Types.ObjectId(),
      email: "test@blancbleu.fr",
      role: "dispatcher",
    };

    await expect(
      lifecycle.assignerVehicule(nouveauTransport._id, { vehiculeId: vehicule._id }, utilisateur),
    ).rejects.toBeInstanceOf(ConflictError);

    // Le transport ne doit pas avoir été modifié (pas de fuite vehicule/chauffeur).
    const apres = await Transport.findById(nouveauTransport._id);
    expect(apres.statut).toBe("SCHEDULED");
    expect(apres.vehicule).toBeFalsy();

    // Le véhicule pointe toujours sur le transport pré-existant.
    const vehiculeApres = await Vehicle.findById(vehicule._id);
    expect(String(vehiculeApres.transportEnCours)).toBe(String(dejaAssigne._id));
  });
});
