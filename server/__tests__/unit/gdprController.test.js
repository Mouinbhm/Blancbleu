/**
 * BlancBleu — Tests GDPR Controller
 * Couvre exportData (GET /api/gdpr/export) et eraseData (DELETE /api/gdpr/me)
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

let mongod;

const JWT_SECRET = "test-secret-blancbleu-jest";

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI = uri;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.NODE_ENV = "test";
  process.env.AI_API_URL = "http://localhost:5002";

  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  const User = require("../../models/User");
  const Patient = require("../../models/Patient");
  const RefreshToken = require("../../models/RefreshToken");
  await User.deleteMany({});
  await Patient.deleteMany({});
  await RefreshToken.deleteMany({});
});

function getApp() {
  return require("../../Server");
}

function makeToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });
}

async function createUser(overrides = {}) {
  const User = require("../../models/User");
  const hash = await bcrypt.hash(overrides.password || "Password123!", 10);
  return User.create({
    nom: overrides.nom || "Dupont",
    prenom: overrides.prenom || "Jean",
    email: overrides.email || "jean.dupont@test.fr",
    password: hash,
    role: overrides.role || "dispatcher",
    actif: true,
  });
}

async function createPatient(email) {
  const Patient = require("../../models/Patient");
  return Patient.create({
    nom: "Dupont",
    prenom: "Jean",
    email,
    telephone: "0600000000",
    mobilite: "ASSIS",
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/gdpr/export
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/gdpr/export", () => {
  test("401 — sans token", async () => {
    const app = getApp();
    const res = await request(app).get("/api/gdpr/export");
    expect(res.status).toBe(401);
  });

  test("200 — export compte non-patient", async () => {
    const user = await createUser({ role: "dispatcher" });
    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .get("/api/gdpr/export")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("exportedAt");
    expect(res.body).toHaveProperty("compte");
    expect(res.body.compte.email).toBe(user.email);
    expect(res.body).not.toHaveProperty("dossierMedical");
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
  });

  test("200 — export compte patient avec dossier médical", async () => {
    const email = "patient.gdpr@test.fr";
    const user = await createUser({ role: "patient", email });
    await createPatient(email);
    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .get("/api/gdpr/export")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dossierMedical");
    expect(res.body).toHaveProperty("transports");
    expect(res.body).toHaveProperty("prescriptions");
    expect(res.body).toHaveProperty("factures");
    expect(Array.isArray(res.body.transports)).toBe(true);
  });

  test("200 — patient sans dossier Patient (compte seul)", async () => {
    const user = await createUser({ role: "patient", email: "patient.nodossier@test.fr" });
    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .get("/api/gdpr/export")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("compte");
    expect(res.body).not.toHaveProperty("dossierMedical");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/gdpr/me
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/gdpr/me", () => {
  test("401 — sans token", async () => {
    const app = getApp();
    const res = await request(app)
      .delete("/api/gdpr/me")
      .send({ password: "Password123!" });
    expect(res.status).toBe(401);
  });

  test("400 — mot de passe absent", async () => {
    const user = await createUser();
    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .delete("/api/gdpr/me")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mot de passe/i);
  });

  test("401 — mauvais mot de passe", async () => {
    const user = await createUser({ password: "Password123!" });
    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .delete("/api/gdpr/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "WrongPassword!" });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/incorrect/i);
  });

  test("200 — anonymise le compte dispatcher", async () => {
    const user = await createUser({ password: "Password123!" });
    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .delete("/api/gdpr/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/RGPD/i);

    const User = require("../../models/User");
    const updated = await User.findById(user._id);
    expect(updated.nom).toBe("[SUPPRIMÉ]");
    expect(updated.prenom).toBe("[SUPPRIMÉ]");
    expect(updated.email).toMatch(/^supprime-.*@anonymise\.local$/);
    expect(updated.actif).toBe(false);
  });

  test("200 — anonymise le dossier patient et ses transports/factures", async () => {
    const email = "patient.erase@test.fr";
    const user = await createUser({ role: "patient", email, password: "Password123!" });
    const patient = await createPatient(email);

    const Transport = require("../../models/Transport");
    const Facture = require("../../models/Facture");

    const transport = await Transport.create({
      patientId: patient._id,
      patient: { nom: "Dupont", prenom: "Jean", telephone: "0600000000", email },
      adresseDepart: { rue: "1 Rue A", ville: "Nice", codePostal: "06000" },
      adresseDestination: { rue: "2 Rue B", ville: "Nice", codePostal: "06000" },
      typeTransport: "VSL",
      motif: "Consultation",
      statut: "REQUESTED",
      dateTransport: new Date(),
      heureRDV: "09:00",
    });

    await Facture.create({
      patientId: patient._id,
      transportId: transport._id,
      patientNom: "Dupont",
      patientPrenom: "Jean",
      patientNumeroSecu: "123456789",
      montantTotal: 50,
      statut: "en_attente",
    });

    const token = makeToken(user._id);
    const app = getApp();

    const res = await request(app)
      .delete("/api/gdpr/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "Password123!" });

    expect(res.status).toBe(200);

    const Patient = require("../../models/Patient");
    const updatedPatient = await Patient.findById(patient._id);
    expect(updatedPatient.nom).toBe("[SUPPRIMÉ]");
    expect(updatedPatient.email).toMatch(/@anonymise\.local$/);
    expect(updatedPatient.actif).toBe(false);

    const transports = await Transport.find({ patientId: patient._id });
    expect(transports[0].patient.nom).toBe("[SUPPRIMÉ]");
    expect(transports[0].patient.telephone).toBe("");

    const factures = await Facture.find({ patientId: patient._id });
    expect(factures[0].patientNom).toBe("[SUPPRIMÉ]");
    expect(factures[0].patientNumeroSecu).toBe("");
  });
});
