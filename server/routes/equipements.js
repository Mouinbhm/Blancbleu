const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getEquipements,
  getEquipement,
  createEquipement,
  updateEquipement,
  updateEtat,
  enregistrerControle,
  deleteEquipement,
  getAlertes,
  getStats,
} = require("../controllers/equipementController");

router.get("/stats", protect, getStats);
router.get("/alertes", protect, getAlertes);
router.get("/", protect, getEquipements);
router.post("/", protect, authorize("admin", "superviseur"), createEquipement);
router.get("/:id", protect, getEquipement);
router.patch(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  updateEquipement,
);
router.patch("/:id/etat", protect, updateEtat);
router.patch("/:id/controle", protect, enregistrerControle);
router.delete("/:id", protect, authorize("admin"), deleteEquipement);

module.exports = router;
