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
const serviceToken  = require("../middleware/serviceToken");
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

/**
 * @openapi
 * /api/ai/dispatch/manual:
 *   post:
 *     tags: [AI]
 *     summary: Recommandation libre (sans transport en base)
 *     description: Permet de tester le dispatch IA depuis un formulaire libre.
 *     responses:
 *       200: { description: Recommandation IA }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/dispatch/manual",        protect, authorize(...STAFF), ctrl.recommanderDispatchManuel);

/**
 * @openapi
 * /api/ai/dispatch/history:
 *   get:
 *     tags: [AI, Admin]
 *     summary: Stats sur les recommandations IA (taux acceptation, score moyen, etc.)
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30, minimum: 1, maximum: 365 }
 *     responses:
 *       200: { description: Agrégats }
 */
router.get( "/dispatch/history",       protect, authorize("admin", "superviseur"), ctrl.getDispatchHistory);

/**
 * @openapi
 * /api/ai/dispatch/{transportId}:
 *   post:
 *     tags: [AI]
 *     summary: Génère une recommandation IA pour un transport
 *     parameters:
 *       - in: path
 *         name: transportId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recommandation
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/DispatchRecommendation" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { description: Aucun véhicule disponible }
 */
router.post("/dispatch/:transportId",  protect, authorize(...STAFF), ctrl.recommanderDispatch);
router.get( "/dispatch/:transportId/explanation", protect, authorize(...STAFF), ctrl.getDispatchExplanation);

// ── Optimisation de tournée ───────────────────────────────────────────────────
router.post("/routing/optimize", protect, authorize("superviseur", "admin"), ctrl.optimiserTournee);

// ── Statut ────────────────────────────────────────────────────────────────────
router.get("/status", ctrl.getAIStatus);

// ── Service-to-service (appelé par le microservice IA Python) ────────────────

/**
 * @openapi
 * /api/ai/training-data:
 *   get:
 *     tags: [AI, Admin]
 *     summary: Export du dataset d'entraînement (service-to-service)
 *     description: Appelé par le microservice IA Python pour pull TransportFeature.
 *     security: [{ serviceTokenAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: since
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10000, maximum: 50000 }
 *     responses:
 *       200: { description: "Features (avec warning si volume insuffisant)" }
 *       401: { description: Service token invalide ou manquant }
 *       503: { description: AI_SERVICE_TOKEN non configuré côté serveur }
 */
router.get("/training-data", serviceToken, ctrl.getTrainingData);

// ── Admin — Réentraînement modèle de durée ───────────────────────────────────

/**
 * @openapi
 * /api/ai/model/retrain:
 *   post:
 *     tags: [AI, Admin]
 *     summary: Déclenche un réentraînement async du DurationPredictor
 *     description: Pousse un job BullMQ → worker appelle Python /optimizer/model/retrain.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               since: { type: string, format: date, nullable: true }
 *     responses:
 *       202: { description: Réentraînement programmé (jobId renvoyé) }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.post("/model/retrain", protect, authorize("admin"), ctrl.triggerModelRetrain);

/**
 * @openapi
 * /api/ai/model/status:
 *   get:
 *     tags: [AI, Admin]
 *     summary: État du dernier réentraînement + metrics courantes
 *     responses:
 *       200: { description: État du job + metrics }
 *       503: { description: Microservice IA indisponible }
 */
router.get( "/model/status",  protect, authorize("admin", "superviseur"), ctrl.getModelStatus);

// ── Admin — Pondérations dispatch (singleton MongoDB) ────────────────────────

/**
 * @openapi
 * /api/ai/dispatch/config:
 *   get:
 *     tags: [AI, Admin]
 *     summary: Pondérations actuelles du scoring dispatch + valeurs par défaut
 *     responses:
 *       200:
 *         description: Config + defaults
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/DispatchConfig" }
 *   put:
 *     tags: [AI, Admin]
 *     summary: Met à jour les pondérations (somme == 1.0 ± 1e-3)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [weights]
 *             properties:
 *               weights:
 *                 type: object
 *                 description: Les 7 clés sont obligatoires ; somme == 1.0
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/DispatchConfig" }
 *       400: { description: "Validation échouée (somme invalide ou clés manquantes)" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/dispatch/config", protect, authorize("admin", "superviseur"), ctrl.getDispatchConfig);
router.put("/dispatch/config", protect, authorize("admin"),                ctrl.updateDispatchConfig);

module.exports = router;
