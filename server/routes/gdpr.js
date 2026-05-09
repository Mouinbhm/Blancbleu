const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { exportData, eraseData } = require("../controllers/gdprController");

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
});

// GET  /api/gdpr/export — droit à la portabilité (RGPD Art. 20)
router.get("/export", protect, exportData);

// DELETE /api/gdpr/me — droit à l'effacement (RGPD Art. 17)
router.delete("/me", protect, erasureLimiter, eraseData);

module.exports = router;
