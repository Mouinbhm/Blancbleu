"""
Sprint 4 — tests dispatch_scorer avec poids dynamiques (request.weights).

Vérifie que :
  - sans weights, le scorer retombe sur DEFAULT_SCORING_WEIGHTS
  - avec weights valides, ils sont appliqués et impactent finalScore
  - weights invalides (clés manquantes / somme != 1.0 / non-numérique)
    sont silencieusement ignorés (fallback DEFAULT)
  - changer drastiquement les poids change le classement des candidats
"""

from services.dispatch_scorer import (
    DEFAULT_SCORING_WEIGHTS,
    _resolve_weights,
    _score_pondere,
    recommander,
)
from schemas.dispatch_schemas import (
    DispatchRequest, TransportDispatch, VehiculeDispatch, ChauffeurDispatch,
    CapacitesVehicule, Position,
)


# ── _resolve_weights ──────────────────────────────────────────────────────────

class TestResolveWeights:
    def test_no_weights_returns_default(self):
        w, src = _resolve_weights(None)
        assert w == DEFAULT_SCORING_WEIGHTS
        assert src == "default"

    def test_empty_dict_returns_default(self):
        w, src = _resolve_weights({})
        assert w == DEFAULT_SCORING_WEIGHTS
        assert src == "default"

    def test_missing_keys_fallback(self):
        # Manque 'punctualityHistory' → fallback
        partial = {k: v for k, v in DEFAULT_SCORING_WEIGHTS.items() if k != "punctualityHistory"}
        w, src = _resolve_weights(partial)
        assert src == "default"

    def test_sum_off_fallback(self):
        bad = {**DEFAULT_SCORING_WEIGHTS, "distance": 0.99}  # somme > 1
        w, src = _resolve_weights(bad)
        assert src == "default"

    def test_valid_weights_used(self):
        custom = {
            "distance":           0.10,
            "driverAvailability": 0.10,
            "vehicleTypeMatch":   0.60,  # boost compatibilité
            "planningLoad":       0.10,
            "traffic":            0.05,
            "medicalPriority":    0.025,
            "punctualityHistory": 0.025,
        }
        w, src = _resolve_weights(custom)
        assert src == "request"
        assert w["vehicleTypeMatch"] == 0.60
        assert sum(w.values()) == 1.0


# ── _score_pondere ────────────────────────────────────────────────────────────

class TestScorePondere:
    def test_default_when_no_weights(self):
        scores = {k: 80 for k in DEFAULT_SCORING_WEIGHTS}
        # 80 * sum(weights=1.0) = 80
        assert _score_pondere(scores) == 80

    def test_custom_weights_change_total(self):
        scores = {
            "distance":           100,
            "driverAvailability": 0,
            "vehicleTypeMatch":   0,
            "planningLoad":       0,
            "traffic":            0,
            "medicalPriority":    0,
            "punctualityHistory": 0,
        }
        # Par défaut : distance pèse 25 % → score = 25
        assert _score_pondere(scores) == 25
        # Avec weights custom donnant 100 % à distance → score = 100
        w_only_distance = {k: 0.0 for k in DEFAULT_SCORING_WEIGHTS}
        w_only_distance["distance"] = 1.0
        assert _score_pondere(scores, w_only_distance) == 100


# ── Bout-en-bout : weights changent le classement ─────────────────────────────

def _make_basic_request(weights=None):
    """Transport ASSIS + 2 VSL : V_near (proche) et V_loaded (chargé)."""
    transport = TransportDispatch(
        _id="t1",
        mobilite="ASSIS",
        positionDepart=Position(lat=43.7, lng=7.26),
        oxygene=False,
        brancardage=False,
    )
    # V_near : très proche, mais chargé (5 missions du jour)
    v_near = VehiculeDispatch(
        _id="v_near",
        immatriculation="AA-001",
        type="VSL",
        statut="Disponible",
        position=Position(lat=43.701, lng=7.261),
        capacites=CapacitesVehicule(),
        nbTransportsDuJour=5,
        chargeScore=20,
        ponctualite=80,
    )
    # V_loaded : plus loin, mais peu chargé (1 mission)
    v_loaded = VehiculeDispatch(
        _id="v_loaded",
        immatriculation="BB-002",
        type="VSL",
        statut="Disponible",
        position=Position(lat=43.85, lng=7.50),
        capacites=CapacitesVehicule(),
        nbTransportsDuJour=1,
        chargeScore=90,
        ponctualite=80,
    )
    return DispatchRequest(transport=transport, vehicules=[v_near, v_loaded], weights=weights)


def test_distance_dominante_favorise_le_proche():
    """Poids 100 % distance → V_near gagne (très proche)."""
    weights = {k: 0.0 for k in DEFAULT_SCORING_WEIGHTS}
    weights["distance"] = 1.0
    res = recommander(_make_basic_request(weights=weights))
    assert res.bestRecommendation.vehiculeId == "v_near"


def test_charge_planning_dominante_favorise_le_libre():
    """Poids 100 % planningLoad → V_loaded (chargeScore 90/100, peu chargé) gagne."""
    weights = {k: 0.0 for k in DEFAULT_SCORING_WEIGHTS}
    weights["planningLoad"] = 1.0
    res = recommander(_make_basic_request(weights=weights))
    assert res.bestRecommendation.vehiculeId == "v_loaded"


def test_default_weights_via_no_weights_param():
    """Sans weights, response.weights == DEFAULT."""
    res = recommander(_make_basic_request(weights=None))
    assert res.weights == DEFAULT_SCORING_WEIGHTS


def test_custom_weights_returned_in_response():
    """Avec weights custom valides, response.weights reflète le custom."""
    custom = {
        "distance":           0.5,
        "driverAvailability": 0.1,
        "vehicleTypeMatch":   0.1,
        "planningLoad":       0.1,
        "traffic":            0.1,
        "medicalPriority":    0.05,
        "punctualityHistory": 0.05,
    }
    res = recommander(_make_basic_request(weights=custom))
    assert res.weights == custom
