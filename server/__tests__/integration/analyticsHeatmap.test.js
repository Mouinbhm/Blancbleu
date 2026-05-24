/**
 * Test ciblé : endpoint GET /api/analytics/heatmap (sans monter Express,
 * via le handler de la route).
 *
 * On valide :
 *   - agrégation des points départ + destination
 *   - bucketing à 3 décimales (deux transports proches → un seul bucket)
 *   - filtre par statut (REQUESTED exclu)
 *   - filtre par période (days)
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;
let router;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  await mongoose.connect(process.env.MONGO_URI);
  // Charger les modèles d'abord
  require("../../models/Transport");
  require("../../models/Vehicle");
  router = require("../../routes/analytics");
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  const Transport = require("../../models/Transport");
  await Transport.deleteMany({});
});

function findHeatmapHandler() {
  // Extrait le handler de la route GET /heatmap depuis le stack du router
  const layer = router.stack.find(
    (l) => l.route?.path === "/heatmap" && l.route.methods.get,
  );
  // Le handler final est le dernier middleware de la route (après protect)
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b)   { this.body = b; return this; },
  };
}

function tBase(overrides = {}) {
  return {
    numero: `TRS-H-${Date.now()}-${Math.random()}`,
    statut: "COMPLETED",
    typeTransport: "VSL",
    motif: "Dialyse",
    dateTransport: new Date(),
    heureRDV: "10:00",
    patient: { nom: "X", prenom: "Y", mobilite: "ASSIS", telephone: "0600000000" },
    adresseDepart: {
      rue: "1", ville: "Nice", codePostal: "06000",
      coordonnees: { lat: 43.71020, lng: 7.26200 },
    },
    adresseDestination: {
      rue: "Hopital", ville: "Nice", codePostal: "06000",
      coordonnees: { lat: 43.70000, lng: 7.27000 },
    },
    ...overrides,
  };
}

describe("GET /api/analytics/heatmap", () => {
  test("agrège départ + destination", async () => {
    const Transport = require("../../models/Transport");
    await Transport.create(tBase());
    await Transport.create(tBase({ numero: "TRS-H-2" }));

    const handler = findHeatmapHandler();
    const res = mockRes();
    await handler({ query: {}, user: { role: "dispatcher" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(2);
    // 2 transports × 2 points (départ+dest) = 4 points, mais 2 paires identiques
    // donc 2 buckets uniques avec weight=2 chacun.
    expect(res.body.uniquePoints).toBe(2);
    expect(res.body.maxWeight).toBe(2);
    expect(res.body.points).toHaveLength(2);
    res.body.points.forEach((p) => {
      expect(p).toHaveLength(3);
      expect(typeof p[0]).toBe("number");
      expect(typeof p[1]).toBe("number");
      expect(p[2]).toBe(2);
    });
  });

  test("bucketise les points proches (~110m) ensemble", async () => {
    const Transport = require("../../models/Transport");
    // Trois transports avec départ très proches (4ème décimale)
    await Transport.create(tBase({ adresseDepart: { rue: "a", ville: "Nice", codePostal: "06000",
      coordonnees: { lat: 43.7102, lng: 7.2620 } } }));
    await Transport.create(tBase({ numero: "TRS-H-A", adresseDepart: { rue: "a", ville: "Nice", codePostal: "06000",
      coordonnees: { lat: 43.71021, lng: 7.26203 } } }));
    await Transport.create(tBase({ numero: "TRS-H-B", adresseDepart: { rue: "a", ville: "Nice", codePostal: "06000",
      coordonnees: { lat: 43.71019, lng: 7.26198 } } }));

    const handler = findHeatmapHandler();
    const res = mockRes();
    await handler({ query: {}, user: { role: "dispatcher" } }, res);

    const departBucket = res.body.points.find((p) => p[0] === 43.710 && p[1] === 7.262);
    expect(departBucket).toBeDefined();
    expect(departBucket[2]).toBe(3); // 3 transports dans le même bucket
  });

  test("ignore les transports REQUESTED (statut hors plage)", async () => {
    const Transport = require("../../models/Transport");
    await Transport.create(tBase({ statut: "REQUESTED" }));

    const handler = findHeatmapHandler();
    const res = mockRes();
    await handler({ query: {}, user: { role: "dispatcher" } }, res);

    expect(res.body.count).toBe(0);
  });

  test("clamp days entre 1 et 180", async () => {
    const handler = findHeatmapHandler();
    const res = mockRes();
    await handler({ query: { days: "9999" }, user: { role: "dispatcher" } }, res);
    expect(res.body.days).toBe(180);

    const res2 = mockRes();
    await handler({ query: { days: "-5" }, user: { role: "dispatcher" } }, res2);
    expect(res2.body.days).toBe(1);
  });
});
