const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getUnits,
  getUnit,
  createUnit,
  updateUnit,
  deleteUnit,
  updateLocation,
  updateStatut,
  getStats,
} = require("../controllers/unitController");

router.get("/", protect, getUnits);
router.get("/stats", protect, getStats);
router.get("/:id", protect, getUnit);
router.post("/", protect, createUnit);
router.put("/:id", protect, updateUnit);
router.delete("/:id", protect, deleteUnit);
router.put("/:id/location", protect, updateLocation);
router.patch("/:id/statut", protect, updateStatut);

module.exports = router;
