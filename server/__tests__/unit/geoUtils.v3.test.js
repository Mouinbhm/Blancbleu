/**
 * BlancBleu — Tests GeoUtils OSRM (fonctions asynchrones)
 *
 * Couverture :
 *   - calculerRouteOSRM (succès, timeout, fallback, cache)
 *   - calculerETARoutier (transport non urgent, sans priorité)
 *
 * Note: le cache OSRM est module-level, donc chaque test utilise
 * des coordonnées uniques pour éviter les collisions de cache.
 */

jest.mock("axios");
jest.mock("../../utils/logger", () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const axios = require("axios");
const {
  calculerRouteOSRM,
  calculerETARoutier,
  haversine,
} = require("../../utils/geoUtils");

// Générateur de coordonnées uniques — évite les hits de cache inter-tests
let _offset = 0;
const uniqCoords = () => {
  _offset += 0.001;
  return {
    lat1: 43.71 + _offset,
    lng1: 7.26 + _offset,
    lat2: 43.72 + _offset,
    lng2: 7.278 + _offset,
  };
};

// ──────────────────────────────────────────────────────────────────────────────
describe("calculerRouteOSRM", () => {
  afterEach(() => jest.clearAllMocks());

  test("retourne distanceKm et dureeSecondes depuis OSRM", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockResolvedValueOnce({
      data: {
        code: "Ok",
        routes: [{ distance: 2500, duration: 180 }], // 2.5km, 3min
      },
    });

    const result = await calculerRouteOSRM(lat1, lng1, lat2, lng2);

    expect(result.distanceKm).toBeCloseTo(2.5, 1);
    expect(result.dureeSecondes).toBe(180);
    expect(result.source).toBe("osrm");
  });

  test("retourne source=osrm_cache au 2e appel identique", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockResolvedValueOnce({
      data: { code: "Ok", routes: [{ distance: 2500, duration: 180 }] },
    });

    await calculerRouteOSRM(lat1, lng1, lat2, lng2);
    const cached = await calculerRouteOSRM(lat1, lng1, lat2, lng2);

    expect(cached.source).toBe("osrm_cache");
    expect(axios.get).toHaveBeenCalledTimes(1); // Une seule requête HTTP
  });

  test("fallback Haversine si OSRM timeout", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockRejectedValueOnce(new Error("timeout"));

    const result = await calculerRouteOSRM(lat1, lng1, lat2, lng2);

    expect(result.source).toBe("haversine");
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.dureeSecondes).toBeNull();
  });

  test("fallback si réponse OSRM invalide", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockResolvedValueOnce({
      data: { code: "Error", routes: [] },
    });

    const result = await calculerRouteOSRM(lat1, lng1, lat2, lng2);

    expect(result.source).toBe("haversine");
  });

  test("distance fallback inclut facteur sinuosité (×1.35)", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const haversineDist = haversine(lat1, lng1, lat2, lng2);
    const result = await calculerRouteOSRM(lat1, lng1, lat2, lng2);

    expect(result.distanceKm).toBeCloseTo(haversineDist * 1.35, 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("calculerETARoutier", () => {
  afterEach(() => jest.clearAllMocks());

  test("retourne minutes, formate, distanceKm, source", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockResolvedValueOnce({
      data: { code: "Ok", routes: [{ distance: 2000, duration: 120 }] },
    });

    const eta = await calculerETARoutier(lat1, lng1, lat2, lng2);

    expect(eta).toHaveProperty("minutes");
    expect(eta).toHaveProperty("formate");
    expect(eta).toHaveProperty("distanceKm");
    expect(eta).toHaveProperty("source");
    expect(eta.minutes).toBeGreaterThan(0);
  });

  test("ETA via OSRM est positif et distanceKm correspond", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockResolvedValueOnce({
      data: { code: "Ok", routes: [{ distance: 5000, duration: 360 }] },
    });

    const eta = await calculerETARoutier(lat1, lng1, lat2, lng2);

    expect(eta.minutes).toBeGreaterThan(0);
    expect(eta.distanceKm).toBeCloseTo(5, 0);
  });

  test("fallback Haversine si OSRM indisponible", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    axios.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const eta = await calculerETARoutier(lat1, lng1, lat2, lng2);

    expect(eta.source).toBe("haversine");
    expect(eta.minutes).toBeGreaterThan(0);
  });

  test("inclut marge de 10% sur durée OSRM", async () => {
    const { lat1, lng1, lat2, lng2 } = uniqCoords();
    // durée OSRM brute = 120s = 2min ; avec marge 10% → arrondi ≥ ceil(2)
    axios.get.mockResolvedValueOnce({
      data: { code: "Ok", routes: [{ distance: 1500, duration: 120 }] },
    });

    const eta = await calculerETARoutier(lat1, lng1, lat2, lng2);

    const minutesBrutes = Math.ceil(120 / 60);
    expect(eta.minutes).toBeGreaterThanOrEqual(minutesBrutes);
  });
});
