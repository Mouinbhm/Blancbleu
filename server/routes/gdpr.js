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

/**
 * @openapi
 * /api/gdpr/export:
 *   get:
 *     tags: [GDPR]
 *     summary: Export des données personnelles (droit à la portabilité — Art. 20)
 *     description: |
 *       Renvoie un JSON exhaustif des données détenues sur l'utilisateur
 *       authentifié : profil User, dossier Patient (si lié), historique des
 *       transports, factures, prescriptions, consentements. Champs santé
 *       déchiffrés à la volée. Format ré-importable manuellement chez un
 *       autre prestataire.
 *     responses:
 *       200:
 *         description: Bundle JSON des données personnelles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:          { $ref: "#/components/schemas/User" }
 *                 patient:       { $ref: "#/components/schemas/Patient" }
 *                 transports:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Transport" }
 *                 factures:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Facture" }
 *                 prescriptions:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Prescription" }
 *                 exportedAt:    { type: string, format: date-time }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/export", protect, exportData);

// DELETE /api/gdpr/me — droit à l'effacement self-service (RGPD Art. 17)
router.delete("/me", protect, erasureLimiter, eraseData);

/**
 * @openapi
 * /api/gdpr/patients/{id}/anonymize:
 *   post:
 *     tags: [GDPR]
 *     summary: Anonymiser un patient (droit à l'oubli — Art. 17, admin/DPO)
 *     description: |
 *       **IRRÉVERSIBLE.** Anonymise effectivement le dossier patient et toutes
 *       ses données embarquées (subdocs Transport.patient, dénormalisations
 *       Facture). Refuse si transports actifs en cours. Trace `PATIENT_ANONYMIZED`
 *       dans AuditLog avec `confirmReason` requis. Rate-limit 3/h.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmReason]
 *             properties:
 *               confirmReason:
 *                 type: string
 *                 minLength: 10
 *                 example: "Demande écrite du patient datée du 2026-05-15"
 *     responses:
 *       200:
 *         description: Patient anonymisé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:        { type: boolean }
 *                 patientId:      { type: string }
 *                 anonymizedAt:   { type: string, format: date-time }
 *                 transportsCleaned: { type: integer }
 *                 facturesCleaned:   { type: integer }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       429: { description: "Rate limit dépassé (3/h)" }
 */
router.post(
  "/patients/:id/anonymize",
  protect,
  authorize("admin", "dpo"),
  anonymizeLimiter,
  anonymizePatientById,
);

module.exports = router;
