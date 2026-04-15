/**
 * BlancBleu — Tests Intégration Auth Routes
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

let mongod;

// ─── Setup global ─────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Démarrer MongoDB in-memory
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // 2. Configurer les variables d'environnement AVANT tout require
  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET = "test-secret-blancbleu-jest";
  process.env.NODE_ENV = "test";
  process.env.AI_API_URL = "http://localhost:5001";

  // 3. Se connecter directement — on contrôle la connexion
  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getApp() {
  // Vider le cache pour que Server.js recharge avec les bons env vars
  // mais la connexion mongoose est déjà établie — Server.js ne se reconnecte pas
  return require("../../Server");
}

async function creerUtilisateur(overrides = {}) {
  const User = require("../../models/User");
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(overrides.password || "password123", salt);
  return User.create({
    nom: "Test",
    prenom: "User",
    email: overrides.email || "test@blancbleu.fr",
    password: hashed,
    role: overrides.role || "dispatcher",
    actif: overrides.actif !== undefined ? overrides.actif : true,
  });
}

async function loginAs(app, email, password) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  return res.body.token;
}

beforeEach(async () => {
  const User = require("../../models/User");
  await User.deleteMany({});
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Login
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/login", () => {
  test("200 avec token si credentials corrects", async () => {
    const app = getApp();
    await creerUtilisateur({ email: "disp@test.fr", password: "pass1234" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "disp@test.fr", password: "pass1234" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe("disp@test.fr");
    expect(res.body.user).not.toHaveProperty("password");
  });

  test("401 si mot de passe incorrect", async () => {
    const app = getApp();
    await creerUtilisateur({ email: "disp@test.fr", password: "pass1234" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "disp@test.fr", password: "mauvais" });

    expect(res.status).toBe(401);
  });

  test("401 si email inconnu", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inconnu@test.fr", password: "pass1234" });

    expect(res.status).toBe(401);
  });

  test("403 si compte désactivé", async () => {
    const app = getApp();
    await creerUtilisateur({
      email: "inactif@test.fr",
      password: "pass1234",
      actif: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inactif@test.fr", password: "pass1234" });

    expect(res.status).toBe(403);
  });

  test("400 si champs manquants", async () => {
    const app = getApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.fr" });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Register (admin only)
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/register", () => {
  test("401 sans token (register est protégé)", async () => {
    const app = getApp();
    const res = await request(app).post("/api/auth/register").send({
      nom: "Nouveau",
      prenom: "User",
      email: "nouveau@test.fr",
      password: "pass12345",
      role: "dispatcher",
    });

    expect(res.status).toBe(401);
  });

  test("403 si token non-admin", async () => {
    const app = getApp();
    await creerUtilisateur({
      email: "disp@test.fr",
      password: "pass1234",
      role: "dispatcher",
    });
    const token = await loginAs(app, "disp@test.fr", "pass1234");

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nom: "Nouveau",
        prenom: "User",
        email: "nouveau@test.fr",
        password: "pass12345",
        role: "dispatcher",
      });

    expect(res.status).toBe(403);
  });

  test("201 si admin crée un compte", async () => {
    const app = getApp();
    await creerUtilisateur({
      email: "admin@test.fr",
      password: "admin1234",
      role: "admin",
    });
    const token = await loginAs(app, "admin@test.fr", "admin1234");

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nom: "Nouveau",
        prenom: "Dispatcher",
        email: "nouveau@test.fr",
        password: "pass12345",
        role: "dispatcher",
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("nouveau@test.fr");
    expect(res.body.user).not.toHaveProperty("password");
  });

  test("409 si email déjà utilisé", async () => {
    const app = getApp();
    await creerUtilisateur({
      email: "admin@test.fr",
      password: "admin1234",
      role: "admin",
    });
    await creerUtilisateur({ email: "existant@test.fr", password: "pass1234" });
    const token = await loginAs(app, "admin@test.fr", "admin1234");

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nom: "Test",
        prenom: "Doublon",
        email: "existant@test.fr",
        password: "pass12345",
        role: "dispatcher",
      });

    expect(res.status).toBe(409);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — GET /me
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/auth/me", () => {
  test("200 retourne le profil avec token valide", async () => {
    const app = getApp();
    await creerUtilisateur({ email: "disp@test.fr", password: "pass1234" });
    const token = await loginAs(app, "disp@test.fr", "pass1234");

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("disp@test.fr");
  });

  test("401 sans token", async () => {
    const app = getApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("401 avec token invalide", async () => {
    const app = getApp();
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer token.invalide.ici");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — Health check
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/health", () => {
  test("200 retourne statut healthy ou degraded (IA optionnelle en test)", async () => {
    const app = getApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(["healthy", "degraded"]).toContain(res.body.status);
    expect(res.body.services.mongodb.status).toBe("healthy");
  });
});
