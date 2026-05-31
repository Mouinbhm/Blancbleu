/**
 * BlancBleu — Routes Transport Sanitaire
 * Remplace routes/interventions.js
 */
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { uploadPmt, uploadSignature } = require("../middleware/upload");
const { createTransportSchema, updateTransportSchema } = require("../validators/schemas");
const ctrl = require("../controllers/transport");

// ── Wrapper multer → Express (gestion erreur type/taille) ────────────────────
function multerWrap(multerFn) {
  return (req, res, next) => {
    multerFn(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE")
        return res
          .status(413)
          .json({ success: false, message: "Fichier trop volumineux", code: "FILE_TOO_LARGE" });
      return res.status(400).json({ success: false, message: err.message, code: "UPLOAD_ERROR" });
    });
  };
}

// ── Stats et estimation (avant /:id) ─────────────────────────────────────────
router.get("/stats", protect, ctrl.getStats);
router.get("/estimation", protect, ctrl.estimerTarif);

// ── Notifications (avant /:id) ────────────────────────────────────────────────
router.get("/notifications", protect, ctrl.getNotifications);
router.patch("/notifications/read-all", protect, ctrl.markAllNotificationsRead);
router.patch("/notifications/:id/read", protect, ctrl.markNotificationRead);

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/transports:
 *   get:
 *     tags: [Transports]
 *     summary: Liste paginée des transports
 *     description: Filtres combinables sur statut, période, véhicule, chauffeur, patient et type. Tri par dateTransport décroissant.
 *     parameters:
 *       - in: query
 *         name: statut
 *         schema: { type: string }
 *         description: Filtrer par statut (REQUESTED, ASSIGNED, COMPLETED, …)
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
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Page de transports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Transport" }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *                     pages: { type: integer }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/", protect, ctrl.getTransports);

/**
 * @openapi
 * /api/transports:
 *   post:
 *     tags: [Transports]
 *     summary: Créer un transport sanitaire
 *     description: |
 *       Crée un transport en statut `REQUESTED`. Géocodage automatique des
 *       adresses (BAN), création du dossier Patient si nécessaire, enqueue
 *       du job auto-dispatch BullMQ. Le numéro `TRS-YYYYMMDD-XXXX` est
 *       attribué atomiquement (Counter Mongo).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, typeTransport, motif, dateTransport, heureRDV, adresseDepart, adresseDestination]
 *             properties:
 *               patient:             { $ref: "#/components/schemas/PatientSubdoc" }
 *               typeTransport:       { type: string, enum: [VSL, TPMR, AMBULANCE] }
 *               motif:               { type: string, example: "Dialyse" }
 *               dateTransport:       { type: string, format: date-time }
 *               heureRDV:            { type: string, example: "09:30" }
 *               allerRetour:         { type: boolean, default: false }
 *               adresseDepart:       { $ref: "#/components/schemas/Adresse" }
 *               adresseDestination:  { $ref: "#/components/schemas/Adresse" }
 *               tauxPriseEnCharge:   { type: number, default: 65 }
 *               notes:               { type: string }
 *     responses:
 *       201:
 *         description: Transport créé
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       400: { $ref: "#/components/responses/ValidationError" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/", protect, validate(createTransportSchema), ctrl.createTransport);

/**
 * @openapi
 * /api/transports/recurrents:
 *   post:
 *     tags: [Transports]
 *     summary: Générer une série de transports récurrents
 *     description: |
 *       À partir d'un transport modèle, génère N transports planifiés selon
 *       une fréquence (hebdo, jours sélectionnés) jusqu'à une date de fin.
 *       Cas d'usage type : dialyse 3×/sem pendant 6 mois.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [modele, recurrence]
 *             properties:
 *               modele:
 *                 description: Payload Transport identique à POST /api/transports
 *                 $ref: "#/components/schemas/Transport"
 *               recurrence:
 *                 type: object
 *                 required: [frequence, dateFin]
 *                 properties:
 *                   frequence:    { type: string, example: "hebdomadaire" }
 *                   joursSemaine:
 *                     type: array
 *                     description: "1=lundi … 7=dimanche"
 *                     items: { type: integer, minimum: 1, maximum: 7 }
 *                   dateFin:      { type: string, format: date }
 *     responses:
 *       201:
 *         description: Série créée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:      { type: integer, example: 24 }
 *                 transports:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/Transport" }
 *       400: { $ref: "#/components/responses/ValidationError" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/recurrents", protect, ctrl.creerTransportsRecurrents);

/**
 * @openapi
 * /api/transports/{id}:
 *   get:
 *     tags: [Transports]
 *     summary: Détail d'un transport
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transport trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id", protect, ctrl.getTransport);

/**
 * @openapi
 * /api/transports/{id}:
 *   patch:
 *     tags: [Transports]
 *     summary: Modifier un transport
 *     description: |
 *       Whitelist de champs modifiables : `notes`, `heureDepart`, `allerRetour`,
 *       `adresseDepart`, `adresseDestination`, `tauxPriseEnCharge`. Les autres
 *       champs (statut, vehicule, chauffeur) passent par des transitions dédiées.
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
 *             properties:
 *               notes:              { type: string }
 *               heureDepart:        { type: string, example: "09:00" }
 *               allerRetour:        { type: boolean }
 *               adresseDepart:      { $ref: "#/components/schemas/Adresse" }
 *               adresseDestination: { $ref: "#/components/schemas/Adresse" }
 *               tauxPriseEnCharge:  { type: number }
 *     responses:
 *       200:
 *         description: Transport mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       400: { $ref: "#/components/responses/ValidationError" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.patch("/:id", protect, validate(updateTransportSchema), ctrl.updateTransport);
router.delete("/:id", protect, ctrl.deleteTransport);

// ── Transitions lifecycle ─────────────────────────────────────────────────────
// La state machine est documentée dans services/transportStateMachine.js. Les
// 15 endpoints ci-dessous appliquent une transition spécifique avec garde
// RBAC + validation de l'état source. Tous renvoient le Transport mis à jour
// ou 409 si la transition est interdite depuis le statut courant.
router.patch("/:id/confirm", protect, ctrl.confirmer);
router.patch("/:id/schedule", protect, ctrl.planifier);

/**
 * @openapi
 * /api/transports/{id}/assign:
 *   patch:
 *     tags: [Transports]
 *     summary: Assigner véhicule + chauffeur à un transport
 *     description: |
 *       Transition `CONFIRMED/SCHEDULED → ASSIGNED`. Claim atomique du
 *       véhicule (`Vehicle.findOneAndUpdate` garde `statut=Disponible`),
 *       enqueue push FCM canal critique vers le chauffeur. RBAC : dispatcher
 *       / superviseur / admin.
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
 *             required: [vehiculeId]
 *             properties:
 *               vehiculeId: { type: string }
 *               chauffeurId: { type: string, nullable: true, description: "Si null, dérivé du shift actif du véhicule" }
 *     responses:
 *       200:
 *         description: Transport assigné
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.patch("/:id/assign", protect, ctrl.assigner);

router.patch("/:id/accept-driver", protect, ctrl.accepterDriver);
router.patch("/:id/reject-driver", protect, ctrl.refuserDriver);
router.patch("/:id/en-route", protect, ctrl.enRoute);
router.patch("/:id/arrived", protect, ctrl.arriveePatient);
router.patch("/:id/on-board", protect, ctrl.patientABord);
router.patch("/:id/destination", protect, ctrl.arriveeDestination);

/**
 * @openapi
 * /api/transports/{id}/complete:
 *   patch:
 *     tags: [Transports]
 *     summary: Marquer transport comme terminé (transition de statut représentative)
 *     description: |
 *       Transition `ARRIVED_AT_DESTINATION → COMPLETED`. Libère le véhicule
 *       (`statut=Disponible`), enqueue job billing BullMQ, calcule la durée
 *       réelle, émet WebSocket `transport:status_updated`. Endpoint emblématique
 *       de la state machine — les autres transitions suivent le même contrat
 *       (404 si introuvable, 409 si transition interdite, 200 + Transport
 *       mis à jour). Voir transitions sœurs : `/cancel`, `/no-show`, `/en-route`,
 *       `/arrived`, `/on-board`, `/destination`, etc.
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
 *               dureeAttenteMinutes: { type: integer, description: "Saisie chauffeur" }
 *     responses:
 *       200:
 *         description: Transport terminé
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.patch("/:id/complete", protect, ctrl.completer);

router.patch("/:id/wait", protect, ctrl.demarrerAttente);
router.patch("/:id/return-base", protect, ctrl.demarrerRetour);
router.patch("/:id/billing-pending", protect, ctrl.billingPending);
router.patch("/:id/bill", protect, ctrl.facturer);
router.patch("/:id/paid", protect, ctrl.paid);
router.patch("/:id/fail", protect, ctrl.fail);

/**
 * @openapi
 * /api/transports/{id}/no-show:
 *   patch:
 *     tags: [Transports]
 *     summary: Marquer le patient comme absent (no-show)
 *     description: Transition `ASSIGNED/EN_ROUTE_TO_PICKUP/ARRIVED_AT_PICKUP → NO_SHOW`. Libère le véhicule et trace le motif.
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
 *               raison: { type: string, example: "Patient introuvable à l'adresse" }
 *     responses:
 *       200:
 *         description: Transport marqué NO_SHOW
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.patch("/:id/no-show", protect, ctrl.noShow);

/**
 * @openapi
 * /api/transports/{id}/cancel:
 *   patch:
 *     tags: [Transports]
 *     summary: Annuler un transport
 *     description: |
 *       Transition `REQUESTED/CONFIRMED/SCHEDULED/ASSIGNED → CANCELLED`.
 *       Libère le véhicule si déjà assigné, notifie le chauffeur via FCM,
 *       trace `raisonAnnulation`. Annulation post-départ : voir `/no-show`
 *       ou `/fail`.
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
 *               raison: { type: string, example: "Patient hospitalisé en urgence" }
 *     responses:
 *       200:
 *         description: Transport annulé
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Transport" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
router.patch("/:id/cancel", protect, ctrl.annuler);

router.patch("/:id/reschedule", protect, ctrl.reprogrammer);

// ── PART A : Timeline ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/transports/{id}/timeline:
 *   get:
 *     tags: [Transports]
 *     summary: Historique riche des changements de statut
 *     description: |
 *       Renvoie le `statusLog` ordonné chronologiquement : qui (User + rôle),
 *       quand, depuis quel statut vers quel statut, motif éventuel et metadata
 *       (raison annulation, vehicule assigné, etc.). Source d'audit principale
 *       pour les contestations CPAM et les revues qualité.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Timeline ordonnée (ancien → récent)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transportId: { type: string }
 *                 numero:      { type: string, example: "TRS-20260524-0001" }
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       from:          { type: string, nullable: true }
 *                       to:            { type: string }
 *                       changedBy:     { type: string, nullable: true }
 *                       changedByRole: { type: string }
 *                       changedAt:     { type: string, format: date-time }
 *                       reason:        { type: string }
 *                       metadata:      { type: object }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id/timeline", protect, ctrl.getTimeline);

// ── PART B : Signature patient ────────────────────────────────────────────────
// Accepte soit un fichier image (champ "signature"), soit signatureBase64 dans le body
router.post("/:id/signature", protect, multerWrap(uploadSignature), ctrl.addSignature);

// ── PART C : Documents PMT ───────────────────────────────────────────────────
router.post("/:id/pmt", protect, multerWrap(uploadPmt), ctrl.uploadPmt);
router.get("/:id/pmt", protect, ctrl.getPmt);
router.delete(
  "/:id/pmt/:docId",
  protect,
  authorize("admin", "dispatcher", "superviseur"),
  ctrl.deletePmt,
);

// ── PART D : Export PDF ───────────────────────────────────────────────────────
router.get("/:id/pdf", protect, ctrl.exportPdf);

// ── IA Dispatch — accept / reject ────────────────────────────────────────────
const aiCtrl = require("../controllers/aiController");
router.patch(
  "/:id/ai-recommendation/accept",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  aiCtrl.accepterRecommandationIA,
);
router.patch(
  "/:id/ai-recommendation/reject",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  aiCtrl.refuserRecommandationIA,
);

module.exports = router;
