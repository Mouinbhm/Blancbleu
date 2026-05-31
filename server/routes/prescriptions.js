const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { uploadPmt } = require("../middleware/upload");
const ctrl = require("../controllers/prescriptionController");

const STAFF = ["admin", "superviseur", "dispatcher"];

// ── Routes statiques (DOIVENT précéder /:id) ──────────────────────────────────
router.get("/stats", protect, ctrl.getStats);
router.get(
  "/pending-validation",
  protect,
  authorize("admin", "superviseur", "dispatcher"),
  ctrl.getPendingValidation,
);
/**
 * @openapi
 * /api/prescriptions/upload:
 *   post:
 *     tags: [Prescriptions]
 *     summary: Uploader une Prescription Médicale de Transport (PMT)
 *     description: |
 *       Accepte un PDF ou une image (PNG/JPEG/WEBP, max 10 Mo) en `multipart/form-data`,
 *       champ `fichier`. Crée une `Prescription` en statut `ocrStatus=pending`
 *       et déclenche un job OCR asynchrone (Tesseract + spaCy local côté
 *       microservice IA) qui peuplera `extractedData`. Le résultat est récupérable
 *       via `GET /api/prescriptions/:id/ocr-result`. RBAC : admin / superviseur /
 *       dispatcher.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [fichier]
 *             properties:
 *               fichier:
 *                 type: string
 *                 format: binary
 *                 description: PDF/PNG/JPEG/WEBP ≤ 10 MB
 *               patientId:
 *                 type: string
 *                 description: Si connu, lie la PMT au dossier patient
 *               transportId:
 *                 type: string
 *                 description: Lien optionnel vers un transport
 *     responses:
 *       201:
 *         description: PMT créée (OCR en cours)
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Prescription" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       413: { description: "Fichier trop volumineux (> 10 MB)" }
 */
router.post(
  "/upload",
  protect,
  authorize(...STAFF),
  (req, res, next) => {
    uploadPmt(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  ctrl.uploadPmt,
);

// ── Liste / création ──────────────────────────────────────────────────────────
router.get("/", protect, ctrl.getPrescriptions);
router.post("/", protect, authorize(...STAFF), ctrl.createPrescription);

// ── Sous-routes statiques par id (avant PATCH /:id générique) ─────────────────
router.get("/:id/ocr-result", protect, ctrl.getOcrResult);
router.get("/:id/validation", protect, authorize(...STAFF), ctrl.getValidationState);
router.patch("/:id/correct", protect, authorize(...STAFF), ctrl.correctPrescription);
/**
 * @openapi
 * /api/prescriptions/{id}/validate:
 *   patch:
 *     tags: [Prescriptions]
 *     summary: Valider une PMT (IA + humain)
 *     description: |
 *       Marque la prescription comme validée. Workflow : l'IA fait l'OCR
 *       pré-validation, puis un staff valide manuellement les champs
 *       extraits. Trace `validePar` + `valideAt` pour audit CPAM.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               corrections:
 *                 type: object
 *                 description: Corrections apportées aux champs OCR (medecin, dateEmission, motif, …)
 *     responses:
 *       200:
 *         description: PMT validée
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Prescription" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.patch("/:id/validate", protect, authorize(...STAFF), ctrl.validatePmt);
router.patch("/:id/reject", protect, authorize(...STAFF), ctrl.rejectPmt);
router.patch("/:id/link-patient", protect, authorize(...STAFF), ctrl.linkPatient);
router.patch("/:id/link-transport", protect, authorize(...STAFF), ctrl.linkTransport);

// ── CRUD existant ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/prescriptions/{id}:
 *   get:
 *     tags: [Prescriptions]
 *     summary: Détail d'une prescription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Prescription trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Prescription" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id", protect, ctrl.getPrescription);
router.patch("/:id", protect, authorize(...STAFF), ctrl.updatePrescription);
router.patch("/:id/valider", protect, authorize(...STAFF), ctrl.validerPrescription);
router.patch("/:id/incomplet", protect, authorize(...STAFF), ctrl.marquerIncomplet);
router.delete("/:id", protect, authorize("admin", "superviseur"), ctrl.deletePrescription);

module.exports = router;
