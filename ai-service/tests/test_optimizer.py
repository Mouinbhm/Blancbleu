"""
BlancBleu — Tests AI Transport Optimizer

Couvre :
  1. DurationPredictor  (ML + fallback rule-based)
  2. RealtimeOptimizer  (scoring + VRP + gains)
  3. Endpoints FastAPI  (/predict/duree, /optimize/realtime, /model/metrics, /optimizer/stats)

Fonctionne en CI avec les mêmes mocks que test_ia.py.
Le modèle est entraîné une seule fois (scope="session") sur 300 échantillons.
"""

import os
import sys
from unittest.mock import MagicMock, patch

# ── Mocks imports lourds (identique à test_ia.py) ────────────────────────────
if "pytesseract" not in sys.modules:
    _tess = MagicMock()
    _tess.get_tesseract_version.side_effect = Exception("Tesseract non disponible en CI")
    sys.modules["pytesseract"]            = _tess
    sys.modules["pytesseract.pytesseract"] = _tess

if "spacy" not in sys.modules:
    sys.modules["spacy"] = MagicMock()

if "pdf2image" not in sys.modules:
    sys.modules["pdf2image"] = MagicMock()

if "ortools" not in sys.modules:
    sys.modules["ortools"] = MagicMock()
    sys.modules["ortools.constraint_solver"] = MagicMock()

import pytest
from starlette.testclient import TestClient

from services.duration_predictor  import DurationPredictor
from services.realtime_optimizer  import RealtimeOptimizer
from main import app


# ═══════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def transport_vsl_assis() -> dict:
    return {
        "distance_km":          12.5,
        "heure_depart":         8,
        "jour_semaine":         0,
        "mobilite":             "ASSIS",
        "type_vehicule":        "VSL",
        "type_etablissement":   "hopital_public",
        "motif":                "Consultation",
        "aller_retour":         False,
        "nb_patients":          1,
        "experience_chauffeur": 0.7,
    }


@pytest.fixture(scope="session")
def vehicule_disponible() -> dict:
    return {
        "id":          "V001",
        "type":        "VSL",
        "lat":         43.7102,
        "lon":         7.2620,
        "statut":      "disponible",
        "ponctualite": 0.85,
    }


@pytest.fixture(scope="session")
def trained_predictor(tmp_path_factory):
    """
    Entraîne le modèle une seule fois (300 échantillons, seed=42).
    Utilisé par tous les tests DurationPredictor et les endpoints.
    """
    from data.generate_dataset import generer_dataset, preprocess

    tmp_dir    = tmp_path_factory.mktemp("model")
    model_path = str(tmp_dir / "test_model.pkl")

    df = generer_dataset(n=300, seed=42)
    df_processed = preprocess(df)

    predictor = DurationPredictor(model_path=model_path)
    predictor.train(df_processed)
    return predictor


@pytest.fixture(scope="session")
def optimizer(trained_predictor) -> RealtimeOptimizer:
    return RealtimeOptimizer(trained_predictor)


@pytest.fixture(scope="session")
def optimizer_client(trained_predictor):
    """TestClient avec le predictor entraîné injecté dans app.state.
    Envoie le token service-to-service (routes /optimizer protégées par le guard)."""
    with TestClient(app, raise_server_exceptions=False) as c:
        c.headers.update({"X-Service-Token": os.environ["AI_SERVICE_TOKEN"]})
        app.state.predictor = trained_predictor
        app.state.optimizer = RealtimeOptimizer(trained_predictor)
        yield c


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 1 — DurationPredictor
# ═══════════════════════════════════════════════════════════════════════════════

class TestDurationPredictor:

    def test_predict_retourne_duree_positive(self, trained_predictor, transport_vsl_assis):
        result = trained_predictor.predict(transport_vsl_assis)
        assert result["duree_minutes"] > 0

    def test_predict_duree_fauteuil_superieure_assis(self, trained_predictor):
        """Fauteuil roulant doit avoir une durée > ASSIS à distance égale."""
        base = {
            "distance_km": 10.0, "heure_depart": 10, "jour_semaine": 2,
            "type_vehicule": "VSL", "type_etablissement": "hopital_public",
            "aller_retour": False, "nb_patients": 1, "experience_chauffeur": 0.5,
        }
        assis    = trained_predictor.predict({**base, "mobilite": "ASSIS"})
        fauteuil = trained_predictor.predict({**base, "mobilite": "FAUTEUIL_ROULANT"})
        assert fauteuil["duree_minutes"] > assis["duree_minutes"]

    def test_predict_heure_pointe_superieure_heure_creuse(self, trained_predictor):
        """Heure 8 (pointe) doit être > heure 14 (creuse) à distance égale."""
        base = {
            "distance_km": 15.0, "jour_semaine": 2, "mobilite": "ASSIS",
            "type_vehicule": "VSL", "type_etablissement": "clinique_privee",
            "aller_retour": False, "nb_patients": 1, "experience_chauffeur": 0.5,
        }
        pointe = trained_predictor.predict({**base, "heure_depart": 8})
        creuse = trained_predictor.predict({**base, "heure_depart": 14})
        assert pointe["duree_minutes"] > creuse["duree_minutes"]

    def test_predict_contient_contributions_shap(self, trained_predictor, transport_vsl_assis):
        result = trained_predictor.predict(transport_vsl_assis)
        assert "contributions" in result
        assert len(result["contributions"]) > 0
        first = result["contributions"][0]
        assert "feature" in first
        assert "impact"  in first
        assert "valeur"  in first

    def test_predict_contient_heure_fin_estimee(self, trained_predictor, transport_vsl_assis):
        result = trained_predictor.predict(transport_vsl_assis)
        assert "heure_fin_estimee" in result
        # Format HH:MM
        hef = result["heure_fin_estimee"]
        parts = hef.split(":")
        assert len(parts) == 2
        assert 0 <= int(parts[0]) <= 23
        assert 0 <= int(parts[1]) <= 59

    def test_predict_confiance_haute_si_donnees_completes(self, trained_predictor, transport_vsl_assis):
        result = trained_predictor.predict(transport_vsl_assis)
        assert result["confiance"] == "HAUTE"

    def test_predict_aller_retour_double_duree(self, trained_predictor):
        """aller_retour=True doit produire une durée > 1.8× l'aller simple."""
        base = {
            "distance_km": 20.0, "heure_depart": 10, "jour_semaine": 2,
            "mobilite": "ASSIS", "type_vehicule": "VSL",
            "type_etablissement": "hopital_public",
            "nb_patients": 1, "experience_chauffeur": 0.5,
        }
        aller_simple  = trained_predictor.predict({**base, "aller_retour": False})
        aller_retour  = trained_predictor.predict({**base, "aller_retour": True})
        assert aller_retour["duree_minutes"] > aller_simple["duree_minutes"] * 1.8


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 2 — RealtimeOptimizer
# ═══════════════════════════════════════════════════════════════════════════════

class TestRealtimeOptimizer:

    def test_nouvelle_demande_retourne_solution(self, optimizer, transport_vsl_assis, vehicule_disponible):
        result = optimizer.nouvelle_demande(transport_vsl_assis, [vehicule_disponible])
        assert "solution"   in result
        assert "affectations" in result
        assert "gains"      in result

    def test_nouvelle_demande_incremente_compteur(self, optimizer, transport_vsl_assis, vehicule_disponible):
        avant = optimizer.etat.nb_reoptimisations
        optimizer.nouvelle_demande(transport_vsl_assis, [vehicule_disponible])
        assert optimizer.etat.nb_reoptimisations == avant + 1

    def test_gains_km_positifs(self, optimizer, transport_vsl_assis, vehicule_disponible):
        result = optimizer.nouvelle_demande(transport_vsl_assis, [vehicule_disponible])
        assert result["gains"]["km_economises"] >= 0
        assert result["gains"]["minutes_attente_economisees"] >= 0

    def test_temps_calcul_inferieur_500ms(self, optimizer, transport_vsl_assis, vehicule_disponible):
        result = optimizer.nouvelle_demande(transport_vsl_assis, [vehicule_disponible])
        assert result["temps_calcul_ms"] < 500

    def test_stats_retourne_dict_valide(self, optimizer):
        stats = optimizer.get_stats()
        assert "nb_reoptimisations"     in stats
        assert "km_economises_total"    in stats
        assert "transports_en_attente"  in stats
        assert "vehicules_disponibles"  in stats


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 3 — Endpoints FastAPI
# ═══════════════════════════════════════════════════════════════════════════════

class TestOptimizerEndpoints:

    def test_predict_duree_200(self, optimizer_client, transport_vsl_assis):
        res = optimizer_client.post("/optimizer/predict/duree", json=transport_vsl_assis)
        assert res.status_code == 200

    def test_predict_duree_valeurs_valides(self, optimizer_client, transport_vsl_assis):
        res = optimizer_client.post("/optimizer/predict/duree", json=transport_vsl_assis)
        assert res.status_code == 200
        body = res.json()
        assert body["duree_minutes"] > 0
        assert body["duree_min"] <= body["duree_minutes"]
        assert body["duree_max"] >= body["duree_minutes"]
        assert body["confiance"] in ("HAUTE", "MOYENNE", "FAIBLE")
        assert ":" in body["heure_fin_estimee"]

    def test_model_metrics_endpoint(self, optimizer_client):
        res = optimizer_client.get("/optimizer/model/metrics")
        assert res.status_code == 200
        body = res.json()
        # Soit les métriques du modèle, soit le message "non entraîné"
        assert "modeles" in body or "status" in body

    def test_optimizer_stats_endpoint(self, optimizer_client):
        res = optimizer_client.get("/optimizer/optimizer/stats")
        assert res.status_code == 200
        body = res.json()
        assert "nb_reoptimisations"  in body
        assert "km_economises_total" in body
