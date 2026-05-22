/**
 * Tests unitaires : pré-filtre $near pour le dispatch de véhicules.
 *
 * Vérifie que la requête `Vehicle.find({ statut, location: { $near } })`
 * exploite bien l'index 2dsphere et ne ramène que les véhicules dans le
 * rayon spécifié.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  await mongoose.connect(process.env.MONGO_URI);
  await require("../../models/Vehicle").init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

afterEach(async () => {
  const Vehicle = require("../../models/Vehicle");
  await Vehicle.deleteMany({});
});

describe("Dispatch — pré-filtre $near sur Vehicle.location", () => {
  test("ramène uniquement les véhicules dans le rayon (3 Nice / 17 ailleurs)", async () => {
    const Vehicle = require("../../models/Vehicle");

    // 3 véhicules à Nice (centre)
    const nice = [
      { immat: "NIC-001", lat: 43.7102, lng: 7.262 },
      { immat: "NIC-002", lat: 43.6961, lng: 7.265 },
      { immat: "NIC-003", lat: 43.7225, lng: 7.260 },
    ];
    // 17 véhicules ailleurs (Cannes ~33km, Antibes ~20km, Monaco ~14km,
    // Grasse ~25km, Marseille ~160km, etc.) — pour notre test, on les met
    // tous à >40km de Nice pour qu'ils soient exclus par maxDistance=5km.
    const others = [
      { immat: "MAR-001", lat: 43.2965, lng: 5.3698 },
      { immat: "MAR-002", lat: 43.2900, lng: 5.3700 },
      { immat: "MAR-003", lat: 43.3000, lng: 5.3700 },
      { immat: "LYO-001", lat: 45.7640, lng: 4.8357 },
      { immat: "LYO-002", lat: 45.7600, lng: 4.8400 },
      { immat: "PAR-001", lat: 48.8566, lng: 2.3522 },
      { immat: "PAR-002", lat: 48.8550, lng: 2.3550 },
      { immat: "BOR-001", lat: 44.8378, lng: -0.5792 },
      { immat: "TOU-001", lat: 43.6047, lng: 1.4442 },
      { immat: "NAN-001", lat: 47.2184, lng: -1.5536 },
      { immat: "STR-001", lat: 48.5734, lng: 7.7521 },
      { immat: "LIL-001", lat: 50.6292, lng: 3.0573 },
      { immat: "ANG-001", lat: 47.4784, lng: -0.5632 },
      { immat: "REN-001", lat: 48.1173, lng: -1.6778 },
      { immat: "DIJ-001", lat: 47.3220, lng: 5.0415 },
      { immat: "ORL-001", lat: 47.9029, lng: 1.9039 },
      { immat: "MET-001", lat: 49.1193, lng: 6.1757 },
    ];

    for (const v of [...nice, ...others]) {
      await Vehicle.create({
        immatriculation: v.immat,
        nom: v.immat,
        type: "VSL",
        statut: "Disponible",
        position: { lat: v.lat, lng: v.lng },
      });
    }

    // Requête identique à celle d'aiController : $near rayon 5km autour de Nice
    const proches = await Vehicle.find({
      statut: "Disponible",
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [7.262, 43.7102] },
          $maxDistance: 5000, // 5 km
        },
      },
    }).limit(15).select("immatriculation");

    const codes = proches.map((v) => v.immatriculation).sort();
    expect(codes).toEqual(["NIC-001", "NIC-002", "NIC-003"]);
  });

  test("limit honoré quand plus de candidats que limit", async () => {
    const Vehicle = require("../../models/Vehicle");

    // 20 véhicules proches de Nice, on demande limit:5
    for (let i = 0; i < 20; i++) {
      await Vehicle.create({
        immatriculation: `NIC-${String(i).padStart(3, "0")}`,
        nom: `n${i}`,
        type: "VSL",
        statut: "Disponible",
        position: { lat: 43.7102 + i * 0.001, lng: 7.262 + i * 0.001 },
      });
    }

    const proches = await Vehicle.find({
      statut: "Disponible",
      location: { $near: { $geometry: { type: "Point", coordinates: [7.262, 43.7102] }, $maxDistance: 50000 } },
    }).limit(5);

    expect(proches).toHaveLength(5);
  });
});
