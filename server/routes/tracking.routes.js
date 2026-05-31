const router = require("express").Router();
const requirePersonnel = require("../middleware/requirePersonnel");
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/trackingController");

// Driver writes — Personnel JWT

/**
 * @openapi
 * /api/tracking/batch:
 *   post:
 *     tags: [Tracking]
 *     summary: Envoyer un batch de positions GPS (app chauffeur)
 *     description: |
 *       Le mobile chauffeur (Flutter) bufferise les positions GPS toutes les
 *       5s et envoie un batch toutes les 30s pour économiser batterie + réseau.
 *       Les positions alimentent le `TrackingPoint` (historique) et le store
 *       in-memory `vehiclePositionStore` qui rebroadcast en WebSocket aux
 *       dispatchers / patients suivant la course. Auth : JWT Personnel
 *       (header `Authorization` ou cookie chauffeur).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shiftId, points]
 *             properties:
 *               shiftId: { type: string }
 *               points:
 *                 type: array
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [lat, lng, timestamp]
 *                   properties:
 *                     lat:       { type: number, minimum: -90, maximum: 90 }
 *                     lng:       { type: number, minimum: -180, maximum: 180 }
 *                     speed:     { type: number, description: "m/s" }
 *                     heading:   { type: number, description: "degrés 0-360" }
 *                     accuracy:  { type: number, description: "mètres" }
 *                     timestamp: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Positions enregistrées
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 saved:   { type: integer, description: "Nombre de points insérés" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/batch", requirePersonnel, ctrl.batchInsert);

// Dispatcher reads — User JWT
const requireStaff = [protect, authorize("dispatcher", "admin", "superviseur")];

/**
 * @openapi
 * /api/tracking/live:
 *   get:
 *     tags: [Tracking]
 *     summary: Positions GPS temps réel de la flotte (dispatcher)
 *     description: |
 *       Snapshot des dernières positions connues des véhicules en shift actif.
 *       Pour un suivi continu, l'UI s'abonne en plus aux événements Socket.IO
 *       `vehicle:position` (room `dispatch:fleet`). Le patient suit son
 *       véhicule via `vehicle:position` filtré sur la room du transport
 *       (cf. `docs/socket-events.md`). RBAC : dispatcher / superviseur / admin.
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [VSL, AMBULANCE, TPMR] }
 *         description: Filtrer par type de véhicule
 *     responses:
 *       200:
 *         description: Liste des positions actuelles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 count:   { type: integer }
 *                 vehicles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       vehicleId:        { type: string }
 *                       immatriculation:  { type: string }
 *                       type:             { type: string }
 *                       position:
 *                         type: object
 *                         properties:
 *                           lat:       { type: number }
 *                           lng:       { type: number }
 *                           updatedAt: { type: string, format: date-time }
 *                       currentTransportId: { type: string, nullable: true }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
router.get("/live", requireStaff, ctrl.getLive);
router.get("/history/:driverId", requireStaff, ctrl.getHistory);

module.exports = router;
