const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getInterventions,
  getIntervention,
  createIntervention,
  updateIntervention,
  updateStatus,
  assignUnit,
  unassignUnit,
  deleteIntervention,
  getStats,
} = require("../controllers/InterventionController");

// ─── Stats (avant /:id pour ne pas être capturé) ──────────────────────────────
router.get("/stats", protect, getStats);

// ─── CRUD de base ─────────────────────────────────────────────────────────────
router.get("/", protect, getInterventions);
router.post("/", protect, createIntervention);
router.get("/:id", protect, getIntervention);
router.patch("/:id", protect, updateIntervention);
router.delete("/:id", protect, deleteIntervention);

// ─── Actions métier ───────────────────────────────────────────────────────────
router.patch("/:id/status", protect, updateStatus);
router.patch("/:id/assign", protect, assignUnit);
router.patch("/:id/unassign", protect, unassignUnit);

module.exports = router;
