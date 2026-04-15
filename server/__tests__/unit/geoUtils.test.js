/**
 * BlancBleu — Tests GeoUtils v4.0
 * Transport sanitaire NON urgent
 *
 * Couverture :
 *   - haversine (distances connues)
 *   - calculerETA (vitesse fixe, facteur trafic)
 *   - calculerConsommation
 *   - distanceTrajet (base → prise en charge → destination)
 *   - trierParProximite
 *   - estDansZone (Alpes-Maritimes)
 */

const {
  haversine,
  calculerETA,
  calculerConsommation,
  distanceTrajet,
  distanceMissionComplete, // alias rétrocompat
  trierParProximite,
  estDansZone,
  estDansZoneNice, // alias rétrocompat
} = require("../../utils/geoUtils");

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — haversine
// ══════════════════════════════════════════════════════════════════════════════
describe("haversine", () => {
  test("distance Paris → Lyon ≈ 392 km (±10 km)", () => {
    const dist = haversine(48.8566, 2.3522, 45.764, 4.8357);
    expect(dist).toBeGreaterThan(382);
    expect(dist).toBeLessThan(402);
  });

  test("distance entre deux points identiques = 0", () => {
    const dist = haversine(43.71, 7.26, 43.71, 7.26);
    expect(dist).toBe(0);
  });

  test("distance Pasteur → Masséna Nice ≈ 1-5 km", () => {
    const dist = haversine(43.72, 7.245, 43.703, 7.278);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(5);
  });

  test("retourne une valeur arrondie à 2 décimales", () => {
    const dist = haversine(43.71, 7.26, 43.72, 7.27);
    expect(dist).toBe(Math.round(dist * 100) / 100);
  });

  test("est symétrique (A→B = B→A)", () => {
    const d1 = haversine(43.71, 7.26, 43.8, 7.3);
    const d2 = haversine(43.8, 7.3, 43.71, 7.26);
    expect(d1).toBeCloseTo(d2, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — calculerETA (transport non urgent — pas de P1/P2/P3)
// ══════════════════════════════════════════════════════════════════════════════
describe("calculerETA", () => {
  test("retourne les propriétés attendues : minutes, formate, fourchette, distanceKm, source", () => {
    const eta = calculerETA(10);
    expect(eta).toHaveProperty("minutes");
    expect(eta).toHaveProperty("formate");
    expect(eta).toHaveProperty("fourchette");
    expect(eta).toHaveProperty("distanceKm", 10);
    expect(eta).toHaveProperty("source", "haversine");
  });

  test("minutes est un entier positif", () => {
    const eta = calculerETA(5);
    expect(eta.minutes).toBeGreaterThan(0);
    expect(Number.isInteger(eta.minutes)).toBe(true);
  });

  test("formate en heures si trajet > 60 min", () => {
    // ~100 km à 50 km/h = 2h + marges → formate doit contenir 'h'
    const eta = calculerETA(150);
    expect(eta.formate).toMatch(/h/);
  });

  test("formate en minutes si trajet court", () => {
    // ~1 km → quelques minutes
    const eta = calculerETA(1);
    expect(eta.formate).toMatch(/min/);
  });

  test("ETA augmente avec la distance", () => {
    const eta5 = calculerETA(5);
    const eta20 = calculerETA(20);
    expect(eta20.minutes).toBeGreaterThan(eta5.minutes);
  });

  test("inclut le temps de préparation même pour distance 0", () => {
    const eta = calculerETA(0);
    // Temps de préparation = 3 min minimum
    expect(eta.minutes).toBeGreaterThanOrEqual(3);
  });

  test("la fourchette encadre bien les minutes", () => {
    const eta = calculerETA(10);
    const [minStr, maxStr] = eta.fourchette.split("-");
    const min = parseInt(minStr);
    const max = parseInt(maxStr);
    expect(min).toBeLessThanOrEqual(eta.minutes);
    expect(max).toBeGreaterThanOrEqual(eta.minutes);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — calculerConsommation
// ══════════════════════════════════════════════════════════════════════════════
describe("calculerConsommation", () => {
  test("consommation > 0 pour distance > 0", () => {
    const conso = calculerConsommation(10, {
      consommationL100: 12,
      capaciteReservoir: 80,
    });
    expect(conso).toBeGreaterThan(0);
  });

  test("consommation = 0 pour distance = 0", () => {
    const conso = calculerConsommation(0, {
      consommationL100: 12,
      capaciteReservoir: 80,
    });
    expect(conso).toBe(0);
  });

  test("utilise valeurs par défaut si specs absentes", () => {
    const conso = calculerConsommation(10);
    expect(conso).toBeGreaterThan(0);
  });

  test("consommation proportionnelle à la distance", () => {
    const specs = { consommationL100: 12, capaciteReservoir: 80 };
    const conso10 = calculerConsommation(10, specs);
    const conso20 = calculerConsommation(20, specs);
    expect(conso20).toBeCloseTo(conso10 * 2, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — distanceTrajet (base → prise en charge → destination)
// Nouveaux noms de champs : baseVersPriseEnCharge, priseEnChargeVersDestination, destinationVersBase
// ══════════════════════════════════════════════════════════════════════════════
describe("distanceTrajet", () => {
  const base = { lat: 43.7102, lng: 7.262 };
  const priseEnCharge = { lat: 43.72, lng: 7.27 };
  const destination = { lat: 43.7, lng: 7.28 };

  test("retourne les 4 champs attendus", () => {
    const result = distanceTrajet(base, priseEnCharge, destination);
    expect(result).toHaveProperty("baseVersPriseEnCharge");
    expect(result).toHaveProperty("priseEnChargeVersDestination");
    expect(result).toHaveProperty("destinationVersBase");
    expect(result).toHaveProperty("total");
  });

  test("total = somme des 3 segments", () => {
    const result = distanceTrajet(base, priseEnCharge, destination);
    const somme =
      result.baseVersPriseEnCharge +
      result.priseEnChargeVersDestination +
      result.destinationVersBase;
    expect(result.total).toBeCloseTo(somme, 1);
  });

  test("fonctionne sans destination (retour direct base)", () => {
    const result = distanceTrajet(base, priseEnCharge, null);
    expect(result.priseEnChargeVersDestination).toBe(0);
    expect(result.destinationVersBase).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  test("tous les segments sont positifs ou nuls", () => {
    const result = distanceTrajet(base, priseEnCharge, destination);
    expect(result.baseVersPriseEnCharge).toBeGreaterThan(0);
    expect(result.priseEnChargeVersDestination).toBeGreaterThan(0);
    expect(result.destinationVersBase).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  test("alias distanceMissionComplete retourne les mêmes résultats", () => {
    const r1 = distanceTrajet(base, priseEnCharge, destination);
    const r2 = distanceMissionComplete(base, priseEnCharge, destination);
    expect(r1.total).toBeCloseTo(r2.total, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 5 — trierParProximite
// ══════════════════════════════════════════════════════════════════════════════
describe("trierParProximite", () => {
  const vehicules = [
    {
      _id: "1",
      nom: "VSL-Loin",
      position: { lat: 43.8, lng: 7.35 },
      toObject: function () { return this; },
    },
    {
      _id: "2",
      nom: "VSL-Pres",
      position: { lat: 43.715, lng: 7.265 },
      toObject: function () { return this; },
    },
    {
      _id: "3",
      nom: "VSL-Moyen",
      position: { lat: 43.75, lng: 7.29 },
      toObject: function () { return this; },
    },
  ];

  test("trie par distance croissante (le plus proche en premier)", () => {
    const result = trierParProximite(vehicules, 43.71, 7.26);
    expect(result[0].nom).toBe("VSL-Pres");
    expect(result[result.length - 1].nom).toBe("VSL-Loin");
  });

  test("ajoute geo.distanceKm, geo.etaMinutes et geo.etaFormate", () => {
    const result = trierParProximite(vehicules, 43.71, 7.26);
    result.forEach((v) => {
      expect(v.geo).toHaveProperty("distanceKm");
      expect(v.geo).toHaveProperty("etaMinutes");
      expect(v.geo).toHaveProperty("etaFormate");
      expect(v.geo.distanceKm).toBeGreaterThanOrEqual(0);
      expect(v.geo.etaMinutes).toBeGreaterThan(0);
    });
  });

  test("ignore les véhicules sans position GPS", () => {
    const avecSansPosition = [
      ...vehicules,
      {
        _id: "4",
        nom: "VSL-NoGPS",
        position: null,
        toObject: function () { return this; },
      },
    ];
    const result = trierParProximite(avecSansPosition, 43.71, 7.26);
    const noms = result.map((v) => v.nom);
    expect(noms).not.toContain("VSL-NoGPS");
    expect(result).toHaveLength(3);
  });

  test("retourne tableau vide si aucun véhicule avec position", () => {
    const sansPosition = [
      { _id: "1", nom: "A", position: null },
      { _id: "2", nom: "B", position: {} },
    ];
    const result = trierParProximite(sansPosition, 43.71, 7.26);
    expect(result).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 6 — estDansZone (Alpes-Maritimes étendu : lat 43.5-44.2, lng 6.9-7.6)
// ══════════════════════════════════════════════════════════════════════════════
describe("estDansZone", () => {
  test("centre de Nice est dans la zone", () => {
    expect(estDansZone(43.71, 7.26)).toBe(true);
  });

  test("alias estDansZoneNice fonctionne identiquement", () => {
    expect(estDansZoneNice(43.71, 7.26)).toBe(true);
  });

  test("Paris est hors zone", () => {
    expect(estDansZone(48.85, 2.35)).toBe(false);
  });

  test("Antibes est dans la zone", () => {
    expect(estDansZone(43.58, 7.12)).toBe(true);
  });

  test("point clairement hors zone (Italie nord) est hors zone", () => {
    expect(estDansZone(45.0, 9.0)).toBe(false);
  });

  test("point hors des bornes lng est hors zone", () => {
    expect(estDansZone(43.71, 8.0)).toBe(false);
  });
});
