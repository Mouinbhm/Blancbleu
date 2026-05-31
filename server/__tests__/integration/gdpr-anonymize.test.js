/**
 * BlancBleu — Tests intégration : anonymisation patient RGPD Art. 17.
 *
 * Couvre POST /api/gdpr/patients/:id/anonymize :
 *  - 401 sans auth
 *  - 403 si rôle non admin/dpo (dispatcher, comptable...)
 *  - 400 si confirmReason manquant ou trop court
 *  - 409 si transports actifs (statut hors COMPLETED/BILLED/PAID/CANCELLED)
 *  - 409 si patient déjà anonymisé
 *  - 200 admin : patient PII purgé + Transport.patient nettoyé +
 *    Facture dénormalisée nettoyée + AuditLog PATIENT_ANONYMIZED créé
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-gdpr-anonymize";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, "bb-gdpr-anonymize-test-key-pad!").toString(
    "base64",
  );
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

function getApp() {
  return require("../../Server");
}

async function creerUser(overrides = {}) {
  const User = require("../../models/User");
  const hash = await bcrypt.hash(overrides.password || "admin1234", 10);
  return User.create({
    nom: "Test",
    prenom: "User",
    email: overrides.email || "admin@blancbleu.fr",
    password: hash,
    role: overrides.role || "admin",
    actif: true,
  });
}

async function loginAs(app, email, password) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.body?.token || null;
}

async function creerPatient(overrides = {}) {
  const Patient = require("../../models/Patient");
  return Patient.create({
    nom: "Dupont",
    prenom: "Jean",
    email: "jean.dupont@example.com",
    telephone: "0612345678",
    dateNaissance: new Date("1960-01-01"),
    numeroSecu: "1600101123456",
    antecedents: "Diabète type 2",
    allergies: "Pénicilline",
    adresse: { rue: "1 rue Test", ville: "Nice", codePostal: "06000" },
    contactUrgence: { nom: "Marie Dupont", telephone: "0623456789", lien: "Conjointe" },
    ...overrides,
  });
}

async function creerTransport(patientId, statut = "COMPLETED") {
  const Transport = require("../../models/Transport");
  return Transport.create({
    numero: `TRS-TEST-${statut}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patientId,
    patient: {
      nom: "Dupont",
      prenom: "Jean",
      telephone: "0612345678",
      mobilite: "ASSIS",
      antecedents: "Diabète type 2",
      allergies: "Pénicilline",
    },
    typeTransport: "VSL",
    motif: "Dialyse",
    dateTransport: new Date(),
    heureRDV: "10:00",
    adresseDepart: { nom: "Domicile", rue: "1 rue Test", ville: "Nice", codePostal: "06000" },
    adresseDestination: { nom: "Centre", rue: "2 av Test", ville: "Nice", codePostal: "06000" },
    statut,
  });
}

async function creerFacture(patientId, transportId) {
  const Facture = require("../../models/Facture");
  return Facture.create({
    numero: `FAC-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patientId,
    transportId,
    patientNom: "Dupont",
    patientPrenom: "Jean",
    patientNumeroSecu: "1600101123456",
    montantBase: 100,
    montantTotal: 100,
    statut: "emise",
    dateEmission: new Date(),
  });
}

beforeEach(async () => {
  const User = require("../../models/User");
  const Patient = require("../../models/Patient");
  const Transport = require("../../models/Transport");
  const Facture = require("../../models/Facture");
  const AuditLog = require("../../models/AuditLog");
  await User.deleteMany({});
  await Patient.deleteMany({});
  await Transport.deleteMany({});
  await Facture.deleteMany({});
  await AuditLog.deleteMany({});
});

describe("POST /api/gdpr/patients/:id/anonymize", () => {
  test("401 sans auth", async () => {
    const app = getApp();
    const patient = await creerPatient();
    const res = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .send({ confirmReason: "Demande du patient datée du 2026-05-29" });
    expect(res.status).toBe(401);
  });

  test("403 si rôle dispatcher (non admin/dpo)", async () => {
    const app = getApp();
    await creerUser({ email: "disp@bb.fr", password: "pass1234", role: "dispatcher" });
    const token = await loginAs(app, "disp@bb.fr", "pass1234");
    const patient = await creerPatient();

    const res = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmReason: "Demande du patient datée du 2026-05-29" });

    expect(res.status).toBe(403);
  });

  test("400 si confirmReason manquant", async () => {
    const app = getApp();
    await creerUser();
    const token = await loginAs(app, "admin@blancbleu.fr", "admin1234");
    const patient = await creerPatient();

    const res = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CONFIRM_REASON_REQUIRED");
  });

  test("400 si confirmReason trop court (< 10 chars)", async () => {
    const app = getApp();
    await creerUser();
    const token = await loginAs(app, "admin@blancbleu.fr", "admin1234");
    const patient = await creerPatient();

    const res = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmReason: "court" });

    expect(res.status).toBe(400);
  });

  test("409 si transport actif (statut SCHEDULED)", async () => {
    const app = getApp();
    await creerUser();
    const token = await loginAs(app, "admin@blancbleu.fr", "admin1234");
    const patient = await creerPatient();
    await creerTransport(patient._id, "SCHEDULED");

    const res = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmReason: "Demande explicite du patient 2026-05-29" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACTIVE_TRANSPORTS");
    expect(res.body.message).toMatch(/transport.* actif/i);

    // Le patient ne doit PAS avoir été modifié.
    const Patient = require("../../models/Patient");
    const fresh = await Patient.findById(patient._id).select("+antecedents +allergies");
    expect(fresh.nom).toBe("Dupont");
    expect(fresh.gdpr?.anonymized).not.toBe(true);
  });

  test("200 admin : patient + sub-docs Transport + Facture nettoyés + audit log", async () => {
    const app = getApp();
    const admin = await creerUser();
    const token = await loginAs(app, "admin@blancbleu.fr", "admin1234");
    const patient = await creerPatient();
    const transport = await creerTransport(patient._id, "COMPLETED");
    const facture = await creerFacture(patient._id, transport._id);

    const res = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmReason: "Demande RGPD écrite du patient 2026-05-29" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.numeroPatient).toBe(patient.numeroPatient);

    // ── Patient lui-même : PII purgée
    const Patient = require("../../models/Patient");
    const after = await Patient.findById(patient._id).select(
      "+antecedents +allergies +numeroSecuHash",
    );
    expect(after.nom).toBe("[ANONYMISÉ]");
    expect(after.prenom).toBe("[ANONYMISÉ]");
    expect(after.email).toMatch(/^anon-.+@anonymise\.local$/);
    expect(after.telephone).toBe("0000000000");
    expect(after.dateNaissance).toBeNull();
    expect(after.numeroSecu).toBe("");
    expect(after.numeroSecuHash).toBeNull();
    expect(after.antecedents).toBe("");
    expect(after.allergies).toBe("");
    expect(after.adresse.rue).toBe("");
    expect(after.contactUrgence.nom).toBe("");
    expect(after.actif).toBe(false);
    expect(after.gdpr.anonymized).toBe(true);
    expect(after.gdpr.anonymizedAt).toBeInstanceOf(Date);
    expect(String(after.gdpr.anonymizedBy)).toBe(String(admin._id));
    expect(after.gdpr.anonymizationReason).toMatch(/Demande RGPD/);

    // Le numero patient est CONSERVÉ (clé de jointure)
    expect(after.numeroPatient).toBe(patient.numeroPatient);

    // ── Sub-doc Transport.patient : PII purgée mais transport conservé
    const Transport = require("../../models/Transport");
    const transportAfter = await Transport.findById(transport._id).select(
      "+patient.antecedents +patient.allergies",
    );
    expect(transportAfter).not.toBeNull(); // conservé (obligation légale)
    expect(transportAfter.numero).toBe(transport.numero);
    expect(transportAfter.patient.nom).toBe("[ANONYMISÉ]");
    expect(transportAfter.patient.prenom).toBe("[ANONYMISÉ]");
    expect(transportAfter.patient.telephone).toBe("0000000000");
    expect(transportAfter.patient.antecedents).toBe("");
    expect(transportAfter.patient.allergies).toBe("");

    // ── Facture : numero/montant conservés, PII purgée
    const Facture = require("../../models/Facture");
    const factureAfter = await Facture.findById(facture._id);
    expect(factureAfter).not.toBeNull();
    expect(factureAfter.numero).toBe(facture.numero);
    expect(factureAfter.montantTotal).toBe(100);
    expect(factureAfter.patientNom).toBe("[ANONYMISÉ]");
    expect(factureAfter.patientPrenom).toBe("[ANONYMISÉ]");
    expect(factureAfter.patientNumeroSecu).toBe("");

    // ── AuditLog créé
    const AuditLog = require("../../models/AuditLog");
    const log = await AuditLog.findOne({ action: "PATIENT_ANONYMIZED" });
    expect(log).not.toBeNull();
    expect(String(log.ressource.id)).toBe(String(patient._id));
    expect(log.details.message).toMatch(/anonymisé/i);
  });

  test("409 si déjà anonymisé (idempotence stricte — refuser double appel)", async () => {
    const app = getApp();
    await creerUser();
    const token = await loginAs(app, "admin@blancbleu.fr", "admin1234");
    const patient = await creerPatient();

    // 1er appel : OK
    const r1 = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmReason: "Première anonymisation patient 2026-05-29" });
    expect(r1.status).toBe(200);

    // 2e appel : 409
    const r2 = await request(app)
      .post(`/api/gdpr/patients/${patient._id}/anonymize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmReason: "Deuxième tentative inutile 2026-05-29" });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe("ALREADY_ANONYMIZED");
  });
});
