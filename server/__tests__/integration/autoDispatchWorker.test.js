/**
 * Tests d'intégration : worker auto-dispatch (HITL).
 *
 * Couvre :
 *   - idempotence : skip si transport assigné / statut ≠ SCHEDULED / reco pending existe
 *   - re-check config.enabled au runtime
 *   - non-éligible → reco rejected
 *   - éligible + requireApproval=true → reco pending (HITL) + socket émis
 *   - éligible + requireApproval=false → assignerVehicule appelé + audit
 *     AUTO_DISPATCH_ASSIGNED + reco accepted (BRANCHE SENSIBLE)
 *
 * Stratégie : MongoMemoryServer pour vrai stockage Mongo. aiClient,
 * transportLifecycle.assignerVehicule et socketService sont mockés via
 * jest.mock avant le require du worker.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock("../../services/aiClient", () => ({
  recommanderDispatch: jest.fn(),
}));
jest.mock("../../services/transportLifecycle", () => ({
  assignerVehicule: jest.fn(),
}));
jest.mock("../../services/socketService", () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
}));

// La queue stub kicks in via NODE_ENV=test (cf. queues/index.js)
process.env.NODE_ENV = "test";

const aiClient        = require("../../services/aiClient");
const lifecycle       = require("../../services/transportLifecycle");
const { processAutoDispatchJob } = require("../../workers/autoDispatchWorker");

const Transport             = require("../../models/Transport");
const Vehicle               = require("../../models/Vehicle");
const Personnel             = require("../../models/Personnel");
const DispatchConfig        = require("../../models/DispatchConfig");
const DispatchRecommendation = require("../../models/DispatchRecommendation");
const AuditLog              = require("../../models/AuditLog");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  await Promise.all([
    Transport.deleteMany({}),
    Vehicle.deleteMany({}),
    Personnel.deleteMany({}),
    DispatchConfig.deleteMany({}),
    DispatchRecommendation.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  jest.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────
async function seedConfig({ enabled = true, requireApproval = true, scoreThreshold = 80 } = {}) {
  return DispatchConfig.create({
    _id: "default",
    weights: DispatchConfig.DEFAULT_WEIGHTS,
    autoDispatch: { enabled, requireApproval, scoreThreshold },
  });
}

async function seedTransport(overrides = {}) {
  const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return Transport.create({
    numero: "TRS-TEST-001",
    statut: "SCHEDULED",
    typeTransport: "VSL",
    motif: "Dialyse",
    dateTransport: futureDate,
    heureRDV: `${String(futureDate.getHours()).padStart(2, "0")}:00`,
    patient: { nom: "TEST", prenom: "John", mobilite: "ASSIS", telephone: "0600000000" },
    adresseDepart: { rue: "1 rue X", ville: "Nice", codePostal: "06000" },
    adresseDestination: { rue: "Hopital", ville: "Nice", codePostal: "06000" },
    ...overrides,
  });
}

async function seedVehicle() {
  return Vehicle.create({
    immatriculation: "AB-001-CD",
    nom: "VSL-01",
    type: "VSL",
    statut: "Disponible",
  });
}

function iaResultOk({ vehiculeId, score = 90, vehicleTypeMatch = 100, risks = [] } = {}) {
  return {
    bestRecommendation: {
      vehiculeId,
      vehicleName: "VSL-01",
      driverName:  null,
      score,
      criteriaScores: { vehicleTypeMatch },
      risks,
    },
    recommendations: [{
      vehiculeId,
      score,
      criteriaScores: { vehicleTypeMatch },
      risks,
    }],
    summary: { totalCandidates: 1, eligibleCandidates: 1, excludedCandidates: 0 },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("processAutoDispatchJob", () => {
  test("skip : job sans transportId", async () => {
    const res = await processAutoDispatchJob({ data: {} });
    expect(res).toEqual({ skipped: "no_transport_id" });
  });

  test("skip : config désactivée au runtime", async () => {
    await seedConfig({ enabled: false });
    const t = await seedTransport();
    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res).toEqual({ skipped: "config_disabled" });
    expect(aiClient.recommanderDispatch).not.toHaveBeenCalled();
  });

  test("skip : transport introuvable", async () => {
    await seedConfig();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await processAutoDispatchJob({ data: { transportId: String(fakeId) } });
    expect(res).toEqual({ skipped: "transport_not_found" });
  });

  test("skip : statut ≠ SCHEDULED", async () => {
    await seedConfig();
    const t = await seedTransport({ statut: "CONFIRMED" });
    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res.skipped).toBe("statut:CONFIRMED");
  });

  test("skip : déjà assigné (idempotence)", async () => {
    await seedConfig();
    const v = await seedVehicle();
    const t = await seedTransport({ vehicule: v._id });
    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res).toEqual({ skipped: "already_assigned" });
  });

  test("skip : reco pending déjà existante (idempotence)", async () => {
    await seedConfig();
    const t = await seedTransport();
    const existing = await DispatchRecommendation.create({
      transportId: t._id,
      bestRecommendation: { score: 90 },
      decision: { status: "pending" },
    });
    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res.skipped).toBe("pending_exists");
    expect(String(res.recommendationId)).toBe(String(existing._id));
    expect(aiClient.recommanderDispatch).not.toHaveBeenCalled();
  });

  test("skip : aucun véhicule disponible", async () => {
    await seedConfig();
    const t = await seedTransport();
    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res).toEqual({ skipped: "no_vehicle_available" });
  });

  test("skip : IA indisponible (pas de fallback en auto)", async () => {
    await seedConfig();
    const t = await seedTransport();
    await seedVehicle();
    aiClient.recommanderDispatch.mockRejectedValue(new Error("Service IA indisponible"));
    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res.skipped).toBe("ia_unavailable");
    expect(lifecycle.assignerVehicule).not.toHaveBeenCalled();
  });

  test("non éligible (mobilité ALLONGE) → reco rejected, JAMAIS d'assignation", async () => {
    await seedConfig({ requireApproval: false }); // même en auto-assign, mobilité bloque
    const t = await seedTransport({
      typeTransport: "AMBULANCE", // requis par la validation Transport pour ALLONGE
      patient: { nom: "X", prenom: "Y", mobilite: "ALLONGE", telephone: "0600000000" },
    });
    const v = await seedVehicle();
    aiClient.recommanderDispatch.mockResolvedValue(iaResultOk({ vehiculeId: v._id }));

    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });

    expect(res.eligible).toBe(false);
    expect(res.raisons.some((r) => r.startsWith("mobilite_non_autorisee"))).toBe(true);
    expect(lifecycle.assignerVehicule).not.toHaveBeenCalled();
    const rec = await DispatchRecommendation.findById(res.recommendationId);
    expect(rec.decision.status).toBe("rejected");
  });

  test("non éligible (score 70 < threshold 80) → reco rejected", async () => {
    await seedConfig({ requireApproval: false });
    const t = await seedTransport();
    const v = await seedVehicle();
    aiClient.recommanderDispatch.mockResolvedValue(iaResultOk({ vehiculeId: v._id, score: 70 }));

    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });
    expect(res.eligible).toBe(false);
    expect(lifecycle.assignerVehicule).not.toHaveBeenCalled();
  });

  test("éligible + requireApproval=true → reco PENDING (HITL)", async () => {
    await seedConfig({ requireApproval: true });
    const t = await seedTransport();
    const v = await seedVehicle();
    aiClient.recommanderDispatch.mockResolvedValue(iaResultOk({ vehiculeId: v._id }));

    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });

    expect(res.mode).toBe("pending");
    expect(res.recommendationId).toBeDefined();
    expect(res.score).toBe(90);
    expect(lifecycle.assignerVehicule).not.toHaveBeenCalled();

    const rec = await DispatchRecommendation.findById(res.recommendationId);
    expect(rec.decision.status).toBe("pending");

    // Pas d'audit AUTO_DISPATCH_ASSIGNED (mode pending)
    const audits = await AuditLog.find({ action: "AUTO_DISPATCH_ASSIGNED" });
    expect(audits).toHaveLength(0);
  });

  test("éligible + requireApproval=false → assignation effective + audit + accepted (BRANCHE SENSIBLE)", async () => {
    await seedConfig({ requireApproval: false });
    const t = await seedTransport();
    const v = await seedVehicle();
    aiClient.recommanderDispatch.mockResolvedValue(iaResultOk({ vehiculeId: v._id, score: 95 }));
    lifecycle.assignerVehicule.mockResolvedValue({
      transport: { ...t.toObject(), numero: t.numero },
      justification: ["auto"],
    });

    const res = await processAutoDispatchJob({ data: { transportId: String(t._id) } });

    expect(res.mode).toBe("auto_assigned");
    expect(res.vehiculeId).toEqual(v._id);
    expect(res.score).toBe(95);

    // assignerVehicule appelé avec systemUser et le bon vehiculeId
    expect(lifecycle.assignerVehicule).toHaveBeenCalledTimes(1);
    const [tid, { vehiculeId }, user] = lifecycle.assignerVehicule.mock.calls[0];
    expect(String(tid)).toBe(String(t._id));
    expect(String(vehiculeId)).toBe(String(v._id));
    expect(user.email).toBe("auto-dispatch@system");

    // Reco accepted
    const rec = await DispatchRecommendation.findById(res.recommendationId);
    expect(rec.decision.status).toBe("accepted");
    expect(String(rec.decision.finalVehiculeId)).toBe(String(v._id));

    // Audit AUTO_DISPATCH_ASSIGNED présent
    const audits = await AuditLog.find({ action: "AUTO_DISPATCH_ASSIGNED" });
    expect(audits).toHaveLength(1);
    expect(audits[0].origine).toBe("SYSTÈME");
    expect(audits[0].ressource.id).toEqual(t._id);
  });

  test("éligible + requireApproval=false MAIS assignerVehicule throw → reco repassée en pending (humain prend la main)", async () => {
    await seedConfig({ requireApproval: false });
    const t = await seedTransport();
    const v = await seedVehicle();
    aiClient.recommanderDispatch.mockResolvedValue(iaResultOk({ vehiculeId: v._id }));
    lifecycle.assignerVehicule.mockRejectedValue(new Error("DB locked"));

    await expect(
      processAutoDispatchJob({ data: { transportId: String(t._id) } }),
    ).rejects.toThrow("DB locked");

    const recs = await DispatchRecommendation.find({ transportId: t._id });
    expect(recs).toHaveLength(1);
    expect(recs[0].decision.status).toBe("pending");
    expect(recs[0].decision.rejectionReason).toMatch(/auto-assign-failed/);
  });
});
