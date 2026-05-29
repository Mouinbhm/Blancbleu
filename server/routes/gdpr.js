const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { exportData, eraseData, anonymizePatientById } = require("../controllers/gdprController");

const handler = (req, res) =>
  res.status(429).json({
    message: "Trop de tentatives. Réessayez dans 15 minutes.",
    retryAfter: res.getHeader("Retry-After"),
  });

// 3 tentatives max / 15 min — opération irréversible
const erasureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: () => process.env.NODE_ENV === "test",
});

// 3 tentatives max / 60 min — opération admin irréversible
const anonymizeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: () => process.env.NODE_ENV === "test",
});

// GET  /api/gdpr/export — droit à la portabilité (RGPD Art. 20)
router.get("/export", protect, exportData);

// DELETE /api/gdpr/me — droit à l'effacement self-service (RGPD Art. 17)
router.delete("/me", protect, erasureLimiter, eraseData);

// POST /api/gdpr/patients/:id/anonymize — anonymisation admin (RGPD Art. 17)
// Réservée aux rôles admin et dpo. Body obligatoire : { confirmReason: string }
// IRRÉVERSIBLE — voir docs/rgpd.md §6.2 pour la procédure complète.
router.post(
  "/patients/:id/anonymize",
  protect,
  authorize("admin", "dpo"),
  anonymizeLimiter,
  anonymizePatientById,
);

module.exports = router;
