/**
 * Tests unitaires : règles d'éligibilité auto-dispatch.
 *
 * Fonction pure → pas besoin de Mongo. Couvre :
 *   - cas nominal (éligible)
 *   - chaque règle prise individuellement (KO + raison attendue)
 *   - cumul de raisons multiples
 *   - normalisation date+heureRDV
 */

const {
  evaluerEligibilite,
  _resolveDateTransport,
} = require("../../services/autoDispatchService");

// ── Fixtures ────────────────────────────────────────────────────────────────
// Dates locales pour éviter les surprises TZ.
const NOW = new Date(2026, 4, 24, 8, 0, 0); // 24 mai 2026, 08:00 locale

function transportOk() {
  return {
    _id: "t1",
    statut: "SCHEDULED",
    vehicule: null,
    patient: { mobilite: "ASSIS" },
    dateTransport: new Date(2026, 4, 24, 10, 0, 0), // +2h
    heureRDV: "10:00",
  };
}

function recoOk() {
  return {
    bestRecommendation: {
      vehiculeId: "v1",
      score: 90,
      criteriaScores: { vehicleTypeMatch: 100 },
      risks: [],
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("autoDispatchService.evaluerEligibilite", () => {
  test("cas nominal : éligible", () => {
    const res = evaluerEligibilite(transportOk(), recoOk(), {}, NOW);
    expect(res.eligible).toBe(true);
    expect(res.raisons).toEqual([]);
  });

  test("transport absent → non éligible", () => {
    const res = evaluerEligibilite(null, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons).toContain("transport_absent");
  });

  test("recommandation absente → non éligible", () => {
    const res = evaluerEligibilite(transportOk(), null, {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons).toContain("recommendation_absente");
  });

  test("statut ≠ SCHEDULED → non éligible", () => {
    const t = transportOk();
    t.statut = "REQUESTED";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((r) => r.startsWith("statut_invalide"))).toBe(true);
  });

  test("véhicule déjà assigné → non éligible (idempotence)", () => {
    const t = transportOk();
    t.vehicule = "vXYZ";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons).toContain("deja_assigne");
  });

  test("mobilité ALLONGE → JAMAIS éligible (règle critique)", () => {
    const t = transportOk();
    t.patient.mobilite = "ALLONGE";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((r) => r.startsWith("mobilite_non_autorisee"))).toBe(true);
  });

  test("mobilité CIVIERE → JAMAIS éligible (règle critique)", () => {
    const t = transportOk();
    t.patient.mobilite = "CIVIERE";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((r) => r.startsWith("mobilite_non_autorisee"))).toBe(true);
  });

  test("mobilité FAUTEUIL_ROULANT → éligible", () => {
    const t = transportOk();
    t.patient.mobilite = "FAUTEUIL_ROULANT";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(true);
  });

  test("score < seuil par défaut (80) → non éligible", () => {
    const r = recoOk();
    r.bestRecommendation.score = 75;
    const res = evaluerEligibilite(transportOk(), r, {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((x) => x.startsWith("score_insuffisant"))).toBe(true);
  });

  test("seuil configurable abaissé à 70 → 75 devient éligible", () => {
    const r = recoOk();
    r.bestRecommendation.score = 75;
    const res = evaluerEligibilite(transportOk(), r, { scoreThreshold: 70 }, NOW);
    expect(res.eligible).toBe(true);
  });

  test("vehicleTypeMatch < 100 → non éligible", () => {
    const r = recoOk();
    r.bestRecommendation.criteriaScores.vehicleTypeMatch = 80;
    const res = evaluerEligibilite(transportOk(), r, {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((x) => x.startsWith("vehicleTypeMatch_imparfait"))).toBe(true);
  });

  test("risques présents → non éligible", () => {
    const r = recoOk();
    r.bestRecommendation.risks = ["Chauffeur en fin de service dans 30 min"];
    const res = evaluerEligibilite(transportOk(), r, {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((x) => x.startsWith("risques_presents"))).toBe(true);
  });

  test("véhicule candidat absent → non éligible", () => {
    const r = recoOk();
    delete r.bestRecommendation.vehiculeId;
    const res = evaluerEligibilite(transportOk(), r, {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons).toContain("candidat_sans_vehicule");
  });

  test("transport dans 10 min → délai insuffisant", () => {
    const t = transportOk();
    t.dateTransport = new Date(2026, 4, 24, 8, 10, 0);
    t.heureRDV = "08:10";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((x) => x.startsWith("delai_insuffisant"))).toBe(true);
  });

  test("transport dans 31 min → éligible (juste au-dessus du minLead)", () => {
    const t = transportOk();
    t.dateTransport = new Date(2026, 4, 24, 8, 31, 0);
    t.heureRDV = "08:31";
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(true);
  });

  test("minLeadMinutes configurable à 60 → 31 min devient insuffisant", () => {
    const t = transportOk();
    t.dateTransport = new Date(2026, 4, 24, 8, 31, 0);
    t.heureRDV = "08:31";
    const res = evaluerEligibilite(t, recoOk(), { minLeadMinutes: 60 }, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.some((x) => x.startsWith("delai_insuffisant"))).toBe(true);
  });

  test("date_transport absente → non éligible", () => {
    const t = transportOk();
    delete t.dateTransport;
    const res = evaluerEligibilite(t, recoOk(), {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons).toContain("date_transport_absente");
  });

  test("cumul : mobilité ALLONGE + score faible + déjà assigné → 3 raisons", () => {
    const t = transportOk();
    t.patient.mobilite = "ALLONGE";
    t.vehicule = "vX";
    const r = recoOk();
    r.bestRecommendation.score = 50;
    const res = evaluerEligibilite(t, r, {}, NOW);
    expect(res.eligible).toBe(false);
    expect(res.raisons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("autoDispatchService._resolveDateTransport", () => {
  test("combine date à minuit + heureRDV", () => {
    const dt = _resolveDateTransport({
      dateTransport: new Date(2026, 4, 24, 0, 0, 0),
      heureRDV: "14:30",
    });
    expect(dt.getHours()).toBe(14);
    expect(dt.getMinutes()).toBe(30);
  });

  test("retourne null si dateTransport absent", () => {
    expect(_resolveDateTransport({ heureRDV: "10:00" })).toBeNull();
  });

  test("garde l'heure de dateTransport si elle est déjà spécifiée", () => {
    const ref = new Date(2026, 4, 24, 9, 15, 0);
    const dt = _resolveDateTransport({ dateTransport: ref, heureRDV: "14:30" });
    expect(dt.getHours()).toBe(9);
    expect(dt.getMinutes()).toBe(15);
  });

  test("ignore heureRDV mal formée (date à minuit)", () => {
    const ref = new Date(2026, 4, 24, 0, 0, 0);
    const dt = _resolveDateTransport({ dateTransport: ref, heureRDV: "garbage" });
    expect(dt.getTime()).toBe(ref.getTime());
  });
});
