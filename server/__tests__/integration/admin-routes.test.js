/**
 * BlancBleu — Tests Intégration : routes /api/admin/* protégées.
 *
 * Régression : POST /api/admin/migrate-statuts était exposé sans aucune
 * protection — n'importe qui sur le LAN dev/staging pouvait déclencher la
 * migration de statuts (mass-update de vehicles + transports). Désormais
 * sous `protect` + `authorize("admin")`.
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET = "test-secret-blancbleu-jest";
  process.env.NODE_ENV = "test";
  process.env.AI_API_URL = "http://localhost:5002";

  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

function getApp() {
  return require("../../Server");
}

async function creerUtilisateur(overrides = {}) {
  const User = require("../../models/User");
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(overrides.password || "password123", salt);
  return User.create({
    nom: overrides.nom || "Test",
    prenom: overrides.prenom || "User",
    email: overrides.email || "test@blancbleu.fr",
    password: hashed,
    role: overrides.role || "dispatcher",
    actif: overrides.actif !== undefined ? overrides.actif : true,
  });
}

async function loginAs(app, email, password) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body?.token || null;
}

beforeEach(async () => {
  const User = require("../../models/User");
  await User.deleteMany({});
});

describe("POST /api/admin/migrate-statuts — protection admin", () => {
  test("401 sans token (no auth)", async () => {
    const app = getApp();
    const res = await request(app).post("/api/admin/migrate-statuts");
    expect(res.status).toBe(401);
  });

  test("403 avec un user role='dispatcher'", async () => {
    const app = getApp();
    await creerUtilisateur({
      email: "disp@test.fr",
      password: "pass1234",
      role: "dispatcher",
    });
    const token = await loginAs(app, "disp@test.fr", "pass1234");
    expect(token).toBeTruthy();

    const res = await request(app)
      .post("/api/admin/migrate-statuts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test("200 avec un user role='admin' (migration s'execute)", async () => {
    const app = getApp();
    await creerUtilisateur({
      email: "admin@test.fr",
      password: "admin1234",
      role: "admin",
    });
    const token = await loginAs(app, "admin@test.fr", "admin1234");
    expect(token).toBeTruthy();

    const res = await request(app)
      .post("/api/admin/migrate-statuts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
  });
});
