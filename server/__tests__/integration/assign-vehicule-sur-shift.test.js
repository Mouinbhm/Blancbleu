/**
 * BlancBleu — Tests intégration : assignation d'un véhicule tenu par un shift.
 *
 * Quand un chauffeur démarre son shift, shiftController passe le véhicule à
 * "En service" (currentShiftId renseigné, transportEnCours vide). Le claim
 * atomique d'assignerVehicule n'acceptait que "Disponible" : le véhicule
 * devenait donc inassignable dès que son chauffeur prenait son service — le
 * transport restait bloqué en SCHEDULED.
 *
 * Couvre :
 *  - assignation OK sur un véhicule tenu par un shift actif
 *  - refus si le véhicule est réellement en mission (transportEnCours posé)
 *  - rollback : le véhicule retrouve "En service" (et pas "Disponible")
 *  - vehicleCleanupService ne libère pas un véhicule sur shift actif
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-assign-shift";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, "bb-assign-shift-test-key-pad!").toString("base64");
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  for (const m of ["Transport", "Vehicle", "Personnel", "DriverShift"]) {
    await require(`../../models/${m}`).deleteMany({});
  }
});

const UTILISATEUR = {
  _id: new mongoose.Types.ObjectId(),
  email: "dispatcher@test.fr",
  role: "dispatcher",
};

async function creerFlotteSurShift() {
  const Vehicle = require("../../models/Vehicle");
  const Personnel = require("../../models/Personnel");
  const DriverShift = require("../../models/DriverShift");

  const chauffeur = await Personnel.create({
    nom: "Faure",
    prenom: "Nicolas",
    role: "Chauffeur",
    statut: "En shift",
    email: `nf-${Date.now()}@test.fr`,
  });

  const vehicule = await Vehicle.create({
    immatriculation: `AA-${Math.floor(Math.random() * 900 + 100)}-NI`,
    nom: "VSL-01",
    type: "VSL",
    statut: "Disponible",
  });

  // Démarrage de shift — même effet de bord que shiftController.startShift
  const shift = await DriverShift.create({
    personnelId: chauffeur._id,
    vehicleId: vehicule._id,
    date: new Date(),
    startTime: new Date(),
    status: "ACTIVE",
  });
  await Vehicle.findByIdAndUpdate(vehicule._id, {
    statut: "En service",
    currentShiftId: shift._id,
    currentPersonnelId: chauffeur._id,
  });
  await Personnel.findByIdAndUpdate(chauffeur._id, { currentShiftId: shift._id });

  return { chauffeur, vehicule, shift };
}

async function creerTransportPlanifie() {
  const Transport = require("../../models/Transport");
  return Transport.create({
    patient: {
      nom: "Test",
      prenom: "Patient",
      dateNaissance: new Date("1960-01-01"),
      mobilite: "ASSIS",
    },
    typeTransport: "VSL",
    motif: "Dialyse",
    dateTransport: new Date(Date.now() + 3600_000),
    heureRDV: "18:30",
    adresseDepart: {
      rue: "12 Rue de France",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.7, lng: 7.26 },
    },
    adresseDestination: {
      rue: "Hopital Pasteur",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.72, lng: 7.28 },
    },
    statut: "SCHEDULED",
  });
}

describe("assignerVehicule — véhicule tenu par un shift actif", () => {
  it("assigne le véhicule et passe le transport en ASSIGNED", async () => {
    const lifecycle = require("../../services/transportLifecycle");
    const Vehicle = require("../../models/Vehicle");

    const { vehicule, chauffeur } = await creerFlotteSurShift();
    const transport = await creerTransportPlanifie();

    const { transport: updated } = await lifecycle.assignerVehicule(
      transport._id,
      { vehiculeId: vehicule._id, chauffeurId: chauffeur._id },
      UTILISATEUR,
    );

    expect(updated.statut).toBe("ASSIGNED");
    // `vehicule` est peuplé par la transition — comparer sur l'_id.
    expect(String(updated.vehicule._id || updated.vehicule)).toBe(String(vehicule._id));

    const apres = await Vehicle.findById(vehicule._id).lean();
    expect(String(apres.transportEnCours)).toBe(String(transport._id));
  });

  it("refuse si le véhicule est déjà en mission", async () => {
    const lifecycle = require("../../services/transportLifecycle");
    const Vehicle = require("../../models/Vehicle");

    const { vehicule, chauffeur } = await creerFlotteSurShift();
    const [enCours, nouveau] = [await creerTransportPlanifie(), await creerTransportPlanifie()];
    await Vehicle.findByIdAndUpdate(vehicule._id, { transportEnCours: enCours._id });

    await expect(
      lifecycle.assignerVehicule(
        nouveau._id,
        { vehiculeId: vehicule._id, chauffeurId: chauffeur._id },
        UTILISATEUR,
      ),
    ).rejects.toThrow(/déjà occupé|indisponible/i);
  });

  it("rollback : le véhicule retrouve son statut de shift, pas Disponible", async () => {
    const lifecycle = require("../../services/transportLifecycle");
    const Vehicle = require("../../models/Vehicle");
    const Transport = require("../../models/Transport");

    const { vehicule, chauffeur } = await creerFlotteSurShift();
    const transport = await creerTransportPlanifie();
    // Statut non assignable → l'update du transport échoue après le claim.
    await Transport.findByIdAndUpdate(transport._id, { statut: "COMPLETED" });

    await expect(
      lifecycle.assignerVehicule(
        transport._id,
        { vehiculeId: vehicule._id, chauffeurId: chauffeur._id },
        UTILISATEUR,
      ),
    ).rejects.toThrow();

    const apres = await Vehicle.findById(vehicule._id).lean();
    expect(apres.statut).toBe("En service");
    expect(apres.transportEnCours).toBeNull();
  });
});

describe("vehicleCleanupService — véhicule sur shift actif", () => {
  it("ne libère pas un véhicule dont le shift est encore actif", async () => {
    const { nettoyerVehiculesBloqués } = require("../../services/vehicleCleanupService");
    const Vehicle = require("../../models/Vehicle");

    const { vehicule } = await creerFlotteSurShift();

    await nettoyerVehiculesBloqués();

    const apres = await Vehicle.findById(vehicule._id).lean();
    expect(apres.statut).toBe("En service");
  });

  it("libère un véhicule En service sans shift ni transport", async () => {
    const { nettoyerVehiculesBloqués } = require("../../services/vehicleCleanupService");
    const Vehicle = require("../../models/Vehicle");

    const orphelin = await Vehicle.create({
      immatriculation: "BB-999-NI",
      nom: "VSL-99",
      type: "VSL",
      statut: "En service",
    });

    await nettoyerVehiculesBloqués();

    const apres = await Vehicle.findById(orphelin._id).lean();
    expect(apres.statut).toBe("Disponible");
  });
});
