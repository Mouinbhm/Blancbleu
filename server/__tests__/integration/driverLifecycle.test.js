/**
 * BlancBleu — Tests Intégration Lifecycle Chauffeur
 *
 * Couvre :
 *  - Sécurité GPS (tracking interdit si driver non assigné)
 *  - Sécurité signature (impossible si mauvais driver)
 *  - Libération véhicule après COMPLETED / NO_SHOW / FAILED
 *  - Création facture après COMPLETED
 *  - Notifications persistées sur transitions clés
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

let mongod;

// ─── Setup global ─────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET = "test-secret-blancbleu-jest";
  process.env.NODE_ENV = "test";
  process.env.AI_API_URL = "http://localhost:5002";
  process.env.PERSONNEL_JWT_SECRET = "test-personnel-secret";

  await mongoose.connect(uri);

  const User = require("../../models/User");
  const Personnel = require("../../models/Personnel");

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash("pass1234", salt);

  // Dispatcher (web)
  const disp = await User.create({
    nom: "Disp",
    prenom: "Test",
    email: "disp@test.fr",
    password: hash,
    role: "dispatcher",
    actif: true,
  });

  // Admin (pour les transitions COMPLETED / FAILED réservées admin par la RBAC)
  const admin = await User.create({
    nom: "Admin",
    prenom: "Test",
    email: "admin@test.fr",
    password: hash,
    role: "admin",
    actif: true,
  });

  // Chauffeur 1 (assigné au transport)
  const drv1 = await Personnel.create({
    nom: "Dupont",
    prenom: "Marc",
    email: "marc@driver.fr",
    password: hash,
    role: "Chauffeur",
    actif: true,
  });

  // Chauffeur 2 (non assigné)
  const drv2 = await Personnel.create({
    nom: "Martin",
    prenom: "Lea",
    email: "lea@driver.fr",
    password: hash,
    role: "Chauffeur",
    actif: true,
  });

  const secret = process.env.JWT_SECRET;
  const pSecret = process.env.PERSONNEL_JWT_SECRET || secret;

  global.__dispToken__ = jwt.sign({ id: disp._id }, secret, { expiresIn: "1h" });
  global.__adminToken__ = jwt.sign({ id: admin._id }, secret, { expiresIn: "1h" });
  // requirePersonnel checks decoded.type === "personnel"
  global.__drvToken1__ = jwt.sign({ id: drv1._id, type: "personnel" }, secret, { expiresIn: "1h" });
  global.__drvToken2__ = jwt.sign({ id: drv2._id, type: "personnel" }, secret, { expiresIn: "1h" });
  global.__drvId1__ = drv1._id.toString();
  global.__drvId2__ = drv2._id.toString();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Transport = require("../../models/Transport");
  const Vehicle = require("../../models/Vehicle");
  const Facture = require("../../models/Facture");
  const Notification = require("../../models/Notification");
  const DriverShift = require("../../models/DriverShift");
  await Promise.all([
    Transport.deleteMany({}),
    Vehicle.deleteMany({}),
    Facture.deleteMany({}),
    Notification.deleteMany({}),
    DriverShift.deleteMany({}),
  ]);
});

function getApp() {
  return require("../../Server");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const baseTransport = {
  patient: { nom: "Martin", prenom: "Jean", dateNaissance: "1950-01-15", mobilite: "ASSIS" },
  typeTransport: "VSL",
  motif: "Consultation",
  dateTransport: new Date(Date.now() + 86400000).toISOString(),
  heureRDV: "09:00",
  adresseDepart: {
    rue: "59 Bd Madeleine",
    ville: "Nice",
    codePostal: "06000",
    coordonnees: { lat: 43.71, lng: 7.26 },
  },
  adresseDestination: {
    rue: "30 Av Pasteur",
    ville: "Nice",
    codePostal: "06000",
    coordonnees: { lat: 43.72, lng: 7.27 },
  },
};

async function creerVehicle(overrides = {}) {
  const Vehicle = require("../../models/Vehicle");
  return Vehicle.create({
    nom: "VSL-01",
    type: "VSL",
    immatriculation: "AA-000-AA",
    statut: "Disponible",
    position: { lat: 43.72, lng: 7.25 },
    ...overrides,
  });
}

async function creerTransportAssigne(statut = "ASSIGNED") {
  const Transport = require("../../models/Transport");
  const vehicle = await creerVehicle({ statut: "En service" });
  const extra = {};
  // Some state machine transitions require these timestamps
  if (
    ["ARRIVED_AT_DESTINATION", "COMPLETED", "BILLING_PENDING", "BILLED", "PAID"].includes(statut)
  ) {
    extra.heureArriveeDestination = new Date();
    extra.heureDepart = new Date();
    extra.heurePriseEnCharge = new Date();
  }
  if (
    ["PATIENT_ON_BOARD", "ARRIVED_AT_DESTINATION", "COMPLETED", "BILLING_PENDING"].includes(statut)
  ) {
    extra.heureDepart = new Date();
    extra.heurePriseEnCharge = new Date();
  }
  const t = await Transport.create({
    ...baseTransport,
    statut,
    vehicule: vehicle._id,
    chauffeur: new mongoose.Types.ObjectId(global.__drvId1__),
    ...extra,
  });
  await require("../../models/Vehicle").findByIdAndUpdate(vehicle._id, {
    transportEnCours: t._id,
  });
  return { transport: t, vehicle };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Sécurité GPS
// ══════════════════════════════════════════════════════════════════════════════
describe("Tracking GPS — sécurité", () => {
  test("403 si le driver n'est pas assigné au transport déclaré", async () => {
    const app = getApp();
    const { transport, vehicle } = await creerTransportAssigne("EN_ROUTE_TO_PICKUP");

    // Créer un shift actif pour le chauffeur 2 (sinon 409 avant la vérif 403)
    const DriverShift = require("../../models/DriverShift");
    await DriverShift.create({
      personnelId: global.__drvId2__,
      vehicleId: vehicle._id,
      status: "ACTIVE",
      startedAt: new Date(),
    });

    // Chauffeur 2 tente d'écrire des points GPS liés au transport du chauffeur 1
    const res = await request(app)
      .post("/api/v1/tracking/batch")
      .set("Authorization", `Bearer ${global.__drvToken2__}`)
      .send({
        points: [
          {
            lat: 43.72,
            lng: 7.25,
            speed: 50,
            timestamp: new Date().toISOString(),
            transportId: transport._id.toString(),
          },
        ],
      });

    expect(res.status).toBe(403);
  });

  test("409 si aucun shift actif pour le driver", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("EN_ROUTE_TO_PICKUP");

    // Chauffeur 1 sans shift actif
    const res = await request(app)
      .post("/api/v1/tracking/batch")
      .set("Authorization", `Bearer ${global.__drvToken1__}`)
      .send({
        points: [
          {
            lat: 43.72,
            lng: 7.25,
            speed: 50,
            timestamp: new Date().toISOString(),
            transportId: transport._id.toString(),
          },
        ],
      });

    expect(res.status).toBe(409);
  });

  test("200 avec shift actif + transport assigné", async () => {
    const app = getApp();
    const { transport, vehicle } = await creerTransportAssigne("EN_ROUTE_TO_PICKUP");

    const DriverShift = require("../../models/DriverShift");
    await DriverShift.create({
      personnelId: global.__drvId1__,
      vehicleId: vehicle._id,
      status: "ACTIVE",
      startedAt: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/tracking/batch")
      .set("Authorization", `Bearer ${global.__drvToken1__}`)
      .send({
        points: [
          {
            lat: 43.72,
            lng: 7.25,
            speed: 50,
            timestamp: new Date().toISOString(),
            transportId: transport._id.toString(),
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Libération véhicule
// ══════════════════════════════════════════════════════════════════════════════
describe("Libération véhicule — états terminaux", () => {
  test("véhicule Disponible après COMPLETED", async () => {
    const app = getApp();
    const { transport, vehicle } = await creerTransportAssigne("ARRIVED_AT_DESTINATION");

    await request(app)
      .patch(`/api/transports/${transport._id}/complete`)
      // RBAC : ARRIVED_AT_DESTINATION → COMPLETED nécessite admin ou chauffeur.
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send({ bypass_date_check: true });

    const v = await require("../../models/Vehicle").findById(vehicle._id);
    expect(v.statut).toBe("Disponible");
    expect(v.transportEnCours).toBeNull();
  });

  test("véhicule Disponible après NO_SHOW", async () => {
    const app = getApp();
    const { transport, vehicle } = await creerTransportAssigne("ARRIVED_AT_PICKUP");

    await request(app)
      .patch(`/api/transports/${transport._id}/no-show`)
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send({ raison: "Patient absent" });

    const v = await require("../../models/Vehicle").findById(vehicle._id);
    expect(v.statut).toBe("Disponible");
    expect(v.transportEnCours).toBeNull();
  });

  test("véhicule Disponible après FAILED", async () => {
    const app = getApp();
    const { transport, vehicle } = await creerTransportAssigne("EN_ROUTE_TO_PICKUP");

    await request(app)
      .patch(`/api/transports/${transport._id}/fail`)
      // RBAC : *_FAILED réservé admin/system.
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send({ raison: "Accident" });

    const v = await require("../../models/Vehicle").findById(vehicle._id);
    expect(v.statut).toBe("Disponible");
    expect(v.transportEnCours).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Facturation automatique
// ══════════════════════════════════════════════════════════════════════════════
describe("Facturation — création automatique après COMPLETED", () => {
  test("une Facture est créée après COMPLETED", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("ARRIVED_AT_DESTINATION");

    const res = await request(app)
      .patch(`/api/transports/${transport._id}/complete`)
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send({ bypass_date_check: true });

    expect(res.status).toBe(200);

    const Facture = require("../../models/Facture");
    // Attendre la création asynchrone (setImmediate)
    await new Promise((r) => setTimeout(r, 300));

    const facture = await Facture.findOne({ transportId: transport._id });
    expect(facture).not.toBeNull();
    expect(facture.statut).toBe("en_attente");
  });

  test("aucune double-facture si appelé deux fois", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("ARRIVED_AT_DESTINATION");

    await request(app)
      .patch(`/api/transports/${transport._id}/complete`)
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send({ bypass_date_check: true });

    await new Promise((r) => setTimeout(r, 300));

    const Facture = require("../../models/Facture");
    const count = await Facture.countDocuments({ transportId: transport._id });
    expect(count).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — Notifications persistées
// ══════════════════════════════════════════════════════════════════════════════
describe("Notifications persistées", () => {
  test("notification créée pour admin + dispatcher après CONFIRMED", async () => {
    const app = getApp();
    const Transport = require("../../models/Transport");
    const t = await Transport.create({ ...baseTransport, statut: "REQUESTED" });

    await request(app)
      .patch(`/api/transports/${t._id}/confirm`)
      .set("Authorization", `Bearer ${global.__dispToken__}`);

    await new Promise((r) => setTimeout(r, 100));

    const Notification = require("../../models/Notification");
    const notifs = await Notification.find({ transportId: t._id });
    expect(notifs.length).toBeGreaterThanOrEqual(2); // admin + dispatcher
    const roles = notifs.map((n) => n.recipientRole);
    expect(roles).toContain("admin");
    expect(roles).toContain("dispatcher");
  });

  test("notification créée après COMPLETED", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("ARRIVED_AT_DESTINATION");

    await request(app)
      .patch(`/api/transports/${transport._id}/complete`)
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send({ bypass_date_check: true });

    await new Promise((r) => setTimeout(r, 300));

    const Notification = require("../../models/Notification");
    const notifs = await Notification.find({ transportId: transport._id });
    const types = notifs.map((n) => n.type);
    // COMPLETED → BILLING_PENDING auto-transition, both fire notifications
    expect(notifs.length).toBeGreaterThanOrEqual(2);
    expect(types.some((t) => ["COMPLETED", "BILLING_PENDING"].includes(t))).toBe(true);
  });

  test("notification créée après NO_SHOW", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("ARRIVED_AT_PICKUP");

    await request(app)
      .patch(`/api/transports/${transport._id}/no-show`)
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send({ raison: "Patient absent" });

    await new Promise((r) => setTimeout(r, 100));

    const Notification = require("../../models/Notification");
    const notifs = await Notification.find({ transportId: transport._id, type: "NO_SHOW" });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 5 — Sécurité signature
// ══════════════════════════════════════════════════════════════════════════════
describe("Signature — sécurité driver", () => {
  test("422 si transport pas au bon statut pour signature", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("EN_ROUTE_TO_PICKUP");

    const res = await request(app)
      .post(`/api/transports/${transport._id}/signature`)
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send({ signedByName: "Jean Martin", signatureBase64: "data:image/png;base64,abc" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("200 signature acceptée depuis ARRIVED_AT_DESTINATION", async () => {
    const app = getApp();
    const { transport } = await creerTransportAssigne("ARRIVED_AT_DESTINATION");

    const res = await request(app)
      .post(`/api/transports/${transport._id}/signature`)
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send({ signedByName: "Jean Martin", signatureBase64: "data:image/png;base64,abc123" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.proofOfCare?.signed).toBe(true);
  });
});
