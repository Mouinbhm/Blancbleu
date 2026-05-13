const router           = require("express").Router();
const requirePersonnel = require("../middleware/requirePersonnel");
const ctrl             = require("../controllers/driverController");

router.get("/vehicles",                   requirePersonnel, ctrl.getAvailableVehicles);
router.get("/tournee",                    requirePersonnel, ctrl.getTournee);
router.patch("/transports/:id/status",    requirePersonnel, ctrl.updateStatus);
router.post("/transports/:id/signature",  requirePersonnel, ctrl.saveSignature);
router.post("/transports/:id/pmt-photo",  requirePersonnel, ...ctrl.uploadPmtPhoto);
router.post("/sos",                       requirePersonnel, ctrl.sosSend);

module.exports = router;
