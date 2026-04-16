/**
 * BlancBleu — Routes IA v4.0
 * Transport sanitaire NON urgent
 *
 * POST /api/ai/pmt/extract          → Extraire une PMT par OCR
 * PATCH /api/ai/pmt/validate/:id    → Valider/corriger une extraction PMT
 * POST /api/ai/dispatch/:id         → Recommandation véhicule pour un transport
 * POST /api/ai/routing/optimize     → Optimiser la tournée d'une journée
 * GET  /api/ai/status               → Statut du microservice IA
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");

const { protect, authorize } = require("../middleware/auth");
const {
  extrairePMT,
  validerPMT,
  recommanderDispatch,
  optimiserTournee,
  getAIStatus,
} = require("../controllers/aiController");

// Upload en mémoire pour les fichiers PMT (max 10 Mo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const types = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];
    if (types.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non supporté. Utilisez PDF, JPEG, PNG ou TIFF."));
    }
  },
});

// ── PMT ──────────────────────────────────────────────────────────────────────
router.post(
  "/pmt/extract",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  upload.single("pmt"),
  extrairePMT
);

router.patch(
  "/pmt/validate/:transportId",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  validerPMT
);

// ── Dispatch ──────────────────────────────────────────────────────────────────

// Route manuelle AVANT /:transportId pour éviter que "manual" soit capturé comme ID
router.post(
  "/dispatch/manual",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  require("../controllers/aiController").recommanderDispatchManuel
);

router.post(
  "/dispatch/:transportId",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  recommanderDispatch
);

// ── Optimisation de tournée ───────────────────────────────────────────────────
router.post(
  "/routing/optimize",
  protect,
  authorize("superviseur", "admin"),
  optimiserTournee
);

// ── Statut ────────────────────────────────────────────────────────────────────
router.get("/status", getAIStatus);

module.exports = router;
