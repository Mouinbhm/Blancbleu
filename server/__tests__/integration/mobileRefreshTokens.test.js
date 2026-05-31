/**
 * Sprint M1 — Tests d'intégration : refresh tokens mobile (personnel + patient).
 *
 * Vérifie :
 *   1. login renvoie { token, refreshToken } (personnel) ou { accessToken,
 *      refreshToken } (patient).
 *   2. refresh fournit un NOUVEAU access + NOUVEAU refresh.
 *   3. Rotation stricte : l'ancien refresh devient invalide.
 *   4. 401 si refresh inconnu.
 *   5. 400 si refreshToken absent du body.
 *   6. 401 si refresh d'audience invalide (ex. token personnel posté sur
 *      /api/patient/refresh).
 *
 * Pas de monter Express : appel direct des handlers via supertest sur Server.js.
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-m1-mobile-refresh";
  process.env.NODE_ENV = "test";
  process.env.AI_API_URL = "http://localhost:5002";
  await mongoose.connect(process.env.MONGO_URI);
  app = require("../../Server");
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  const User = require("../../models/User");
  const Personnel = require("../../models/Personnel");
  const RefreshToken = require("../../models/RefreshToken");
  await Promise.all([User.deleteMany({}), Personnel.deleteMany({}), RefreshToken.deleteMany({})]);
});

async function seedPersonnel(overrides = {}) {
  const Personnel = require("../../models/Personnel");
  const hash = await bcrypt.hash(overrides.password || "password123", 10);
  return Personnel.create({
    nom: "Test",
    prenom: "Driver",
    email: overrides.email || "driver@bb.fr",
    role: overrides.role || "Chauffeur",
    actif: true,
    ...overrides,
    // Override doit venir APRÈS ...overrides pour neutraliser un éventuel
    // password fourni en clair dans les overrides — le hash est canonique.
    password: hash,
  });
}

async function seedPatient(overrides = {}) {
  const User = require("../../models/User");
  const hash = await bcrypt.hash(overrides.password || "password123", 10);
  return User.create({
    nom: "DOE",
    prenom: "Jane",
    email: overrides.email || "jane@bb.fr",
    role: "patient",
    actif: true,
    telephone: "0600000000",
    mobilite: "ASSIS",
    ...overrides,
    // Idem seedPersonnel : le hash override doit gagner sur tout password
    // que les overrides auraient pu fournir en clair.
    password: hash,
  });
}

// ── Personnel ────────────────────────────────────────────────────────────────
describe("personnel mobile refresh flow", () => {
  test("login renvoie token + refreshToken", async () => {
    await seedPersonnel();
    const res = await request(app)
      .post("/api/v1/personnel/auth/login")
      .send({ email: "driver@bb.fr", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.refreshToken.length).toBeGreaterThanOrEqual(40);
    expect(res.body.personnel).toBeDefined();
  });

  test("refresh émet un nouveau refresh et invalide l'ancien (rotation stricte)", async () => {
    await seedPersonnel();
    const login = await request(app)
      .post("/api/v1/personnel/auth/login")
      .send({ email: "driver@bb.fr", password: "password123" });
    const firstRefresh = login.body.refreshToken;

    const refresh1 = await request(app)
      .post("/api/v1/personnel/auth/refresh")
      .send({ refreshToken: firstRefresh });

    expect(refresh1.status).toBe(200);
    expect(refresh1.body.token).toBeDefined();
    expect(refresh1.body.refreshToken).toBeDefined();
    // Le refresh DOIT être rotaté. L'access peut être identique si la rotation
    // a lieu dans la même seconde (iat JWT = seconde), c'est OK — ce qui compte
    // c'est que le refresh tourne et que l'ancien soit révoqué.
    expect(refresh1.body.refreshToken).not.toBe(firstRefresh);

    // Tenter de réutiliser l'ancien refresh → 401
    const refresh2 = await request(app)
      .post("/api/v1/personnel/auth/refresh")
      .send({ refreshToken: firstRefresh });
    expect(refresh2.status).toBe(401);
  });

  test("refresh 400 si body sans refreshToken", async () => {
    const res = await request(app).post("/api/v1/personnel/auth/refresh").send({});
    expect(res.status).toBe(400);
  });

  test("refresh 401 si token inconnu", async () => {
    const res = await request(app)
      .post("/api/v1/personnel/auth/refresh")
      .send({ refreshToken: "x".repeat(80) });
    expect(res.status).toBe(401);
  });
});

// ── Patient ──────────────────────────────────────────────────────────────────
describe("patient mobile refresh flow", () => {
  test("login renvoie accessToken + refreshToken", async () => {
    await seedPatient();
    const res = await request(app)
      .post("/api/patient/login")
      .send({ email: "jane@bb.fr", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.patient).toBeDefined();
  });

  test("refresh patient : rotation + ancien invalide", async () => {
    await seedPatient();
    const login = await request(app)
      .post("/api/patient/login")
      .send({ email: "jane@bb.fr", password: "password123" });
    const firstRefresh = login.body.refreshToken;

    const refresh1 = await request(app)
      .post("/api/patient/refresh")
      .send({ refreshToken: firstRefresh });

    expect(refresh1.status).toBe(200);
    expect(refresh1.body.accessToken).toBeDefined();
    expect(refresh1.body.refreshToken).toBeDefined();
    expect(refresh1.body.refreshToken).not.toBe(firstRefresh);

    const refresh2 = await request(app)
      .post("/api/patient/refresh")
      .send({ refreshToken: firstRefresh });
    expect(refresh2.status).toBe(401);
  });

  test("audience cross-check : refresh personnel rejeté sur /api/patient/refresh", async () => {
    await seedPersonnel();
    const login = await request(app)
      .post("/api/v1/personnel/auth/login")
      .send({ email: "driver@bb.fr", password: "password123" });

    const res = await request(app)
      .post("/api/patient/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(401);
  });

  test("audience cross-check : refresh patient rejeté sur /personnel/auth/refresh", async () => {
    await seedPatient();
    const login = await request(app)
      .post("/api/patient/login")
      .send({ email: "jane@bb.fr", password: "password123" });

    const res = await request(app)
      .post("/api/v1/personnel/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(401);
  });
});
