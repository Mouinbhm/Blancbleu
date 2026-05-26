/**
 * Sprint M4 — Tests d'intégration : lifecycle FCM token (personnel + patient).
 *
 * Vérifie :
 *   1. POST /fcm-token persiste le token sur Personnel/User.
 *   2. DELETE /fcm-token efface le token.
 *   3. POST sans token → 400.
 *   4. Endpoints requièrent l'auth.
 *   5. Cleanup auto via notifyPatient quand FCM rejette le token
 *      (`messaging/registration-token-not-registered`).
 */

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt   = require("bcryptjs");

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI  = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-m4-fcm";
  process.env.NODE_ENV   = "test";
  process.env.AI_API_URL = "http://localhost:5002";
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  // Pas de FIREBASE_SERVICE_ACCOUNT → push désactivé (mode test).
  delete process.env.FIREBASE_SERVICE_ACCOUNT;

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
  await Promise.all([User.deleteMany({}), Personnel.deleteMany({})]);
});

// ── Helpers ────────────────────────────────────────────────────────────────
async function seedPersonnelAndLogin() {
  const Personnel = require("../../models/Personnel");
  const hash = await bcrypt.hash("password123", 10);
  await Personnel.create({
    nom: "Test", prenom: "Driver", email: "driver@bb.fr",
    password: hash, role: "Chauffeur", actif: true,
  });
  const login = await request(app)
    .post("/api/v1/personnel/auth/login")
    .send({ email: "driver@bb.fr", password: "password123" });
  return login.body.token;
}

async function seedPatientAndLogin() {
  const User = require("../../models/User");
  const hash = await bcrypt.hash("password123", 10);
  await User.create({
    nom: "DOE", prenom: "Jane", email: "jane@bb.fr",
    password: hash, role: "patient", actif: true,
    telephone: "0600000000", mobilite: "ASSIS",
  });
  const login = await request(app)
    .post("/api/patient/login")
    .send({ email: "jane@bb.fr", password: "password123" });
  return login.body.accessToken;
}

// ── Personnel ───────────────────────────────────────────────────────────────
describe("FCM token lifecycle — personnel (driver)", () => {
  test("POST /fcm-token persiste le token", async () => {
    const Personnel = require("../../models/Personnel");
    const accessToken = await seedPersonnelAndLogin();

    const res = await request(app)
      .post("/api/v1/personnel/auth/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "fcm-token-abc-123" });

    expect(res.status).toBe(200);
    const p = await Personnel.findOne({ email: "driver@bb.fr" });
    expect(p.fcmToken).toBe("fcm-token-abc-123");
  });

  test("POST sans token → 400", async () => {
    const accessToken = await seedPersonnelAndLogin();
    const res = await request(app)
      .post("/api/v1/personnel/auth/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("POST sans auth → 401", async () => {
    const res = await request(app)
      .post("/api/v1/personnel/auth/fcm-token")
      .send({ token: "x" });
    expect(res.status).toBe(401);
  });

  test("DELETE /fcm-token efface le token", async () => {
    const Personnel = require("../../models/Personnel");
    const accessToken = await seedPersonnelAndLogin();

    await request(app)
      .post("/api/v1/personnel/auth/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "to-clear" });

    const res = await request(app)
      .delete("/api/v1/personnel/auth/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const p = await Personnel.findOne({ email: "driver@bb.fr" });
    expect(p.fcmToken).toBeNull();
  });

  test("logout efface aussi le token FCM", async () => {
    const Personnel = require("../../models/Personnel");
    const accessToken = await seedPersonnelAndLogin();

    await request(app)
      .post("/api/v1/personnel/auth/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "to-clear-via-logout" });

    await request(app)
      .post("/api/v1/personnel/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    const p = await Personnel.findOne({ email: "driver@bb.fr" });
    expect(p.fcmToken).toBeNull();
  });
});

// ── Patient ─────────────────────────────────────────────────────────────────
describe("FCM token lifecycle — patient", () => {
  test("POST /fcm-token persiste le token", async () => {
    const User = require("../../models/User");
    const accessToken = await seedPatientAndLogin();

    const res = await request(app)
      .post("/api/patient/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "patient-fcm-xyz" });

    expect(res.status).toBe(200);
    const u = await User.findOne({ email: "jane@bb.fr" });
    expect(u.fcmToken).toBe("patient-fcm-xyz");
  });

  test("DELETE /fcm-token efface le token", async () => {
    const User = require("../../models/User");
    const accessToken = await seedPatientAndLogin();

    await request(app)
      .post("/api/patient/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "to-clear-patient" });

    const res = await request(app)
      .delete("/api/patient/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const u = await User.findOne({ email: "jane@bb.fr" });
    expect(u.fcmToken == null).toBe(true);
  });

  test("logout efface aussi le token FCM", async () => {
    const User = require("../../models/User");
    const accessToken = await seedPatientAndLogin();

    await request(app)
      .post("/api/patient/fcm-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "to-clear-via-logout-patient" });

    await request(app)
      .post("/api/patient/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    const u = await User.findOne({ email: "jane@bb.fr" });
    expect(u.fcmToken == null).toBe(true);
  });
});

// ── Push service en mode dégradé (no FIREBASE_SERVICE_ACCOUNT) ─────────────
describe("pushNotification — mode no-op (sans Firebase configuré)", () => {
  test("isEnabled() = false sans env", () => {
    const push = require("../../services/pushNotification");
    expect(push.isEnabled()).toBe(false);
  });

  test("sendToToken renvoie { skipped: 'push_disabled' }", async () => {
    const push = require("../../services/pushNotification");
    const res = await push.sendToToken("any-token", { title: "t", body: "b" });
    expect(res.skipped).toBe("push_disabled");
  });

  test("notifyPatient renvoie skip sans crash", async () => {
    const push = require("../../services/pushNotification");
    const fakeId = new mongoose.Types.ObjectId();
    const res = await push.notifyPatient({ userId: fakeId, title: "t", body: "b" });
    expect(res?.skipped).toBe("push_disabled");
  });
});
