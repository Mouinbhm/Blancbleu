/**
 * Tests unitaires : Vehicle.location (GeoJSON Point + 2dsphere).
 *
 * - Hook pre('save') copie position.{lat,lng} → location {type:"Point", coordinates:[lng,lat]}
 * - Requête $near retourne les véhicules dans le rayon
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  await mongoose.connect(process.env.MONGO_URI);
  // Forcer la création des index (sinon le test $near peut échouer)
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

describe("Vehicle.location dual-write", () => {
  test("position → location synchronisé à chaque save", async () => {
    const Vehicle = require("../../models/Vehicle");
    const v = await Vehicle.create({
      immatriculation: "AB-123-CD",
      nom: "Test1",
      type: "VSL",
      position: { lat: 43.7102, lng: 7.262 },
    });
    expect(v.location.type).toBe("Point");
    expect(v.location.coordinates).toEqual([7.262, 43.7102]); // [lng, lat]
  });

  test("véhicule sans position n'a pas de location", async () => {
    const Vehicle = require("../../models/Vehicle");
    const v = await Vehicle.create({
      immatriculation: "AB-999-XX",
      nom: "Test-sans-pos",
      type: "VSL",
    });
    expect(v.location?.coordinates).toBeUndefined();
  });
});

describe("Vehicle 2dsphere index — requête $near", () => {
  test("Nice + Cannes dans rayon 50 km autour de Nice, Marseille exclue", async () => {
    const Vehicle = require("../../models/Vehicle");

    await Vehicle.create({ immatriculation: "NICE-1",  nom: "Nice",      type: "VSL", position: { lat: 43.7102, lng: 7.262 } });
    await Vehicle.create({ immatriculation: "CAN-1",   nom: "Cannes",    type: "VSL", position: { lat: 43.5528, lng: 7.0174 } });
    await Vehicle.create({ immatriculation: "MAR-1",   nom: "Marseille", type: "VSL", position: { lat: 43.2965, lng: 5.3698 } });

    const proches = await Vehicle.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [7.262, 43.7102] },
          $maxDistance: 50000,
        },
      },
    }).select("immatriculation");

    const codes = proches.map((v) => v.immatriculation).sort();
    expect(codes).toEqual(["CAN-1", "NICE-1"]);
  });
});
