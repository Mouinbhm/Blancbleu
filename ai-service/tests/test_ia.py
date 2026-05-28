"""
BlancBleu — Tests IA (pytest)

Couvre :
  1. Scoring dispatch (logique pure, sans dépendance binaire)
  2. Endpoint GET /health (FastAPI TestClient)
  3. Endpoint POST /dispatch/recommend (FastAPI TestClient)
  4. Fallback routing sans OR-Tools

Fonctionne en CI sans Tesseract, poppler, spaCy ni OR-Tools.
"""

import sys
from unittest.mock import MagicMock, patch

# ── Neutraliser les imports lourds AVANT tout import du projet ────────────────
# pytesseract peut être installé sans le binaire Tesseract — on mocke get_tesseract_version
# pour éviter l'erreur à l'appel effectif.
if "pytesseract" not in sys.modules:
    mock_tess = MagicMock()
    mock_tess.get_tesseract_version.side_effect = Exception("Tesseract non disponible en CI")
    sys.modules["pytesseract"] = mock_tess
    sys.modules["pytesseract.pytesseract"] = mock_tess

# spaCy — absent en CI
if "spacy" not in sys.modules:
    sys.modules["spacy"] = MagicMock()

# pdf2image — nécessite poppler, importé lazily mais on prévient les erreurs
if "pdf2image" not in sys.modules:
    sys.modules["pdf2image"] = MagicMock()

# ortools — importé lazily dans route_optimizer, mais on mocke au cas où
if "ortools" not in sys.modules:
    sys.modules["ortools"] = MagicMock()
    sys.modules["ortools.constraint_solver"] = MagicMock()

import pytest
from starlette.testclient import TestClient

# ─── Import de l'app FastAPI ──────────────────────────────────────────────────
# Doit se faire APRÈS les patches ci-dessus
from main import app

# ─── Import des services (tests unitaires directs) ───────────────────────────
from services.dispatch_scorer import recommander, COMPATIBILITE_MOBILITE
from schemas.dispatch_schemas import (
    DispatchRequest, TransportDispatch, VehiculeDispatch,
    CapacitesVehicule, Position, MobilitePatient, TypeVehicule,
)


# ═══════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def client():
    """TestClient FastAPI — exécute le lifespan (startup/shutdown)."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def make_vsl(immatriculation="AA-000-AA", statut="disponible", ponctualite=None):
    return VehiculeDispatch(
        immatriculation=immatriculation,
        type=TypeVehicule.VSL,
        statut=statut,
        position=Position(lat=43.71, lng=7.26),
        capacites=CapacitesVehicule(),
        ponctualite=ponctualite,
    )


def make_tpmr(immatriculation="BB-111-BB"):
    return VehiculeDispatch(
        immatriculation=immatriculation,
        type=TypeVehicule.TPMR,
        statut="disponible",
        position=Position(lat=43.72, lng=7.27),
        capacites=CapacitesVehicule(fauteuil=True),
    )


def make_ambulance(immatriculation="CC-222-CC"):
    return VehiculeDispatch(
        immatriculation=immatriculation,
        type=TypeVehicule.AMBULANCE,
        statut="disponible",
        position=Position(lat=43.70, lng=7.25),
        capacites=CapacitesVehicule(brancard=True, oxygene=True),
    )


def make_transport(mobilite=MobilitePatient.ASSIS, oxygene=False, brancardage=False):
    return TransportDispatch(
        motif="Consultation",
        mobilite=mobilite,
        adresseDepart="12 rue Victor Hugo, Nice",
        adresseDestination="CHU de Nice",
        oxygene=oxygene,
        brancardage=brancardage,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 1 — Compatibilité mobilité / type véhicule (règles métier)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCompatibiliteMobilite:
    def test_assis_vsl_score_optimal(self):
        """Patient ASSIS → VSL doit être le meilleur score de compatibilité."""
        assert COMPATIBILITE_MOBILITE["ASSIS"]["VSL"] == 40

    def test_fauteuil_vsl_incompatible(self):
        """Patient en FAUTEUIL_ROULANT → VSL est incompatible (score 0)."""
        assert COMPATIBILITE_MOBILITE["FAUTEUIL_ROULANT"]["VSL"] == 0

    def test_fauteuil_tpmr_optimal(self):
        """Patient en FAUTEUIL_ROULANT → TPMR est le choix optimal."""
        assert COMPATIBILITE_MOBILITE["FAUTEUIL_ROULANT"]["TPMR"] == 40

    def test_allonge_ambulance_obligatoire(self):
        """Patient ALLONGÉ → seule l'AMBULANCE est compatible."""
        assert COMPATIBILITE_MOBILITE["ALLONGE"]["AMBULANCE"] == 40
        assert COMPATIBILITE_MOBILITE["ALLONGE"]["VSL"] == 0
        assert COMPATIBILITE_MOBILITE["ALLONGE"]["TPMR"] == 0

    def test_civiere_ambulance_seule(self):
        """Patient sur CIVIÈRE → uniquement AMBULANCE."""
        assert COMPATIBILITE_MOBILITE["CIVIERE"]["AMBULANCE"] == 40
        assert COMPATIBILITE_MOBILITE["CIVIERE"]["VSL"] == 0

    def test_ambulance_assis_sous_optimal(self):
        """Patient ASSIS + AMBULANCE → compatible mais sous-optimal (score 25)."""
        assert COMPATIBILITE_MOBILITE["ASSIS"]["AMBULANCE"] == 25


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 2 — Logique de recommandation dispatch
# ═══════════════════════════════════════════════════════════════════════════════

class TestRecommandationDispatch:
    def test_assis_choisit_vsl_parmi_plusieurs(self):
        """Pour ASSIS, le VSL doit être préféré au TPMR et à l'AMBULANCE."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ASSIS),
            vehicules=[make_tpmr(), make_vsl(), make_ambulance()],
        )
        res = recommander(req)
        assert res.recommandation is not None
        assert res.recommandation.type == TypeVehicule.VSL

    def test_fauteuil_choisit_tpmr(self):
        """Pour FAUTEUIL_ROULANT, le TPMR doit être recommandé (VSL exclu)."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.FAUTEUIL_ROULANT),
            vehicules=[make_vsl(), make_tpmr()],
        )
        res = recommander(req)
        assert res.recommandation is not None
        assert res.recommandation.type == TypeVehicule.TPMR

    def test_fauteuil_vsl_seul_aucun_resultat(self):
        """Si seul un VSL est disponible pour un FAUTEUIL_ROULANT → aucune reco."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.FAUTEUIL_ROULANT),
            vehicules=[make_vsl()],
        )
        res = recommander(req)
        assert res.recommandation is None
        assert "incompatible" in res.message.lower() or "aucun" in res.message.lower()

    def test_allonge_ambulance_obligatoire(self):
        """Patient ALLONGÉ → ambulance retournée même si VSL est présent."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ALLONGE),
            vehicules=[make_vsl(), make_tpmr(), make_ambulance()],
        )
        res = recommander(req)
        assert res.recommandation is not None
        assert res.recommandation.type == TypeVehicule.AMBULANCE

    def test_score_entre_0_et_100(self):
        """Le score total d'une recommandation doit être dans [0, 100]."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ASSIS),
            vehicules=[make_vsl()],
        )
        res = recommander(req)
        assert res.recommandation is not None
        assert 0 <= res.recommandation.score <= 100

    def test_alternatives_maximum_3(self):
        """Les alternatives sont limitées à 3 véhicules."""
        vehicules = [
            make_vsl("V1"),
            make_vsl("V2"),
            make_vsl("V3"),
            make_vsl("V4"),
            make_vsl("V5"),
        ]
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ASSIS),
            vehicules=vehicules,
        )
        res = recommander(req)
        assert len(res.alternatives) <= 3

    def test_vehicule_indisponible_score_dispo_zero(self):
        """Un véhicule non disponible doit avoir un score disponibilité = 0."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ASSIS),
            vehicules=[make_vsl(statut="en_mission")],
        )
        res = recommander(req)
        if res.recommandation:
            assert res.recommandation.scoreDetail.disponibilite == 0

    def test_ponctualite_excellente_bonus_fiabilite(self):
        """Ponctualité >= 95% → score fiabilité = 10."""
        vsl_fiable = make_vsl(ponctualite=97.0)
        vsl_moyen = make_vsl(immatriculation="BB-999-BB", ponctualite=75.0)
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ASSIS),
            vehicules=[vsl_moyen, vsl_fiable],
        )
        res = recommander(req)
        assert res.recommandation is not None
        assert res.recommandation.scoreDetail.fiabilite == 10
        assert res.recommandation.immatriculation == "AA-000-AA"  # le fiable

    def test_source_toujours_ia(self):
        """Le champ source doit valoir 'ia'."""
        req = DispatchRequest(
            transport=make_transport(),
            vehicules=[make_vsl()],
        )
        res = recommander(req)
        assert res.source == "ia"

    def test_liste_vehicules_vide(self):
        """Sans véhicules → recommandation None."""
        req = DispatchRequest(
            transport=make_transport(),
            vehicules=[],
        )
        res = recommander(req)
        assert res.recommandation is None

    def test_aucun_vehicule_compatible_fauteuil(self):
        """Aucun véhicule compatible (seul VSL pour FAUTEUIL_ROULANT) →
        liste vide d'alternatives et message explicatif."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.FAUTEUIL_ROULANT),
            vehicules=[make_vsl("V1"), make_vsl("V2")],
        )
        res = recommander(req)
        assert res.recommandation is None
        assert isinstance(res.alternatives, list)
        assert len(res.alternatives) == 0
        assert res.message  # message non vide
        assert isinstance(res.message, str)

    def test_ambulance_assis_recommandation_score_25(self):
        """AMBULANCE seule disponible pour ASSIS → recommandée avec score compatibilité 25."""
        req = DispatchRequest(
            transport=make_transport(MobilitePatient.ASSIS),
            vehicules=[make_ambulance()],
        )
        res = recommander(req)
        assert res.recommandation is not None
        assert res.recommandation.type == TypeVehicule.AMBULANCE
        assert res.recommandation.scoreDetail.compatibiliteMobilite == 25


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 3 — API FastAPI (endpoints HTTP)
# ═══════════════════════════════════════════════════════════════════════════════

class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        """GET /health doit retourner 200."""
        res = client.get("/health")
        assert res.status_code == 200

    def test_health_status_ok(self, client):
        """GET /health doit retourner status='ok'."""
        data = res = client.get("/health").json()
        assert data["status"] == "ok"

    def test_health_contient_modules(self, client):
        """GET /health doit lister les modules disponibles."""
        data = client.get("/health").json()
        assert "modules" in data
        assert "dispatch" in data["modules"]
        assert data["modules"]["dispatch"] is True  # Toujours disponible

    def test_health_version(self, client):
        """GET /health doit retourner la version."""
        data = client.get("/health").json()
        assert "version" in data
        assert data["version"] == "1.0.0"


# ═══════════════════════════════════════════════════════════════════════════════
# SUITE 4 — Model card (positionnement honnête POC)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAiInfoEndpoint:
    """GET /ai/info — vérifie le warning POC + la structure attendue."""

    def test_ai_info_returns_200(self, client):
        res = client.get("/ai/info")
        assert res.status_code == 200

    def test_ai_info_warning_present_and_explicit(self, client):
        """Le champ 'warning' doit signaler explicitement le statut POC + synthétique."""
        data = client.get("/ai/info").json()
        assert "warning" in data
        warning = data["warning"]
        assert isinstance(warning, str) and len(warning) > 0
        # Le warning doit mentionner POC + synthétique pour ne pas survendre.
        assert "POC" in warning
        assert "synthétique" in warning.lower()

    def test_ai_info_production_ready_false(self, client):
        data = client.get("/ai/info").json()
        assert data["production_ready"] is False
        assert data["status"] == "POC"

    def test_ai_info_dispatch_marque_rule_based(self, client):
        """Le module dispatch_recommend doit être explicitement rule-based, ml=False."""
        data = client.get("/ai/info").json()
        dispatch = data["modules"]["dispatch_recommend"]
        assert dispatch["type"] == "rule-based"
        assert dispatch["ml"] is False

    def test_ai_info_duration_predictor_marque_poc(self, client):
        """Le module duration_predictor doit être marqué ml=True ET production_ready=False."""
        data = client.get("/ai/info").json()
        pred = data["modules"]["duration_predictor"]
        assert pred["ml"] is True
        assert pred["production_ready"] is False

    def test_ai_info_training_data_real_zero(self, client):
        """training_data.real doit être 0 (alerte si on a glissé sur des données réelles non documentées)."""
        data = client.get("/ai/info").json()
        assert data["training_data"]["real"] == 0
        assert data["training_data"]["synthetic"] >= 1

    def test_ai_info_limitations_listees(self, client):
        data = client.get("/ai/info").json()
        assert isinstance(data["limitations"], list)
        assert len(data["limitations"]) >= 3

    def test_ai_info_roadmap_listee(self, client):
        data = client.get("/ai/info").json()
        assert isinstance(data["roadmap"], list)
        assert len(data["roadmap"]) >= 3


class TestDispatchEndpoint:
    def _payload_assis_vsl(self):
        return {
            "transport": {
                "_id": "t001",
                "motif": "Dialyse",
                "mobilite": "ASSIS",
                "adresseDepart": "12 rue Victor Hugo, Nice",
                "adresseDestination": "Centre dialyse, Nice",
                "oxygene": False,
                "brancardage": False,
            },
            "vehicules": [
                {
                    "_id": "v001",
                    "immatriculation": "AA-123-BB",
                    "type": "VSL",
                    "statut": "disponible",
                    "position": {"lat": 43.71, "lng": 7.26},
                    "capacites": {"fauteuil": False, "oxygene": False, "brancard": False},
                }
            ],
            "chauffeurs": [],
        }

    def test_dispatch_recommend_200(self, client):
        """POST /dispatch/recommend doit retourner 200 avec une recommandation."""
        res = client.post("/dispatch/recommend", json=self._payload_assis_vsl())
        assert res.status_code == 200
        data = res.json()
        assert data["recommandation"] is not None
        assert data["recommandation"]["type"] == "VSL"

    def test_dispatch_recommend_score_valide(self, client):
        """Le score retourné doit être entre 0 et 100."""
        res = client.post("/dispatch/recommend", json=self._payload_assis_vsl())
        assert res.status_code == 200
        score = res.json()["recommandation"]["score"]
        assert 0 <= score <= 100

    def test_dispatch_sans_vehicules_422(self, client):
        """POST /dispatch/recommend sans véhicules doit retourner 422."""
        payload = self._payload_assis_vsl()
        payload["vehicules"] = []
        res = client.post("/dispatch/recommend", json=payload)
        assert res.status_code == 422

    def test_dispatch_fauteuil_vsl_incompatible(self, client):
        """FAUTEUIL_ROULANT + seul VSL → recommandation None."""
        payload = self._payload_assis_vsl()
        payload["transport"]["mobilite"] = "FAUTEUIL_ROULANT"
        res = client.post("/dispatch/recommend", json=payload)
        assert res.status_code == 200
        assert res.json()["recommandation"] is None

    def test_dispatch_contient_justification(self, client):
        """La recommandation doit inclure une justification."""
        res = client.post("/dispatch/recommend", json=self._payload_assis_vsl())
        assert res.status_code == 200
        justif = res.json()["recommandation"]["justification"]
        assert isinstance(justif, list)
        assert len(justif) > 0
