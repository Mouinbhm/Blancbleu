/**
 * BlancBleu — Tests GeoUtils v3 (OSRM + fallback)
 *
 * Couverture :
 *   - calculerRouteOSRM (succès, timeout, fallback)
 *   - calculerETARoutier (P1/P2/P3, facteurs)
 *   - Cache OSRM
 */

jest.mock("axios");
jest.mock("../utils/logger", () => ({
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

// Coordonnées Nice réelles
const BASE = { lat: 43.7102, lng: 7.262 };
const INCIDENT = { lat: 43.72, lng: 7.278 };

// ──────────────────────────────────────────────────────────────────────────────
describe("calculerRouteOSRM", () => {
  afterEach(() => jest.clearAllMocks());

  test("retourne distanceKm et dureeSecondes depuis OSRM", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        code: "Ok",
        routes: [{ distance: 2500, duration: 180 }], // 2.5km, 3min
      },
    });

    const result = await calculerRouteOSRM(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
    );

    expect(result.distanceKm).toBeCloseTo(2.5, 1);
    expect(result.dureeSecondes).toBe(180);
    expect(result.source).toBe("osrm");
  });

  test("retourne source=osrm_cache au 2e appel identique", async () => {
    axios.get.mockResolvedValueOnce({
      data: { code: "Ok", routes: [{ distance: 2500, duration: 180 }] },
    });

    await calculerRouteOSRM(BASE.lat, BASE.lng, INCIDENT.lat, INCIDENT.lng);
    const cached = await calculerRouteOSRM(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
    );

    expect(cached.source).toBe("osrm_cache");
    expect(axios.get).toHaveBeenCalledTimes(1); // Une seule requête HTTP
  });

  test("fallback Haversine si OSRM timeout", async () => {
    axios.get.mockRejectedValueOnce(new Error("timeout"));

    const result = await calculerRouteOSRM(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
    );

    expect(result.source).toBe("haversine");
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.dureeSecondes).toBeNull();
  });

  test("fallback si réponse OSRM invalide", async () => {
    axios.get.mockResolvedValueOnce({
      data: { code: "Error", routes: [] },
    });

    const result = await calculerRouteOSRM(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
    );

    expect(result.source).toBe("haversine");
  });

  test("distance fallback inclut facteur sinuosité (×1.35)", async () => {
    axios.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const haversineDist = haversine(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
    );
    const result = await calculerRouteOSRM(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
    );

    expect(result.distanceKm).toBeCloseTo(haversineDist * 1.35, 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("calculerETARoutier", () => {
  afterEach(() => jest.clearAllMocks());

  test("P1 avec OSRM : ETA < ETA P2 (facteur 0.75 vs 0.90)", async () => {
    axios.get.mockResolvedValue({
      data: { code: "Ok", routes: [{ distance: 3000, duration: 240 }] },
    });

    const etaP1 = await calculerETARoutier(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
      "P1",
    );
    const etaP2 = await calculerETARoutier(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
      "P2",
    );

    expect(etaP1.minutes).toBeLessThan(etaP2.minutes);
  });

  test("retourne minutes, formate, distanceKm, source", async () => {
    axios.get.mockResolvedValueOnce({
      data: { code: "Ok", routes: [{ distance: 2000, duration: 120 }] },
    });

    const eta = await calculerETARoutier(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
      "P2",
    );

    expect(eta).toHaveProperty("minutes");
    expect(eta).toHaveProperty("formate");
    expect(eta).toHaveProperty("distanceKm");
    expect(eta).toHaveProperty("source");
    expect(eta.minutes).toBeGreaterThan(0);
  });

  test("fallback Haversine si OSRM indisponible", async () => {
    axios.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const eta = await calculerETARoutier(
      BASE.lat,
      BASE.lng,
      INCIDENT.lat,
      INCIDENT.lng,
      "P2",
    );

    expect(eta.source).toBe("haversine");
    expect(eta.minutes).toBeGreaterThan(0);
  });
});
