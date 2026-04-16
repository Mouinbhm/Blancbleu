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
import logging

from routes.pmt import router as pmt_router
from routes.dispatch import router as dispatch_router
from routes.routing import router as routing_router

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

    # ── Configurer Tesseract (chemin Windows) ─────────────────────────────────
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        version = pytesseract.get_tesseract_version()
        logger.info(f"Tesseract OCR chargé — version {version}")
        app.state.pmt_ocr = True
    except Exception as e:
        logger.warning(f"Tesseract OCR non disponible : {e}")
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

    yield
    logger.info("BlancBleu AI Service arrêt.")


# ─── Application ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="BlancBleu AI Service",
    description="Microservice IA local pour transport sanitaire non urgent",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — autoriser le backend Node.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

# ─── Inclusion des routes ─────────────────────────────────────────────────────
app.include_router(pmt_router, prefix="/pmt", tags=["PMT"])
app.include_router(dispatch_router, prefix="/dispatch", tags=["Dispatch"])
app.include_router(routing_router, prefix="/routing", tags=["Routing"])


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

    return {
        "status": "ok",
        "version": "1.0.0",
        "domaine": "transport sanitaire non urgent",
        "modules": modules,
    }