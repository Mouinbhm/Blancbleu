const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getUnits,
  getUnit,
  createUnit,
  updateUnit,
  updateStatus,
  updatePosition,
  updateEquipage,
  deleteUnit,
  getStats,
} = require("../controllers/UnitController");

// ─── Stats (avant /:id pour ne pas être capturé) ──────────────────────────────
router.get("/stats", protect, getStats);

// ─── CRUD de base ─────────────────────────────────────────────────────────────
router.get("/", protect, getUnits);
router.post("/", protect, authorize("admin", "superviseur"), createUnit);
router.get("/:id", protect, getUnit);
router.patch("/:id", protect, authorize("admin", "superviseur"), updateUnit);
router.delete("/:id", protect, authorize("admin"), deleteUnit);

// ─── Actions métier ───────────────────────────────────────────────────────────
router.patch("/:id/status", protect, updateStatus);
router.patch("/:id/position", protect, updatePosition);
router.patch(
  "/:id/equipage",
  protect,
  authorize("admin", "superviseur"),
  updateEquipage,
);

module.exports = router;
