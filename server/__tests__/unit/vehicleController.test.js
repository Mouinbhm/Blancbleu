/**
 * BlancBleu — Tests Intégration Vehicle Routes
 * Vérifie le CRUD et les contrôles d'autorisation sur /api/vehicles
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
  const hash = await bcrypt.hash("pass1234", salt);

  await User.create([
    { nom: "Admin", prenom: "Test", email: "admin@test.fr", password: hash, role: "admin", actif: true },
    { nom: "Superv", prenom: "Test", email: "superv@test.fr", password: hash, role: "superviseur", actif: true },
    { nom: "Disp", prenom: "Test", email: "disp@test.fr", password: hash, role: "dispatcher", actif: true },
  ]);

  const app = require("../../Server");

  const resAdmin = await request(app).post("/api/auth/login").send({ email: "admin@test.fr", password: "pass1234" });
  global.__adminToken__ = resAdmin.body.token;

  const resDisp = await request(app).post("/api/auth/login").send({ email: "disp@test.fr", password: "pass1234" });
  global.__dispToken__ = resDisp.body.token;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Vehicle = require("../../models/Vehicle");
  await Vehicle.deleteMany({});
});

function getApp() {
  return require("../../Server");
}

const baseVehicle = {
  nom: "VSL-01",
  type: "VSL",
  immatriculation: "AA-000-AA",
  statut: "disponible",
};

async function creerVehicle(overrides = {}) {
  const Vehicle = require("../../models/Vehicle");
  return Vehicle.create({ ...baseVehicle, ...overrides });
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/vehicles
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/vehicles", () => {
  test("200 — retourne la liste paginée", async () => {
    const app = getApp();
    await creerVehicle({ immatriculation: "BB-001-BB" });
    await creerVehicle({ immatriculation: "BB-002-BB", type: "AMBULANCE" });

    const res = await request(app)
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${global.__dispToken__}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.total).toBe(2);
  });

  test("401 sans token", async () => {
    const app = getApp();
    const res = await request(app).get("/api/vehicles");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/vehicles
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/vehicles", () => {
  test("201 — crée un véhicule valide (admin)", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/vehicles")
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send(baseVehicle);

    expect(res.status).toBe(201);
    expect(res.body.immatriculation).toBe("AA-000-AA");
    expect(res.body.type).toBe("VSL");
  });

  test("400 — rejette un type invalide", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/vehicles")
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send({ ...baseVehicle, type: "HELICOPTERE" });

    expect(res.status).toBe(400);
  });

  test("400 — rejette si immatriculation manquante", async () => {
    const app = getApp();
    const { immatriculation, ...sans } = baseVehicle;
    const res = await request(app)
      .post("/api/vehicles")
      .set("Authorization", `Bearer ${global.__adminToken__}`)
      .send(sans);

    expect(res.status).toBe(400);
  });

  test("403 — dispatcher ne peut pas créer un véhicule", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/vehicles")
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send(baseVehicle);

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/vehicles/:id/statut
// ══════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/vehicles/:id/statut", () => {
  test("200 — change le statut avec succès", async () => {
    const app = getApp();
    const vehicle = await creerVehicle();

    const res = await request(app)
      .patch(`/api/vehicles/${vehicle._id}/statut`)
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send({ statut: "maintenance" });

    expect(res.status).toBe(200);
    expect(res.body.statut).toBe("maintenance");
  });

  test("400 — rejette un statut invalide", async () => {
    const app = getApp();
    const vehicle = await creerVehicle();

    const res = await request(app)
      .patch(`/api/vehicles/${vehicle._id}/statut`)
      .set("Authorization", `Bearer ${global.__dispToken__}`)
      .send({ statut: "en_vacances" });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/vehicles/:id
// ══════════════════════════════════════════════════════════════════════════════
describe("DELETE /api/vehicles/:id", () => {
  test("200 — soft delete par admin", async () => {
    const app = getApp();
    const vehicle = await creerVehicle();

    const res = await request(app)
      .delete(`/api/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${global.__adminToken__}`);

    expect(res.status).toBe(200);

    const Vehicle = require("../../models/Vehicle");
    const deleted = await Vehicle.findById(vehicle._id);
    expect(deleted.deletedAt).not.toBeNull();
  });

  test("403 — dispatcher ne peut pas supprimer", async () => {
    const app = getApp();
    const vehicle = await creerVehicle();

    const res = await request(app)
      .delete(`/api/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${global.__dispToken__}`);

    expect(res.status).toBe(403);
  });
});
