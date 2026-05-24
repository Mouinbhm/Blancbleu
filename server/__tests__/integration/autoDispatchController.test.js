/**
 * Tests d'intégration : controller queue auto-dispatch (accept / reject / queue).
 *
 * Test direct du controller avec req/res mockés + MongoMemoryServer (vrai
 * stockage). transportLifecycle.assignerVehicule est mocké pour ne pas
 * exécuter la transition complète.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

jest.mock("../../services/transportLifecycle", () => ({
  assignerVehicule: jest.fn(),
}));
jest.mock("../../services/socketService", () => ({
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

process.env.NODE_ENV = "test";

const ctrl                 = require("../../controllers/autoDispatchController");
const lifecycle            = require("../../services/transportLifecycle");
const Transport            = require("../../models/Transport");
const Vehicle              = require("../../models/Vehicle");
const DispatchRecommendation = require("../../models/DispatchRecommendation");
const AuditLog             = require("../../models/AuditLog");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  await Promise.all([
    Transport.deleteMany({}),
    Vehicle.deleteMany({}),
    DispatchRecommendation.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  jest.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b)   { this.body = b; return this; },
  };
}

const userCtx = { _id: new mongoose.Types.ObjectId(), email: "dispatcher@bb.fr", role: "dispatcher" };

async function seedTransport(overrides = {}) {
  return Transport.create({
    numero: "TRS-T-001",
    statut: "SCHEDULED",
    typeTransport: "VSL",
    motif: "Dialyse",
    dateTransport: new Date(Date.now() + 2 * 60 * 60 * 1000),
    heureRDV: "10:00",
    patient: { nom: "X", prenom: "Y", mobilite: "ASSIS", telephone: "0600000000" },
    adresseDepart: { rue: "1", ville: "Nice", codePostal: "06000" },
    adresseDestination: { rue: "H", ville: "Nice", codePostal: "06000" },
    ...overrides,
  });
}

async function seedRec(transportId, overrides = {}) {
  return DispatchRecommendation.create({
    transportId,
    source: "ia",
    bestRecommendation: {
      vehiculeId: new mongoose.Types.ObjectId(),
      score: 92,
      criteriaScores: { vehicleTypeMatch: 100 },
      explanation: ["Véhicule à 1.5 km", "Chauffeur disponible"],
      risks: [],
    },
    decision: { status: "pending" },
    ...overrides,
  });
}

// ── getQueue ────────────────────────────────────────────────────────────────
describe("autoDispatchController.getQueue", () => {
  test("retourne uniquement les recos pending avec transport peuplé", async () => {
    const t1 = await seedTransport();
    const t2 = await seedTransport({ numero: "TRS-T-002" });
    await seedRec(t1._id);
    await seedRec(t2._id);
    // Une reco accepted ne doit pas apparaître
    await seedRec(t1._id, { decision: { status: "accepted" } });

    const res = mockRes();
    await ctrl.getQueue({ query: {}, user: userCtx }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.proposals[0].transport.numero).toMatch(/^TRS-T-/);
    expect(res.body.proposals[0].best.score).toBe(92);
  });

  test("filtre les recos dont le transport a été supprimé", async () => {
    const t = await seedTransport();
    await seedRec(t._id);
    await Transport.deleteOne({ _id: t._id });

    const res = mockRes();
    await ctrl.getQueue({ query: {}, user: userCtx }, res);

    expect(res.body.count).toBe(0);
  });
});

// ── getQueueCount ───────────────────────────────────────────────────────────
describe("autoDispatchController.getQueueCount", () => {
  test("retourne le count des pending", async () => {
    const t = await seedTransport();
    await seedRec(t._id);
    await seedRec(t._id);
    await seedRec(t._id, { decision: { status: "rejected" } });

    const res = mockRes();
    await ctrl.getQueueCount({}, res);
    expect(res.body.count).toBe(2);
  });
});

// ── accept ──────────────────────────────────────────────────────────────────
describe("autoDispatchController.accept", () => {
  test("accepte une reco pending → appelle assignerVehicule + reco accepted + audit AUTO_DISPATCH_PROPOSAL", async () => {
    const t = await seedTransport();
    const rec = await seedRec(t._id);
    const best = rec.bestRecommendation;

    lifecycle.assignerVehicule.mockResolvedValue({
      transport: { _id: t._id, numero: t.numero, statut: "ASSIGNED" },
      justification: [],
    });

    const res = mockRes();
    await ctrl.accept({ params: { recId: String(rec._id) }, user: userCtx }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(lifecycle.assignerVehicule).toHaveBeenCalledTimes(1);

    // assignerVehicule a reçu le vehiculeId du best + l'utilisateur réel
    const [, args, user] = lifecycle.assignerVehicule.mock.calls[0];
    expect(String(args.vehiculeId)).toBe(String(best.vehiculeId));
    expect(user.email).toBe(userCtx.email);
    expect(user.role).toBe("dispatcher");

    // Reco accepted + decidedBy
    const updatedRec = await DispatchRecommendation.findById(rec._id);
    expect(updatedRec.decision.status).toBe("accepted");
    expect(String(updatedRec.decision.decidedBy)).toBe(String(userCtx._id));

    // Audit AUTO_DISPATCH_PROPOSAL présent
    const audits = await AuditLog.find({ action: "AUTO_DISPATCH_PROPOSAL" });
    expect(audits).toHaveLength(1);
    expect(audits[0].origine).toBe("HUMAIN");
  });

  test("409 si reco déjà décidée", async () => {
    const t = await seedTransport();
    const rec = await seedRec(t._id, { decision: { status: "accepted" } });

    const res = mockRes();
    await ctrl.accept({ params: { recId: String(rec._id) }, user: userCtx }, res);

    expect(res.statusCode).toBe(409);
    expect(lifecycle.assignerVehicule).not.toHaveBeenCalled();
  });

  test("409 si transport déjà assigné", async () => {
    const t = await seedTransport({ vehicule: new mongoose.Types.ObjectId() });
    const rec = await seedRec(t._id);

    const res = mockRes();
    await ctrl.accept({ params: { recId: String(rec._id) }, user: userCtx }, res);

    expect(res.statusCode).toBe(409);
    expect(lifecycle.assignerVehicule).not.toHaveBeenCalled();
  });

  test("404 si reco introuvable", async () => {
    const res = mockRes();
    await ctrl.accept(
      { params: { recId: String(new mongoose.Types.ObjectId()) }, user: userCtx },
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});

// ── reject ──────────────────────────────────────────────────────────────────
describe("autoDispatchController.reject", () => {
  test("rejette avec raison valide → reco rejected + audit", async () => {
    const t = await seedTransport();
    const rec = await seedRec(t._id);

    const res = mockRes();
    await ctrl.reject(
      { params: { recId: String(rec._id) }, body: { raison: "Mauvais véhicule" }, user: userCtx },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await DispatchRecommendation.findById(rec._id);
    expect(updated.decision.status).toBe("rejected");
    expect(updated.decision.rejectionReason).toBe("Mauvais véhicule");

    const audits = await AuditLog.find({ action: "AUTO_DISPATCH_REJECTED" });
    expect(audits).toHaveLength(1);
  });

  test("400 si raison manquante", async () => {
    const t = await seedTransport();
    const rec = await seedRec(t._id);

    const res = mockRes();
    await ctrl.reject(
      { params: { recId: String(rec._id) }, body: { raison: "" }, user: userCtx },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  test("400 si raison < 3 caractères", async () => {
    const t = await seedTransport();
    const rec = await seedRec(t._id);

    const res = mockRes();
    await ctrl.reject(
      { params: { recId: String(rec._id) }, body: { raison: "ko" }, user: userCtx },
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});
