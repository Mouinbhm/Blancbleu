/**
 * Tests : webPushService + pushController (subscribe / unsubscribe / status).
 *
 * On mock la lib web-push pour ne pas tenter d'envoyer un vrai push.
 * On utilise MongoMemoryServer pour les modèles.
 * Pas de jest.resetModules() — on utilise webPushService._resetForTests()
 * pour rafraîchir l'état entre tests (changer les env VAPID), ce qui évite
 * de perdre la connexion mongoose.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "pub", privateKey: "priv" })),
}));

const webpushLib = require("web-push");
const svc        = require("../../services/webPushService");
const ctrl       = require("../../controllers/pushController");
const PushSubscription = require("../../models/PushSubscription");
const User             = require("../../models/User");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  await Promise.all([PushSubscription.deleteMany({}), User.deleteMany({})]);
  jest.clearAllMocks();
});

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b)   { this.body = b; return this; },
  };
}

// ── webPushService.isConfigured ─────────────────────────────────────────────
describe("webPushService.isConfigured", () => {
  test("false sans VAPID env", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    svc._resetForTests();
    expect(svc.isConfigured()).toBe(false);
    expect(svc.getPublicKey()).toBeNull();
  });

  test("true avec VAPID env", () => {
    process.env.VAPID_PUBLIC_KEY = "test-pub-key";
    process.env.VAPID_PRIVATE_KEY = "test-priv-key";
    svc._resetForTests();
    expect(svc.isConfigured()).toBe(true);
    expect(svc.getPublicKey()).toBe("test-pub-key");
    expect(webpushLib.setVapidDetails).toHaveBeenCalled();
  });
});

// ── webPushService.sendToUser ───────────────────────────────────────────────
describe("webPushService.sendToUser", () => {
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY  = "test-pub-key";
    process.env.VAPID_PRIVATE_KEY = "test-priv-key";
    svc._resetForTests();
  });

  test("envoie à toutes les subs du user", async () => {
    webpushLib.sendNotification.mockResolvedValue({});

    const userId = new mongoose.Types.ObjectId();
    await PushSubscription.create({
      userId, endpoint: "https://x/1", keys: { p256dh: "a", auth: "b" },
    });
    await PushSubscription.create({
      userId, endpoint: "https://x/2", keys: { p256dh: "c", auth: "d" },
    });

    const res = await svc.sendToUser(userId, { title: "T" });
    expect(res.sent).toBe(2);
    expect(res.removed).toBe(0);
    expect(webpushLib.sendNotification).toHaveBeenCalledTimes(2);
  });

  test("supprime auto les subs expirées (410)", async () => {
    const userId = new mongoose.Types.ObjectId();
    await PushSubscription.create({
      userId, endpoint: "https://gone/1", keys: { p256dh: "a", auth: "b" },
    });

    const err410 = new Error("Gone");
    err410.statusCode = 410;
    webpushLib.sendNotification.mockRejectedValue(err410);

    const res = await svc.sendToUser(userId, { title: "T" });
    expect(res.sent).toBe(0);
    expect(res.removed).toBe(1);
    expect(await PushSubscription.countDocuments({ userId })).toBe(0);
  });

  test("no-op si non configuré", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    svc._resetForTests();
    const userId = new mongoose.Types.ObjectId();
    const res = await svc.sendToUser(userId, { title: "T" });
    expect(res).toEqual({ sent: 0, removed: 0 });
  });
});

// ── pushController ──────────────────────────────────────────────────────────
describe("pushController", () => {
  let user;

  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY  = "pub-xyz";
    process.env.VAPID_PRIVATE_KEY = "priv-xyz";
    svc._resetForTests();
    user = { _id: new mongoose.Types.ObjectId(), email: "u@bb.fr", role: "dispatcher" };
  });

  test("getVapidPublicKey renvoie la clé publique", () => {
    const res = mockRes();
    ctrl.getVapidPublicKey({}, res);
    expect(res.body).toEqual({ publicKey: "pub-xyz" });
  });

  test("getVapidPublicKey 503 si VAPID absent", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    svc._resetForTests();
    const res = mockRes();
    ctrl.getVapidPublicKey({}, res);
    expect(res.statusCode).toBe(503);
  });

  test("subscribe rejette une subscription invalide", async () => {
    const res = mockRes();
    await ctrl.subscribe({ body: { subscription: { endpoint: "x" } }, user, headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  test("subscribe upsert sur le même endpoint (pas de doublon)", async () => {
    const sub = {
      endpoint: "https://push.example/1",
      keys: { p256dh: "p", auth: "a" },
    };

    const res1 = mockRes();
    await ctrl.subscribe({ body: { subscription: sub }, user, headers: {} }, res1);
    expect(res1.body.success).toBe(true);

    const res2 = mockRes();
    await ctrl.subscribe({ body: { subscription: sub }, user, headers: {} }, res2);
    expect(res2.body.success).toBe(true);

    expect(await PushSubscription.countDocuments({ endpoint: sub.endpoint })).toBe(1);
  });

  test("unsubscribe supprime la sub du user", async () => {
    const endpoint = "https://push.example/2";
    await PushSubscription.create({
      userId: user._id, endpoint, keys: { p256dh: "p", auth: "a" },
    });

    const res = mockRes();
    await ctrl.unsubscribe({ body: { endpoint }, user }, res);
    expect(res.body.success).toBe(true);
    expect(res.body.removed).toBe(1);
    expect(await PushSubscription.countDocuments({ endpoint })).toBe(0);
  });

  test("getStatus renvoie configured + count", async () => {
    await PushSubscription.create({
      userId: user._id, endpoint: "https://x/y", keys: { p256dh: "p", auth: "a" },
    });

    const res = mockRes();
    await ctrl.getStatus({ user }, res);
    expect(res.body.configured).toBe(true);
    expect(res.body.subscriptions).toBe(1);
  });
});
