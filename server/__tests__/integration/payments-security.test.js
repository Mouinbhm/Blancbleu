/**
 * BlancBleu — Tests sécurité paiement Stripe (régression).
 *
 * Couvre trois failles corrigées :
 *  C2  Webhook fail-closed — un body forgé (signature absente/invalide) est
 *      refusé (400) et NE marque PAS la facture payée ; un event correctement
 *      signé (stripe.webhooks.generateTestHeaderString) est traité. Sans
 *      STRIPE_WEBHOOK_SECRET, le webhook est refusé (jamais de parse non signé).
 *  C1  Route staff /stripe/create-payment-intent — un rôle non facturation
 *      (dispatcher) reçoit 403 ; un rôle facturation (comptable) reçoit 200.
 *  OWN Route patient /factures/:id/paiement-intent — un patient ne peut PAS
 *      créer de PaymentIntent sur la facture d'un autre patient (404). Verrou
 *      d'ownership conservé après le refactor vers stripePaymentService.
 *
 * Les appels réseau Stripe sont mockés (createPaymentIntent / markInvoicePaid).
 * La vérification de signature webhook utilise la vraie lib stripe (crypto pur,
 * pas de réseau).
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const WEBHOOK_SECRET = "whsec_test_blancbleu_payments_security";

let mongod;
let app;
let User;
let Facture;
let Patient;
let stripePaymentService;
let invoiceService;
let stripeLib;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-payments-security";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_payments_security";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.AI_API_URL = "http://localhost:5002";

  await mongoose.connect(process.env.MONGO_URI);

  app = require("../../Server");
  User = require("../../models/User");
  Facture = require("../../models/Facture");
  Patient = require("../../models/Patient");
  stripePaymentService = require("../../services/stripePaymentService");
  invoiceService = require("../../services/invoiceService");
  stripeLib = require("stripe")("sk_test_dummy_payments_security");
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(() => {
  jest.restoreAllMocks();
  // Toujours restaurer le secret (un test le supprime volontairement)
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Facture.deleteMany({}), Patient.deleteMany({})]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenFor(user) {
  return jwt.sign(
    { id: user._id.toString(), jti: crypto.randomBytes(8).toString("hex") },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function makeUser(role, email) {
  return User.create({
    nom: "Test",
    prenom: "User",
    email,
    password: "password123",
    role,
    actif: true,
  });
}

// Crée un patient mobile (User role=patient) + son dossier Patient lié + une
// facture rattachée à ce dossier. Retourne { user, token, facture }.
async function makePatientWithFacture(email) {
  const user = await makeUser("patient", email);
  const patientDoc = await Patient.create({
    nom: "Dupont",
    prenom: "Jean",
    email,
    userId: user._id,
  });
  const facture = await Facture.create({
    transportId: new mongoose.Types.ObjectId(),
    patientId: patientDoc._id,
    patientNom: "Dupont",
    statut: "emise",
    paymentStatus: "UNPAID",
    montantBase: 100,
    tauxPriseEnCharge: 65,
  });
  return { user, token: tokenFor(user), facture };
}

function buildSucceededEventPayload(factureId) {
  return JSON.stringify({
    id: "evt_test_succeeded",
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_123",
        object: "payment_intent",
        status: "succeeded",
        created: Math.floor(Date.now() / 1000),
        metadata: { factureId },
      },
    },
  });
}

// ── C2 — Webhook fail-closed ────────────────────────────────────────────────

describe("C2 — Webhook Stripe (fail-closed + signature)", () => {
  test("Body forgé sans signature valide → 400, markInvoicePaid NON appelé", async () => {
    const spy = jest.spyOn(invoiceService, "markInvoicePaid").mockResolvedValue({});
    const payload = buildSucceededEventPayload(new mongoose.Types.ObjectId().toString());

    const res = await request(app)
      .post("/api/payments/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=forged_signature_deadbeef")
      .send(payload);

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  test("Event correctement signé → 200, markInvoicePaid appelé avec le factureId", async () => {
    const spy = jest.spyOn(invoiceService, "markInvoicePaid").mockResolvedValue({});
    const factureId = new mongoose.Types.ObjectId().toString();
    const payload = buildSucceededEventPayload(factureId);
    const header = stripeLib.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

    const res = await request(app)
      .post("/api/payments/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(factureId);
  });

  test("STRIPE_WEBHOOK_SECRET absent → webhook refusé (400), markInvoicePaid NON appelé", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const spy = jest.spyOn(invoiceService, "markInvoicePaid").mockResolvedValue({});
    const payload = buildSucceededEventPayload(new mongoose.Types.ObjectId().toString());

    const res = await request(app)
      .post("/api/payments/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=whatever")
      .send(payload);

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── C1 — RBAC route staff ───────────────────────────────────────────────────

describe("C1 — Route staff /stripe/create-payment-intent (RBAC)", () => {
  test("Rôle non facturation (dispatcher) → 403, createPaymentIntent NON appelé", async () => {
    const spy = jest.spyOn(stripePaymentService, "createPaymentIntent");
    const dispatcher = await makeUser("dispatcher", "disp@test.fr");
    const { facture } = await makePatientWithFacture("patient-c1@test.fr");

    const res = await request(app)
      .post("/api/payments/stripe/create-payment-intent")
      .set("Authorization", `Bearer ${tokenFor(dispatcher)}`)
      .send({ invoiceId: facture._id.toString() });

    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  test("Rôle facturation (comptable) → 200 + clientSecret", async () => {
    const spy = jest.spyOn(stripePaymentService, "createPaymentIntent").mockResolvedValue({
      clientSecret: "cs_test_123",
      paymentIntentId: "pi_test_123",
      amount: 35,
      currency: "EUR",
    });
    const comptable = await makeUser("comptable", "compta@test.fr");
    const { facture } = await makePatientWithFacture("patient-c1b@test.fr");

    const res = await request(app)
      .post("/api/payments/stripe/create-payment-intent")
      .set("Authorization", `Bearer ${tokenFor(comptable)}`)
      .send({ invoiceId: facture._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ clientSecret: "cs_test_123", paymentIntentId: "pi_test_123" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── OWN — Ownership route patient ───────────────────────────────────────────

describe("OWN — Route patient /factures/:id/paiement-intent (ownership)", () => {
  test("Patient A demandant la facture du patient B → 404, createPaymentIntent NON appelé", async () => {
    const spy = jest.spyOn(stripePaymentService, "createPaymentIntent").mockResolvedValue({
      clientSecret: "cs_should_not_be_used",
      paymentIntentId: "pi_should_not_be_used",
      amount: 35,
      currency: "EUR",
    });

    const patientA = await makePatientWithFacture("patientA@test.fr");
    const patientB = await makePatientWithFacture("patientB@test.fr");

    // A tente de créer un PaymentIntent sur la facture de B
    const res = await request(app)
      .post(`/api/patient/factures/${patientB.facture._id.toString()}/paiement-intent`)
      .set("Authorization", `Bearer ${patientA.token}`)
      .send({});

    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  test("Patient sur sa propre facture → 200 + clientSecret", async () => {
    const spy = jest.spyOn(stripePaymentService, "createPaymentIntent").mockResolvedValue({
      clientSecret: "cs_test_own",
      paymentIntentId: "pi_test_own",
      amount: 35,
      currency: "EUR",
    });

    const patientA = await makePatientWithFacture("patientA-own@test.fr");

    const res = await request(app)
      .post(`/api/patient/factures/${patientA.facture._id.toString()}/paiement-intent`)
      .set("Authorization", `Bearer ${patientA.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ clientSecret: "cs_test_own", paymentIntentId: "pi_test_own" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
