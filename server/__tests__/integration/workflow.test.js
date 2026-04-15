/**
 * BlancBleu — Tests Intégration Workflow Transport (via API REST)
 *
 * Teste les transitions de statut des transports sanitaires non urgents
 * en appelant les endpoints réels de l'API (supertest + MongoMemoryServer).
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

let mongod;

// ─── Setup global ─────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET = "test-secret-blancbleu-jest";
  process.env.NODE_ENV = "test";
  process.env.AI_API_URL = "http://localhost:5002";

  await mongoose.connect(uri);

  const User = require("../../models/User");
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash("pass1234", salt);
  await User.create({
    nom: "Test",
    prenom: "Dispatcher",
    email: "disp@test.fr",
    password: hashed,
    role: "dispatcher",
    actif: true,
  });

  const app = require("../../Server");
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "disp@test.fr", password: "pass1234" });

  global.__token__ = res.body.token;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Transport = require("../../models/Transport");
  const Vehicle = require("../../models/Vehicle");
  await Transport.deleteMany({});
  await Vehicle.deleteMany({});
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getApp() {
  return require("../../Server");
}

const baseTransport = {
  patient: {
    nom: "Martin",
    prenom: "Jean",
    dateNaissance: "1950-01-15",
    mobilite: "ASSIS",
  },
  typeTransport: "VSL",
  motif: "Consultation", // motif sans PMT obligatoire (pas Dialyse/Chimio/Radio)
  dateTransport: new Date(Date.now() + 86400000).toISOString(), // demain
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

async function creerTransport(overrides = {}) {
  const Transport = require("../../models/Transport");
  return Transport.create({ ...baseTransport, ...overrides });
}

async function creerVehicle(overrides = {}) {
  const Vehicle = require("../../models/Vehicle");
  return Vehicle.create({
    nom: "VSL-01",
    type: "VSL",
    immatriculation: "AA-000-AA",
    statut: "disponible",
    position: { lat: 43.72, lng: 7.25 },
    ...overrides,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Création transport
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/transports", () => {
  test("crée un transport en statut REQUESTED", async () => {
    const app = getApp();

    const res = await request(app)
      .post("/api/transports")
      .set("Authorization", `Bearer ${global.__token__}`)
      .send(baseTransport);

    expect(res.status).toBe(201);
    expect(res.body.transport.statut).toBe("REQUESTED");
    expect(res.body.transport.patient.nom).toBe("Martin");
  });

  test("400 si champs obligatoires manquants", async () => {
    const app = getApp();

    const res = await request(app)
      .post("/api/transports")
      .set("Authorization", `Bearer ${global.__token__}`)
      .send({ motif: "Dialyse" }); // incomplet

    expect(res.status).toBe(400);
  });

  test("401 sans token", async () => {
    const app = getApp();

    const res = await request(app)
      .post("/api/transports")
      .send(baseTransport);

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Transitions lifecycle valides
// ══════════════════════════════════════════════════════════════════════════════
describe("Transitions lifecycle — cas valides", () => {
  test("REQUESTED → CONFIRMED via PATCH /:id/confirm", async () => {
    const app = getApp();
    const t = await creerTransport({ statut: "REQUESTED" });

    const res = await request(app)
      .patch(`/api/transports/${t._id}/confirm`)
      .set("Authorization", `Bearer ${global.__token__}`);

    expect(res.status).toBe(200);
    expect(res.body.transport.statut).toBe("CONFIRMED");
  });

  test("CONFIRMED → SCHEDULED via PATCH /:id/schedule", async () => {
    const app = getApp();
    // motif "Consultation" → pas de PMT requis → transition libre
    const t = await creerTransport({ statut: "CONFIRMED", motif: "Consultation" });

    const res = await request(app)
      .patch(`/api/transports/${t._id}/schedule`)
      .set("Authorization", `Bearer ${global.__token__}`);

    expect(res.status).toBe(200);
    expect(res.body.transport.statut).toBe("SCHEDULED");
  });

  test("REQUESTED → CANCELLED via PATCH /:id/cancel", async () => {
    const app = getApp();
    const t = await creerTransport({ statut: "REQUESTED" });

    const res = await request(app)
      .patch(`/api/transports/${t._id}/cancel`)
      .set("Authorization", `Bearer ${global.__token__}`)
      .send({ raison: "Annulation patient" });

    expect(res.status).toBe(200);
    expect(res.body.transport.statut).toBe("CANCELLED");
  });

  test("SCHEDULED → ASSIGNED via PATCH /:id/assign (avec véhicule + chauffeur)", async () => {
    const app = getApp();
    const vehicle = await creerVehicle();
    // Récupérer l'ID du dispatcher créé dans beforeAll
    const User = require("../../models/User");
    const dispatcher = await User.findOne({ email: "disp@test.fr" });
    const t = await creerTransport({ statut: "SCHEDULED" });

    const res = await request(app)
      .patch(`/api/transports/${t._id}/assign`)
      .set("Authorization", `Bearer ${global.__token__}`)
      .send({
        vehiculeId: vehicle._id.toString(),
        chauffeurId: dispatcher._id.toString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.transport.statut).toBe("ASSIGNED");
    expect(res.body.transport.vehicule).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Récupération et liste
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/transports", () => {
  test("retourne la liste des transports", async () => {
    const app = getApp();
    await creerTransport();
    await creerTransport({ motif: "Radiothérapie" });

    const res = await request(app)
      .get("/api/transports")
      .set("Authorization", `Bearer ${global.__token__}`);

    expect(res.status).toBe(200);
    expect(res.body.transports || res.body).toBeInstanceOf(Array);
  });

  test("GET /:id retourne le transport par ID", async () => {
    const app = getApp();
    const t = await creerTransport();

    const res = await request(app)
      .get(`/api/transports/${t._id}`)
      .set("Authorization", `Bearer ${global.__token__}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(t._id.toString());
    expect(res.body.patient.nom).toBe("Martin");
  });

  test("404 pour ID inexistant", async () => {
    const app = getApp();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(`/api/transports/${fakeId}`)
      .set("Authorization", `Bearer ${global.__token__}`);

    expect(res.status).toBe(404);
  });

  test("401 sans token", async () => {
    const app = getApp();
    const t = await creerTransport();

    const res = await request(app).get(`/api/transports/${t._id}`);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — Annulation et NO_SHOW
// ══════════════════════════════════════════════════════════════════════════════
describe("Cas terminaux — CANCELLED et NO_SHOW", () => {
  test("ARRIVED_AT_PICKUP → NO_SHOW via PATCH /:id/no-show", async () => {
    const app = getApp();
    const vehicle = await creerVehicle();
    // NO_SHOW n'est accessible que depuis ARRIVED_AT_PICKUP (chauffeur arrivé mais patient absent)
    const t = await creerTransport({
      statut: "ARRIVED_AT_PICKUP",
      vehicule: vehicle._id,
    });

    const res = await request(app)
      .patch(`/api/transports/${t._id}/no-show`)
      .set("Authorization", `Bearer ${global.__token__}`)
      .send({ raison: "Patient absent au domicile" });

    expect(res.status).toBe(200);
    expect(res.body.transport.statut).toBe("NO_SHOW");
  });

  test("transport COMPLETED ne peut plus être modifié", async () => {
    const app = getApp();
    const t = await creerTransport({ statut: "COMPLETED" });

    const res = await request(app)
      .patch(`/api/transports/${t._id}/confirm`)
      .set("Authorization", `Bearer ${global.__token__}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
