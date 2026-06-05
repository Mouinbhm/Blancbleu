/**
 * BlancBleu — Tests intégration : IDOR accès transport patient (C1/C2/C3).
 *
 * Verrouille l'appartenance d'un Transport sur des identifiants immuables
 * (createdBy / patient.email) et jamais sur nom/prénom/téléphone (modifiables).
 *  C1 : un autre patient → 403 sur /:id et /:id/tracking.
 *  C2 : un attaquant qui aligne nom+prénom sur la victime → toujours 403.
 *  C3 : POST /sync-all réservé au staff (patient → 403, admin → 200).
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

let mongod;
let app;
let User;
let Transport;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-idor";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.AI_API_URL = "http://localhost:5002";

  await mongoose.connect(process.env.MONGO_URI);
  app = require("../../Server");
  User = require("../../models/User");
  Transport = require("../../models/Transport");
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Transport.deleteMany({})]);
});

function tokenFor(user) {
  return jwt.sign(
    { id: user._id.toString(), jti: crypto.randomBytes(8).toString("hex") },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function makeUser(overrides = {}) {
  return User.create({
    nom: overrides.nom || "Nom",
    prenom: overrides.prenom || "Prenom",
    email: overrides.email,
    password: "password123",
    role: overrides.role || "patient",
    actif: true,
    telephone: overrides.telephone || "",
  });
}

async function makeTransport(overrides = {}) {
  return Transport.create({
    numero: `TRS-IDOR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patient: {
      nom: overrides.patientNom || "Victime",
      prenom: overrides.patientPrenom || "Test",
      dateNaissance: new Date("1970-01-01"),
      mobilite: "ASSIS",
      email: overrides.patientEmail || "",
    },
    typeTransport: "VSL",
    motif: "Consultation",
    dateTransport: new Date(),
    heureRDV: "10:00",
    adresseDepart: {
      rue: "1 rue Test",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.71, lng: 7.26 },
    },
    adresseDestination: {
      rue: "2 av Test",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.72, lng: 7.27 },
    },
    statut: "REQUESTED",
    createdBy: overrides.createdBy,
  });
}

describe("IDOR — GET /api/patient/transports/:id (+ /tracking)", () => {
  test("Propriétaire via createdBy → 200 sur /:id ET /:id/tracking", async () => {
    const a = await makeUser({ email: "a@test.fr" });
    const t = await makeTransport({ createdBy: a._id });
    const token = tokenFor(a);

    const r1 = await request(app)
      .get(`/api/patient/transports/${t._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.transport).toBeTruthy();

    const r2 = await request(app)
      .get(`/api/patient/transports/${t._id}/tracking`)
      .set("Authorization", `Bearer ${token}`);
    expect(r2.status).toBe(200);
    expect(r2.body).toHaveProperty("statut");
  });

  test("Transport créé par un staff avec patient.email du patient connecté → 200", async () => {
    const a = await makeUser({ email: "a@test.fr" });
    const dispatcher = await makeUser({ email: "disp@test.fr", role: "dispatcher" });
    const t = await makeTransport({ createdBy: dispatcher._id, patientEmail: "a@test.fr" });
    const token = tokenFor(a);

    const r1 = await request(app)
      .get(`/api/patient/transports/${t._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .get(`/api/patient/transports/${t._id}/tracking`)
      .set("Authorization", `Bearer ${token}`);
    expect(r2.status).toBe(200);
  });

  test("C1 — un autre patient → 403 sur /:id ET /:id/tracking", async () => {
    const a = await makeUser({ email: "a@test.fr" });
    const b = await makeUser({ email: "b@test.fr" });
    const t = await makeTransport({ createdBy: a._id, patientEmail: "a@test.fr" });
    const tokenB = tokenFor(b);

    const r1 = await request(app)
      .get(`/api/patient/transports/${t._id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(r1.status).toBe(403);

    const r2 = await request(app)
      .get(`/api/patient/transports/${t._id}/tracking`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(r2.status).toBe(403);
  });

  test("C2 — attaquant alignant nom+prénom sur la victime → toujours 403", async () => {
    // L'attaquant porte les mêmes nom/prénom que ceux figés sur le transport,
    // mais n'est ni le créateur ni le patient (email) → accès refusé.
    const attaquant = await makeUser({ email: "attaquant@test.fr", nom: "DUPONT", prenom: "Jean" });
    const victime = await makeUser({ email: "victime@test.fr" });
    const t = await makeTransport({
      createdBy: victime._id,
      patientEmail: "victime@test.fr",
      patientNom: "DUPONT",
      patientPrenom: "Jean",
    });
    const token = tokenFor(attaquant);

    const r1 = await request(app)
      .get(`/api/patient/transports/${t._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(r1.status).toBe(403);

    const r2 = await request(app)
      .get(`/api/patient/transports/${t._id}/tracking`)
      .set("Authorization", `Bearer ${token}`);
    expect(r2.status).toBe(403);
  });

  test("404 (transport inexistant) renvoyé avant 403", async () => {
    const a = await makeUser({ email: "a@test.fr" });
    const r = await request(app)
      .get(`/api/patient/transports/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${tokenFor(a)}`);
    expect(r.status).toBe(404);
  });
});

describe("C3 — POST /api/patient/sync-all (réservé staff)", () => {
  test("rôle patient → 403", async () => {
    const a = await makeUser({ email: "a@test.fr", role: "patient" });
    const r = await request(app)
      .post("/api/patient/sync-all")
      .set("Authorization", `Bearer ${tokenFor(a)}`);
    expect(r.status).toBe(403);
  });

  test("rôle admin → 200", async () => {
    const admin = await makeUser({ email: "admin@test.fr", role: "admin" });
    const r = await request(app)
      .post("/api/patient/sync-all")
      .set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("message");
  });
});
