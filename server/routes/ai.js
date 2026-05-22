/**
 * BlancBleu — Routes IA v5.0
 *
 * POST  /api/ai/pmt/extract                     → Extraction PMT par OCR
 * PATCH /api/ai/pmt/validate/:id                → Valider/corriger une extraction
 * POST  /api/ai/dispatch/manual                 → Recommandation libre (sans transport)
 * POST  /api/ai/dispatch/:id                    → Recommandation pour un transport existant
 * GET   /api/ai/dispatch/:id/explanation        → Explication recommandation sauvegardée
 * POST  /api/ai/routing/optimize                → Optimiser la tournée d'une journée
 * GET   /api/ai/status                          → Statut microservice IA
 */

const express = require("express");
const router  = express.Router();
const multer  = require("multer");

const { protect, authorize } = require("../middleware/auth");
const { aiLimiter } = require("../middleware/rateLimiter");
const ctrl = require("../controllers/aiController");

router.use(aiLimiter);

const STAFF = ["dispatcher", "superviseur", "admin"];

// Upload PMT en mémoire (max 10 Mo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const types = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];
    types.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Type de fichier non supporté. Utilisez PDF, JPEG, PNG ou TIFF."));
  },
});

// ── PMT ──────────────────────────────────────────────────────────────────────
router.post( "/pmt/extract",           protect, authorize(...STAFF), upload.single("pmt"), ctrl.extrairePMT);
router.patch("/pmt/validate/:transportId", protect, authorize(...STAFF), ctrl.validerPMT);

// ── Dispatch — routes statiques avant /:id ────────────────────────────────────
router.post("/dispatch/manual",        protect, authorize(...STAFF), ctrl.recommanderDispatchManuel);
router.get( "/dispatch/history",       protect, authorize("admin", "superviseur"), ctrl.getDispatchHistory);
router.post("/dispatch/:transportId",  protect, authorize(...STAFF), ctrl.recommanderDispatch);
router.get( "/dispatch/:transportId/explanation", protect, authorize(...STAFF), ctrl.getDispatchExplanation);

// ── Optimisation de tournée ───────────────────────────────────────────────────
router.post("/routing/optimize", protect, authorize("superviseur", "admin"), ctrl.optimiserTournee);

// ── Statut ────────────────────────────────────────────────────────────────────
router.get("/status", ctrl.getAIStatus);

module.exports = router;
