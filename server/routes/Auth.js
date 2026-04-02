const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  register,
  login,
  getMe,
  updatePassword,
  updateProfile,
  getAllUsers,
  toggleUser,
} = require("../controllers/authController");
const {
  forgotPassword,
  verifyResetToken,
  resetPassword,
} = require("../controllers/passwordController");

// ─── Publiques ────────────────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.get("/reset-password/:token", verifyResetToken);
router.post("/reset-password", resetPassword);

// ─── Privées ──────────────────────────────────────────────────────────────────
router.get("/me", protect, getMe);
router.patch("/password", protect, updatePassword);
router.patch("/profile", protect, updateProfile);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/users", protect, authorize("admin"), getAllUsers);
router.patch("/users/:id/toggle", protect, authorize("admin"), toggleUser);

module.exports = router;
