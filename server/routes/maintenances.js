const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getMaintenances,
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  updateStatut,
  deleteMaintenance,
  getStats,
} = require("../controllers/maintenanceController");

router.get("/stats", protect, getStats);
router.get("/", protect, getMaintenances);
router.post("/", protect, createMaintenance);
router.get("/:id", protect, getMaintenance);
router.patch("/:id", protect, updateMaintenance);
router.patch("/:id/status", protect, updateStatut);
router.delete(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  deleteMaintenance,
);

module.exports = router;
