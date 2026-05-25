const express    = require("express");
const router     = express.Router();
const requirePersonnel = require("../middleware/requirePersonnel");
const ctrl       = require("../controllers/personnelAuthController");
const { uploadAvatar, uploadDocument } = require("../middleware/upload");

router.post("/login",           ctrl.login);
router.post("/refresh",         ctrl.refresh);
router.post("/change-password", requirePersonnel, ctrl.changePassword);
router.patch("/profile",        requirePersonnel, ctrl.updateProfile);
router.post("/avatar",          requirePersonnel, (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, ctrl.uploadAvatar);
router.post("/documents",       requirePersonnel, (req, res, next) => {
  uploadDocument(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, ctrl.uploadDocument);
router.get("/me",               requirePersonnel, ctrl.me);
router.post("/logout",          requirePersonnel, ctrl.logout);

module.exports = router;
