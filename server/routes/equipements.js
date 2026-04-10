const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getAll,
  getStats,
  getExpiring,
  getCheckRequired,
  getOne,
  create,
  update,
  remove,
  assign,
  unassign,
  updateStatus,
} = require("../controllers/equipementController");

// ── Alerts (avant /:id pour éviter conflit de route) ─────────────────────────
router.get("/stats", protect, getStats);
router.get("/alerts/expiring", protect, getExpiring);
router.get("/alerts/check-required", protect, getCheckRequired);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/", protect, getAll);
router.get("/:id", protect, getOne);
router.post("/", protect, create);
router.put("/:id", protect, update);
router.delete("/:id", protect, remove);

// ── Actions métier ────────────────────────────────────────────────────────────
router.patch("/:id/assign", protect, assign);
router.patch("/:id/unassign", protect, unassign);
router.patch("/:id/status", protect, updateStatus);

module.exports = router;
