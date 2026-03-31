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

// ─── Publiques ────────────────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", login);

// ─── Privées ─────────────────────────────────────────────────────────────────
router.get("/me", protect, getMe);
router.patch("/password", protect, updatePassword);
router.patch("/profile", protect, updateProfile);

// ─── Admin seulement ─────────────────────────────────────────────────────────
router.get("/users", protect, authorize("admin"), getAllUsers);
router.patch("/users/:id/toggle", protect, authorize("admin"), toggleUser);

module.exports = router;
