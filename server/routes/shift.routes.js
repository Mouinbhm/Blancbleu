const router           = require("express").Router();
const requirePersonnel = require("../middleware/requirePersonnel");
const { protect, authorize } = require("../middleware/auth");
const ctrl             = require("../controllers/shiftController");

// Driver-only routes — authenticated via Personnel JWT
router.post("/start",    requirePersonnel, ctrl.startShift);
router.patch("/end",     requirePersonnel, ctrl.endShift);
router.get("/active",    requirePersonnel, ctrl.getActiveShift);
router.post("/incident", requirePersonnel, ctrl.addIncident);

// Staff view — authenticated via User JWT (dispatchers, admin)
router.get("/today", protect, authorize("dispatcher", "admin", "superviseur"), ctrl.getTodayShifts);
router.get("/", protect, authorize("dispatcher", "admin", "superviseur"), ctrl.listShifts);

// Force-close a ghost / abandoned shift (admin only)
router.patch("/:id/force-end", protect, authorize("admin", "superviseur", "dispatcher"), ctrl.forceEndShift);

module.exports = router;
