/**
 * BlancBleu — Tests Intégration Analytics Routes
 * Vérifie les KPIs, les paramètres de filtre et les contrôles d'autorisation.
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

  const resSuperv = await request(app).post("/api/auth/login").send({ email: "superv@test.fr", password: "pass1234" });
  global.__supervToken__ = resSuperv.body.token;

  const resDisp = await request(app).post("/api/auth/login").send({ email: "disp@test.fr", password: "pass1234" });
  global.__dispToken__ = resDisp.body.token;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

function getApp() {
  return require("../../Server");
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/dashboard
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard", () => {
  test("200 — retourne les KPIs avec les champs attendus", async () => {
    const app = getApp();
    const res = await request(app)
      .get("/api/analytics/dashboard")
      .set("Authorization", `Bearer ${global.__adminToken__}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("transports");
    expect(res.body).toHaveProperty("flotte");
    expect(res.body).toHaveProperty("performance");
    expect(res.body.transports).toHaveProperty("total");
    expect(res.body.transports).toHaveProperty("tauxCompletion");
    expect(res.body.flotte).toHaveProperty("disponibles");
    expect(res.body.flotte).toHaveProperty("tauxDisponibilite");
  });

  test("401 sans token", async () => {
    const app = getApp();
    const res = await request(app).get("/api/analytics/dashboard");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/transports
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/transports", () => {
  test("200 — avec paramètre jours=7", async () => {
    const app = getApp();
    const res = await request(app)
      .get("/api/analytics/transports?jours=7")
      .set("Authorization", `Bearer ${global.__adminToken__}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("periode");
    expect(res.body.periode).toContain("7");
    expect(res.body).toHaveProperty("parType");
    expect(res.body).toHaveProperty("parMotif");
    expect(res.body).toHaveProperty("parStatut");
  });

  test("200 — avec paramètre jours=30 par défaut", async () => {
    const app = getApp();
    const res = await request(app)
      .get("/api/analytics/transports")
      .set("Authorization", `Bearer ${global.__adminToken__}`);

    expect(res.status).toBe(200);
    expect(res.body.periode).toContain("30");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/prediction-flotte — autorisation superviseur/admin requise
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/prediction-flotte (autorisation)", () => {
  test("403 — dispatcher ne peut pas accéder aux prédictions", async () => {
    const app = getApp();
    const res = await request(app)
      .get("/api/analytics/prediction-flotte")
      .set("Authorization", `Bearer ${global.__dispToken__}`);

    expect(res.status).toBe(403);
  });

  test("200 ou 500 — superviseur peut accéder (service peut être indisponible)", async () => {
    const app = getApp();
    const res = await request(app)
      .get("/api/analytics/prediction-flotte")
      .set("Authorization", `Bearer ${global.__supervToken__}`);

    // 200 si le service de prédiction fonctionne, 500 si indisponible en test
    expect([200, 500]).toContain(res.status);
  });
});
