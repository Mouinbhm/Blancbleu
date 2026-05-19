const express    = require("express");
const router     = express.Router();
const requirePersonnel = require("../middleware/requirePersonnel");
const ctrl       = require("../controllers/personnelAuthController");

router.post("/login",           ctrl.login);
router.post("/change-password", requirePersonnel, ctrl.changePassword);
router.patch("/profile",        requirePersonnel, ctrl.updateProfile);
router.get("/me",               requirePersonnel, ctrl.me);
router.post("/logout",          requirePersonnel, ctrl.logout);

module.exports = router;
