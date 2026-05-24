/**
 * BlancBleu — Routes Fin de Mission Semi-Automatique
 */
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Intervention = require("../models/Intervention");
const logger = require("../utils/logger");
const {
  evaluateMissionCompletion,
  suggestMissionCompletion,
  confirmMissionCompletion,
  autoCompleteMissionIfEligible,
  markDestinationReached,
  scannerMissionsActives,
} = require("../services/missionCompletion");

// Helper erreur
const err = (res, e) => {
  if (e.status) return res.status(e.status).json({ message: e.message });
  logger.error(e);
  return res.status(500).json({ message: e.message || "Erreur serveur" });
};

// ─── POST /api/interventions/:id/evaluate-completion ─────────────────────────
// Évalue si la mission peut être clôturée
router.post("/:id/evaluate-completion", protect, async (req, res) => {
  try {
    const result = await evaluateMissionCompletion(req.params.id);
    res.json(result);
  } catch (e) {
    err(res, e);
  }
});

// ─── POST /api/interventions/:id/suggest-completion ──────────────────────────
// Marque la mission comme candidate à la clôture
router.post("/:id/suggest-completion", protect, async (req, res) => {
  try {
    const result = await suggestMissionCompletion(req.params.id);
    res.json(result);
  } catch (e) {
    err(res, e);
  }
});

// ─── POST /api/interventions/:id/confirm-completion ──────────────────────────
// Confirmation humaine de fin de mission
router.post("/:id/confirm-completion", protect, async (req, res) => {
  try {
    const result = await confirmMissionCompletion(req.params.id, req.user);
    res.json({ message: "Mission clôturée", ...result });
  } catch (e) {
    err(res, e);
  }
});

// ─── POST /api/interventions/:id/mark-destination-reached ────────────────────
// Marquer l'arrivée à destination (hôpital)
router.post("/:id/mark-destination-reached", protect, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const result = await markDestinationReached(
      req.params.id,
      lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null,
    );
    res.json({ message: "Destination marquée", ...result });
  } catch (e) {
    err(res, e);
  }
});

// ─── POST /api/interventions/:id/complete-mission-report ─────────────────────
// Marquer le rapport comme complété
router.post("/:id/complete-mission-report", protect, async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id);
    if (!intervention) return res.status(404).json({ message: "Introuvable" });

    await Intervention.findByIdAndUpdate(req.params.id, {
      missionReportCompleted: true,
      missionReportData: req.body.rapport || {},
    });

    // Déclencher évaluation
    const evaluation = await evaluateMissionCompletion(req.params.id);
    if (evaluation.decision.niveau >= 3)
      await autoCompleteMissionIfEligible(req.params.id);
    else if (evaluation.decision.niveau >= 1)
      await suggestMissionCompletion(req.params.id);

    res.json({ message: "Rapport enregistré", evaluation });
  } catch (e) {
    err(res, e);
  }
});

// ─── GET /api/interventions/scan-completions ─────────────────────────────────
// Scan manuel toutes les missions actives
router.get("/scan-completions", protect, async (req, res) => {
  try {
    const result = await scannerMissionsActives();
    res.json({ message: "Scan terminé", ...result });
  } catch (e) {
    err(res, e);
  }
});

module.exports = router;
