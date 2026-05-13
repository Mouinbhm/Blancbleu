const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { authLimiter, registerLimiter, twoFaLimiter } = require("../middleware/rateLimiter");
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
  deleteUser,
  adminResetPassword,
} = require("../controllers/authController");
const {
  forgotPassword,
  verifyResetToken,
  resetPassword,
} = require("../controllers/passwordController");
const {
  getStatus,
  setup2FA,
  verifySetup,
  verifyLogin,
  disable2FA,
  regenerateBackupCodes,
  confirm2FA,
  verify2FA,
} = require("../controllers/twoFactorController");

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

// ─── 2FA (TOTP) ───────────────────────────────────────────────────────────────
router.get("/2fa/status", protect, getStatus);
router.post("/2fa/setup", protect, authorize("admin", "dispatcher", "superviseur"), setup2FA);
router.post("/2fa/verify-setup", protect, twoFaLimiter, verifySetup);
router.post("/2fa/verify-login", twoFaLimiter, verifyLogin);
router.post("/2fa/disable", protect, disable2FA);
router.post("/2fa/regenerate-backup-codes", protect, twoFaLimiter, regenerateBackupCodes);
// Legacy routes — backward compat
router.post("/2fa/verify", twoFaLimiter, verify2FA);
router.post("/2fa/confirm", protect, twoFaLimiter, confirm2FA);
router.delete("/2fa", protect, disable2FA);

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
router.delete("/users/:id", protect, authorize("admin"), deleteUser);
router.post("/users/:id/reset-password", protect, authorize("admin"), adminResetPassword);

module.exports = router;
