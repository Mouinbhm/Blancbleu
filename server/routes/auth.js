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

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Connexion utilisateur
 *     description: |
 *       Renvoie un JWT (header `Authorization`) ET pose un cookie httpOnly
 *       `bb_access` (15 min) + `bb_refresh` (7 j). Rate-limit 10/15 min/IP.
 *       Si 2FA actif : renvoie `{ requiresTwoFactor: true, tempToken }` (à passer
 *       à /2fa/verify-login).
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/LoginRequest" }
 *     responses:
 *       200:
 *         description: Connexion réussie OU 2FA requis
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/LoginResponse" }
 *       400: { description: Champs manquants }
 *       401: { description: Email ou mot de passe incorrect }
 *       403: { description: Compte désactivé }
 *       429: { description: Trop de tentatives — rate limit dépassé }
 */
router.post("/login", authLimiter, login);

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Demande de réinitialisation par email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { email: { type: string } }, required: [email] }
 *     responses:
 *       200: { description: Email envoyé (réponse identique si email inconnu — anti-énumération) }
 *       429: { description: Rate limit dépassé }
 */
router.post("/forgot-password", authLimiter, forgotPassword);
router.get("/reset-password/:token", verifyResetToken);
router.post("/reset-password", resetPassword);

// ─── Refresh token (cookie httpOnly) ─────────────────────────────────────────

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotation du refresh token (cookie httpOnly)
 *     description: Utilise le cookie `bb_refresh` pour émettre un nouveau JWT + nouveau refresh.
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Nouveau access token (cookie bb_access posé) }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/refresh", refresh);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Déconnexion (révoque les tokens, efface les cookies)
 *     responses:
 *       200: { description: Déconnexion réussie }
 */
router.post("/logout", logout);

// ─── Routes privées ───────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Profil de l'utilisateur connecté
 *     responses:
 *       200:
 *         description: Profil utilisateur
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: "#/components/schemas/User" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
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
