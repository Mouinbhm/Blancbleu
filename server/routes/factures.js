/**
 * BlancBleu — Routes Factures v3.0
 */
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");

const ctrl = require("../controllers/factureController");

const COMPTABLE = ["admin", "comptable", "superviseur"];
const ADMIN_SUP = ["admin", "superviseur"];

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", protect, ctrl.getStats);

// ── Recalcul des montants à zéro ─────────────────────────────────────────────
router.post(
  "/recalculate-amounts",
  protect,
  authorize("admin", "superviseur"),
  ctrl.recalculateAmounts,
);

// ── Génération depuis transport ───────────────────────────────────────────────
router.post(
  "/from-transport/:transportId",
  protect,
  authorize("admin", "dispatcher", "superviseur", "comptable"),
  ctrl.createFromTransport,
);

// ── Liste / Création ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/factures:
 *   get:
 *     tags: [Factures]
 *     summary: Liste paginée des factures
 *     description: Filtres optionnels statut, paymentStatus, période d'émission, patient.
 *     parameters:
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [brouillon, emise, en_attente, payee, annulee, payment_failed, remboursee, en_retard] }
 *       - in: query
 *         name: paymentStatus
 *         schema: { type: string, enum: [UNPAID, PENDING, SUCCEEDED, FAILED, REFUNDED] }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Page de factures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Facture" }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/", protect, ctrl.getFactures);
router.post("/", protect, ctrl.createFacture);

// ── Détail / MAJ / Suppression ────────────────────────────────────────────────

/**
 * @openapi
 * /api/factures/{id}:
 *   get:
 *     tags: [Factures]
 *     summary: Détail d'une facture
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Facture trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Facture" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id", protect, ctrl.getFacture);
router.patch("/:id", protect, ctrl.updateFacture);
router.delete("/:id", protect, authorize(...COMPTABLE), ctrl.deleteFacture);

// ── Transitions ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/factures/{id}/statut:
 *   patch:
 *     tags: [Factures]
 *     summary: Changer le statut d'une facture (paiement, annulation, etc.)
 *     description: |
 *       Endpoint générique de transition. Cas d'usage principaux :
 *       `payee` (paiement enregistré côté CPAM/comptable), `annulee` (geste
 *       commercial), `en_retard` (suivi des impayés). Pour un paiement Stripe
 *       déclenché par le patient, utiliser `POST /api/payments/intent` —
 *       le webhook bascule alors automatiquement le statut.
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
 *             required: [statut]
 *             properties:
 *               statut:       { type: string, enum: [brouillon, emise, en_attente, payee, annulee, payment_failed, remboursee, en_retard] }
 *               modePaiement: { type: string, enum: [virement, cheque, cb, especes, cpam_direct, stripe, ""] }
 *               notes:        { type: string }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Facture" }
 *       400: { $ref: "#/components/responses/ValidationError" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.patch("/:id/statut", protect, ctrl.updateStatut);
router.patch("/:id/issue", protect, authorize(...COMPTABLE), ctrl.issueFacture);

// ── Remboursement ─────────────────────────────────────────────────────────────
router.post("/:id/refund", protect, authorize("admin", "comptable"), ctrl.refundFacture);

// ── PDF & reçu ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/factures/{id}/pdf:
 *   get:
 *     tags: [Factures]
 *     summary: Télécharger le PDF d'une facture
 *     description: |
 *       Génère le PDF à la volée (PDFKit) s'il n'est pas en cache, sinon
 *       sert le fichier mis en cache (`Facture.pdf.invoicePdfUrl`). Renvoie
 *       l'inline application/pdf, prêt pour visualisation navigateur ou
 *       téléchargement direct.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF facture
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id/pdf", protect, ctrl.downloadInvoicePdf);
router.get("/:id/receipt", protect, ctrl.downloadReceiptPdf);

// ── Historique ────────────────────────────────────────────────────────────────
router.get("/:id/history", protect, ctrl.getHistory);

module.exports = router;
