"""
BlancBleu — Microservice IA Python v1.0
Transport sanitaire NON urgent

Point d'entrée FastAPI.
Port : 5002 (différent de l'ancien Flask sur 5001)

Modules :
  - /pmt      → Extraction PMT par OCR (Tesseract + regex + spaCy)
  - /dispatch → Recommandation véhicule/chauffeur (scoring métier)
  - /routing  → Optimisation de tournée (Google OR-Tools VRP)

Lancement :
  uvicorn main:app --host 0.0.0.0 --port 5002 --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path

from routes.pmt       import router as pmt_router
from routes.dispatch  import router as dispatch_router
from routes.routing   import router as routing_router
from routes.optimizer import router as optimizer_router

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("blancbleu.ai")


# ─── Lifespan (startup / shutdown) ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BlancBleu AI Service démarrage...")

    # ── Configurer Tesseract (chemin Windows + TESSDATA_PREFIX) ──────────────
    # ocr_utils applique déjà la config — on importe pour déclencher le module
    try:
        from utils import ocr_utils as _ocr  # noqa: F401 — effet de bord voulu
        import pytesseract
        import os
        from pathlib import Path

        version = pytesseract.get_tesseract_version()
        logger.info(f"✅ Tesseract OCR chargé — version {version}")

        # Vérifier les fichiers de langue un par un
        tessdata_prefix = os.environ.get("TESSDATA_PREFIX", "")
        tessdata_dir = Path(tessdata_prefix) if tessdata_prefix else None

        fra_ok = tessdata_dir and (tessdata_dir / "fra.traineddata").exists()
        eng_ok = tessdata_dir and (tessdata_dir / "eng.traineddata").exists()

        if fra_ok:
            logger.info("✅ Langue française (fra) disponible")
        else:
            logger.warning(
                "⚠️  fra.traineddata absent — l'OCR PMT ne fonctionnera pas.\n"
                "    Téléchargez le fichier de langue avec :\n"
                "    python scripts/download_tessdata.py"
            )

        if eng_ok:
            logger.info("✅ Langue anglaise (eng) disponible")
        else:
            logger.info("ℹ️  eng.traineddata absent (optionnel)")

        # Le module OCR est opérationnel seulement si fra.traineddata est présent
        app.state.pmt_ocr = bool(fra_ok)

    except Exception as e:
        logger.warning(f"⚠️  Tesseract OCR non disponible : {e}")
        app.state.pmt_ocr = False

    # ── Pré-charger spaCy pour éviter le délai au premier appel ──────────────
    try:
        import spacy
        app.state.nlp = spacy.load("fr_core_news_sm")
        logger.info("Modèle spaCy fr_core_news_sm chargé")
    except (ImportError, OSError):
        logger.warning(
            "Modèle spaCy non disponible (module absent ou modèle fr_core_news_sm non trouvé). "
            "Installez-le avec : pip install spacy && python -m spacy download fr_core_news_sm"
        )
        app.state.nlp = None

    # ── Charger le DurationPredictor ─────────────────────────────────────────
    from services.duration_predictor import DurationPredictor
    from services.realtime_optimizer import RealtimeOptimizer

    predictor = DurationPredictor()
    loaded    = predictor.load()
    if not loaded:
        logger.warning("Modèle non trouvé — lancer POST /optimizer/model/train")
    app.state.predictor = predictor
    app.state.optimizer = RealtimeOptimizer(predictor)

    yield
    logger.info("BlancBleu AI Service arrêt.")


# ─── Application ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="BlancBleu AI Service",
    description="Microservice IA local pour transport sanitaire non urgent",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — origines lues depuis ALLOWED_ORIGINS (séparées par virgule)
# En production, définir ALLOWED_ORIGINS dans le .env ou docker-compose.yml
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5000,http://localhost:3000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

# ─── Inclusion des routes ─────────────────────────────────────────────────────
app.include_router(pmt_router,       prefix="/pmt",       tags=["PMT"])
app.include_router(dispatch_router,  prefix="/dispatch",  tags=["Dispatch"])
app.include_router(routing_router,   prefix="/routing",   tags=["Routing"])
app.include_router(optimizer_router, prefix="/optimizer", tags=["Optimizer"])


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Système"])
async def health():
    """Vérifie la disponibilité du service et de ses modules."""
    import importlib

    modules = {}

    # Tesseract — utiliser l'état détecté au démarrage
    modules["pmt_ocr"] = getattr(app.state, "pmt_ocr", False)

    # spaCy
    modules["pmt_nlp"] = app.state.nlp is not None

    # OR-Tools
    try:
        importlib.import_module("ortools")
        modules["routing"] = True
    except ImportError:
        modules["routing"] = False

    modules["dispatch"] = True  # Toujours disponible (règles locales)

    # Duration predictor + realtime optimizer
    predictor = getattr(app.state, "predictor", None)
    modules["duration_predictor"] = predictor is not None and predictor.model is not None
    optimizer = getattr(app.state, "optimizer", None)
    modules["realtime_optimizer"] = optimizer is not None

    return {
        "status": "ok",
        "version": "1.0.0",
        "domaine": "transport sanitaire non urgent",
        "modules": modules,
    }


# ─── Model card / AI info (positionnement honnete) ───────────────────────────
# Cf. ai-service/MODEL_CARD.md — toute MAJ de ce dict doit s'y refleter.
_MODEL_CARD_PATH = Path(__file__).parent / "MODEL_CARD.md"
_METRICS_PATH    = Path(__file__).parent / "model" / "metrics.json"


@app.get("/ai/info", tags=["Système"])
async def ai_info():
    """
    Renvoie la model card du microservice en JSON. Position officielle :
    le scoring de dispatch est rule-based, le predicteur de duree est un POC
    entraine sur donnees synthetiques. A consulter avant d'integrer le service
    comme aide a la decision en production.

    Source de verite humaine : ai-service/MODEL_CARD.md (le markdown brut est
    inclus dans la reponse sous la cle `model_card_md`).
    """
    # Metriques + composition data depuis metrics.json (peut etre absent si
    # le modele n'a pas encore ete entraine).
    metrics = None
    training_data = {"real": 0, "synthetic": 0}
    metrics_warning = None
    try:
        with _METRICS_PATH.open("r", encoding="utf-8") as f:
            raw = json.load(f)
        metrics = raw.get("modeles")
        training_data = raw.get("data_composition", training_data)
        metrics_warning = raw.get("warning")
    except FileNotFoundError:
        pass
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("ai/info : metrics.json illisible (%s)", exc)

    # Contenu markdown brut (best-effort : si le fichier est absent, on
    # degrade sans crasher).
    model_card_md = None
    try:
        model_card_md = _MODEL_CARD_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("ai/info : MODEL_CARD.md absent")
    except OSError as exc:
        logger.warning("ai/info : MODEL_CARD.md illisible (%s)", exc)

    return {
        "status": "POC",
        "production_ready": False,
        "warning": (
            "POC NON DESTINÉ À LA PRODUCTION — le scoring de dispatch est "
            "rule-based (système expert pondéré, 0% ML), et le prédicteur de "
            "durée est entraîné sur 1500 transports synthétiques (0 réels). "
            "Cf. MODEL_CARD.md pour la roadmap production."
        ),
        "modules": {
            "dispatch_recommend": {
                "type": "rule-based",
                "description": "Système expert pondéré (7 critères, poids fixes)",
                "ml": False,
            },
            "duration_predictor": {
                "type": "ml",
                "algorithm": "XGBoost",
                "description": "POC entraîné sur données synthétiques",
                "ml": True,
                "production_ready": False,
            },
            "pmt_extract": {
                "type": "ocr",
                "description": "Tesseract OCR + regex + spaCy",
                "ml": False,
            },
            "routing_optimize": {
                "type": "or-tools",
                "description": "Google OR-Tools VRP (déterministe)",
                "ml": False,
            },
        },
        "training_data": training_data,
        "metrics": metrics,
        "metrics_warning": metrics_warning,
        "limitations": [
            "Biais d'entraînement inconnu (données synthétiques à dire d'expert)",
            "Pas de drift monitoring (ni Evidently, ni MLflow)",
            "Pas de feature store, pas de versioning d'expériences",
            "Pas d'explicabilité ML contractualisée côté API (SHAP non exposé)",
            "Dispatch scoring : 100 % rule-based — pas d'adaptation automatique",
        ],
        "roadmap": [
            "Collecte 6 mois de données réelles (N ≥ 5000 transports terminés)",
            "A/B test contrôlé modèle ML vs baseline heuristique sur données réelles",
            "Monitoring drift via Evidently AI",
            "Versioning expériences via MLflow (ou DVC pour les données)",
            "Re-train automatisé périodique avec gate qualité (MAE/R²) avant promotion",
            "Garde-fou métier : fallback déterministe si prédiction hors plage plausible",
        ],
        "model_card_md": model_card_md,
    }