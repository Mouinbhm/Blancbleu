const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/patientController");

// ── Routes statiques (AVANT /:id) ─────────────────────────────────────────────
router.get("/stats", protect, ctrl.getStats);

/**
 * @openapi
 * /api/patients:
 *   get:
 *     tags: [Patients]
 *     summary: Liste paginée des patients (soft-deleted exclus)
 *     description: Filtres optionnels nom, source, actif. Champs santé (`antecedents`, `allergies`) non remontés sauf opt-in via select.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Recherche partielle nom/prénom/numeroPatient
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [web, app_mobile, papier] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Page de patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Patient" }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/", protect, ctrl.getPatients);

// ── Routes RGPD par patient (AVANT /:id générique) ────────────────────────────
router.get("/:id/full-profile", protect, ctrl.getFullProfile);
router.get("/:id/data-export", protect, authorize("admin", "superviseur"), ctrl.exportPatientData);

/**
 * @openapi
 * /api/patients/{id}/consent:
 *   post:
 *     tags: [GDPR]
 *     summary: Mettre à jour le consentement RGPD du patient
 *     description: |
 *       Trace dans `Patient.consentHistory` (qui, quand, version, scope). Sert
 *       de preuve légale Art. 7 RGPD. Utilisé par l'app mobile patient lors
 *       du premier login et lors d'une mise à jour de la politique.
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
 *             required: [consentGiven, consentVersion]
 *             properties:
 *               consentGiven:        { type: boolean }
 *               consentVersion:      { type: string, example: "2026-Q1" }
 *               consentSource:       { type: string, enum: [web, mobile, papier] }
 *               marketingConsent:    { type: boolean, default: false }
 *               medicalDataConsent:  { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Consentement enregistré
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 patientId:        { type: string }
 *                 consentRecorded:  { type: boolean }
 *                 consentVersion:   { type: string }
 *                 recordedAt:       { type: string, format: date-time }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.post("/:id/consent", protect, ctrl.updateConsent);
router.get("/:id/consent-history", protect, ctrl.getConsentHistory);
router.post("/:id/anonymize", protect, authorize("admin", "superviseur"), ctrl.anonymizePatient);
router.post("/:id/request-deletion", protect, ctrl.requestDeletion);
router.post(
  "/:id/cancel-deletion-request",
  protect,
  authorize("admin", "superviseur"),
  ctrl.cancelDeletion,
);
router.get("/:id/audit-summary", protect, authorize("admin", "superviseur"), ctrl.getAuditSummary);

// ── CRUD standard ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/patients/{id}:
 *   get:
 *     tags: [Patients]
 *     summary: Détail patient (sans données santé sauf si rôle médical)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patient trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Patient" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id", protect, ctrl.getPatient);

/**
 * @openapi
 * /api/patients:
 *   post:
 *     tags: [Patients]
 *     summary: Créer un dossier patient
 *     description: |
 *       Numéro `PAT-YYYYMMDD-XXXX` attribué atomiquement. Le `numeroSecu` est
 *       chiffré AES-256-GCM et indexé via hash HMAC pour la recherche. RBAC :
 *       admin / superviseur / dispatcher.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom:           { type: string }
 *               prenom:        { type: string }
 *               dateNaissance: { type: string, format: date }
 *               genre:         { type: string, enum: [M, F, autre] }
 *               telephone:     { type: string }
 *               email:         { type: string, format: email }
 *               numeroSecu:    { type: string, description: "Chiffré AES côté serveur" }
 *               mobilite:      { type: string, enum: [ASSIS, FAUTEUIL_ROULANT, ALLONGE, CIVIERE] }
 *               oxygene:       { type: boolean }
 *               brancardage:   { type: boolean }
 *     responses:
 *       201:
 *         description: Patient créé
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Patient" }
 *       400: { $ref: "#/components/responses/ValidationError" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/", protect, authorize("admin", "superviseur", "dispatcher"), ctrl.createPatient);

/**
 * @openapi
 * /api/patients/{id}:
 *   patch:
 *     tags: [Patients]
 *     summary: Mettre à jour un dossier patient
 *     description: |
 *       Mise à jour partielle. Modification d'antécédents / allergies / numeroSecu
 *       déclenche re-chiffrement AES + log RGPD `Patient.accessHistory`. RBAC :
 *       admin / superviseur / dispatcher.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/Patient" }
 *     responses:
 *       200:
 *         description: Patient mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Patient" }
 *       400: { $ref: "#/components/responses/ValidationError" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.patch("/:id", protect, authorize("admin", "superviseur", "dispatcher"), ctrl.updatePatient);

router.delete("/:id", protect, authorize("admin", "superviseur"), ctrl.deletePatient);

module.exports = router;
