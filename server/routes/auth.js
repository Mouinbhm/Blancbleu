const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { authLimiter, registerLimiter } = require("../middleware/rateLimiter");
const {
  register,
  login,
  refresh,
  logout,
  logoutAll,
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

// ─── Routes publiques avec rate limiting ──────────────────────────────────────
router.post("/login", authLimiter, login);
router.post("/forgot-password", authLimiter, forgotPassword);
router.get("/reset-password/:token", verifyResetToken);
router.post("/reset-password", resetPassword);

// ─── Refresh token (cookie httpOnly) ─────────────────────────────────────────
// Pas de protect — le cookie fait office d'authentification ici
router.post("/refresh", refresh);
router.post("/logout", logout);

// ─── Routes privées ───────────────────────────────────────────────────────────
router.get("/me", protect, getMe);
router.patch("/password", protect, updatePassword);
router.patch("/profile", protect, updateProfile);
router.post("/logout-all", protect, logoutAll);

// ─── Admin : création de compte ───────────────────────────────────────────────
// Register est désormais protégé — seul un admin connecté peut créer des comptes
// Le premier admin doit être créé via : node server/scripts/create-admin.js
router.post(
  "/register",
  protect,
  authorize("admin"),
  registerLimiter,
  register,
);

// ─── Admin : gestion des utilisateurs ────────────────────────────────────────
router.get("/users", protect, authorize("admin"), getAllUsers);
router.patch("/users/:id/toggle", protect, authorize("admin"), toggleUser);

module.exports = router;
