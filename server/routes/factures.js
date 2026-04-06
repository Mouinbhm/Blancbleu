const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getFactures,
  getFacture,
  createFacture,
  updateFacture,
  updateStatut,
  deleteFacture,
  getStats,
} = require("../controllers/factureController");

router.get("/stats", protect, getStats);
router.get("/", protect, getFactures);
router.post("/", protect, createFacture);
router.get("/:id", protect, getFacture);
router.patch("/:id", protect, updateFacture);
router.patch("/:id/statut", protect, updateStatut);
router.delete(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  deleteFacture,
);

module.exports = router;
