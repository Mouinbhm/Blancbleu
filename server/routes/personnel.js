const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getPersonnel,
  getPersonnelById,
  createPersonnel,
  updatePersonnel,
  updateStatut,
  assignerUnite,
  deletePersonnel,
  getStats,
} = require("../controllers/personnelController");

router.get("/stats", protect, getStats);
router.get("/", protect, getPersonnel);
router.post("/", protect, authorize("admin", "superviseur"), createPersonnel);
router.get("/:id", protect, getPersonnelById);
router.patch(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  updatePersonnel,
);
router.patch("/:id/status", protect, updateStatut);
router.patch(
  "/:id/assign",
  protect,
  authorize("admin", "superviseur"),
  assignerUnite,
);
router.delete("/:id", protect, authorize("admin"), deletePersonnel);

module.exports = router;
