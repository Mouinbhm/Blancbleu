/**
 * BlancBleu — Contrôleur 2FA (TOTP)
 *
 * Endpoints :
 *  GET  /api/auth/2fa/status              — statut 2FA (public, requires protect)
 *  POST /api/auth/2fa/setup               — génère secret + QR code
 *  POST /api/auth/2fa/verify-setup        — confirme et active la 2FA
 *  POST /api/auth/2fa/verify-login        — valide le 2e facteur après login
 *  POST /api/auth/2fa/disable             — désactive (mot de passe + code TOTP)
 *  POST /api/auth/2fa/regenerate-backup-codes — régénère les backup codes
 *
 * Sécurité :
 *  - Secret TOTP chiffré AES-256-GCM (via twoFactorService)
 *  - Backup codes hashés bcrypt, utilisables une seule fois
 *  - tempToken JWT court (5 min) pour le flux login → 2FA
 *  - Audit log sur chaque action sensible
 *  - Aucun secret brut dans les réponses après activation
 */

const crypto   = require("crypto");
const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcryptjs");
const QRCode   = require("qrcode");
const User     = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const tfa      = require("../services/twoFactorService");
const { log }  = require("../services/auditService");

// Rôles pour lesquels la 2FA est disponible (optionnelle ou obligatoire)
const TWO_FACTOR_ELIGIBLE_ROLES = ["admin", "superviseur", "dispatcher"];

// Rôles pour lesquels la 2FA est OBLIGATOIRE
const TWO_FACTOR_REQUIRED_ROLES = ["admin"];

const safeMsg = (err) =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? err.message
    : "Erreur interne du serveur";

// ── Helpers partagés ─────────────────────────────────────────────────────────

const generateAccessToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, nom: user.nom || "", prenom: user.prenom || "" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );

const issueRefreshToken = async (userId, res, req) => {
  const raw  = crypto.randomBytes(40).toString("hex");
  const hash = RefreshToken.hashToken(raw);
  await RefreshToken.create({
    userId,
    tokenHash: hash,
    userAgent: req.get("user-agent") || "",
    ip: req.ip,
  });
  res.cookie("bb_refresh", raw, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     "/api/auth",
  });
};

const buildUserPayload = (user) => ({
  id:                user._id,
  nom:               user.nom,
  prenom:            user.prenom,
  email:             user.email,
  role:              user.role,
  mustChangePassword: user.mustChangePassword ?? false,
  twoFactorEnabled:  user.twoFactorEnabled,
  twoFactorSetupCompleted: user.twoFactorSetupCompleted,
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/2fa/status
// Retourne uniquement les indicateurs publics 2FA de l'utilisateur connecté.
// ─────────────────────────────────────────────────────────────────────────────
const getStatus = async (req, res) => {
  try {
    res.json({
      twoFactorEnabled:        req.user.twoFactorEnabled        ?? false,
      twoFactorRequired:       req.user.twoFactorRequired       ?? false,
      twoFactorSetupCompleted: req.user.twoFactorSetupCompleted ?? false,
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/2fa/setup
// Étape 1 : génère un secret TOTP temporaire + QR code.
// Le secret est stocké dans twoFactorTempSecret (chiffré).
// ─────────────────────────────────────────────────────────────────────────────
const setup2FA = async (req, res) => {
  try {
    if (!TWO_FACTOR_ELIGIBLE_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        message: "La double authentification est réservée aux administrateurs, superviseurs et dispatchers.",
      });
    }

    const { base32, otpauthUrl } = tfa.generateTotpSecret(req.user.email);

    const encrypted = tfa.encryptSecret(base32);

    // Stocke le secret temporaire (pas encore activé)
    await User.findByIdAndUpdate(req.user._id, {
      twoFactorTempSecret: encrypted,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Retourne QR code + clé manuelle (sans le secret chiffré ni l'URL brute)
    res.json({
      qrCodeDataUrl,
      manualKey: base32, // clé manuelle pour les apps sans scanner
      message: "Scannez le QR code ou saisissez la clé manuelle dans Google Authenticator / Authy, puis confirmez avec votre code à 6 chiffres.",
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/2fa/verify-setup
// Étape 2 : vérifie le code TOTP, active la 2FA, génère les backup codes.
// ─────────────────────────────────────────────────────────────────────────────
const verifySetup = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Code à 6 chiffres requis" });
    }

    const user = await User.findById(req.user._id).select("+twoFactorTempSecret +twoFactorBackupCodes");
    if (!user?.twoFactorTempSecret) {
      return res.status(400).json({
        message: "Commencez d'abord la configuration via POST /api/auth/2fa/setup",
      });
    }

    const valid = tfa.verifyTotp(user.twoFactorTempSecret, code);
    if (!valid) {
      return res.status(401).json({ message: "Code invalide ou expiré" });
    }

    const { plain, hashed } = await tfa.generateBackupCodes();

    // Active la 2FA : déplace temp → actif, efface temp, stocke backup codes hashés
    await User.findByIdAndUpdate(user._id, {
      twoFactorSecret:         user.twoFactorTempSecret,
      twoFactorTempSecret:     null,
      twoFactorEnabled:        true,
      twoFactorSetupCompleted: true,
      twoFactorRequired:       false,
      twoFactorVerifiedAt:     new Date(),
      twoFactorBackupCodes:    hashed,
    });

    await log({
      action:     "2FA_ACTIVATED",
      origine:    "HUMAIN",
      utilisateur: req.user,
      ressource:  { type: "User", id: req.user._id, reference: req.user.email },
      details:    { message: "Double authentification activée" },
    });

    res.json({
      message:     "Double authentification activée avec succès.",
      backupCodes: plain, // retournés UNE SEULE FOIS
      warning:     "Conservez ces codes de secours en lieu sûr. Ils ne seront plus affichés.",
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/2fa/verify-login
// Vérifie le code TOTP ou un backup code après le premier facteur (login).
// Émet les cookies définitifs si valide.
// ─────────────────────────────────────────────────────────────────────────────
const verifyLogin = async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ message: "tempToken et code requis" });
    }

    // Vérifier le tempToken
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Session expirée — recommencez la connexion" });
    }

    if (!payload.requires2FA) {
      return res.status(400).json({ message: "Token invalide pour la vérification 2FA" });
    }

    const user = await User.findById(payload.id).select(
      "+twoFactorSecret +twoFactorBackupCodes"
    );
    if (!user || !user.actif) {
      return res.status(401).json({ message: "Code invalide ou expiré" });
    }

    // 1. Essayer code TOTP
    let method = "totp";
    let valid   = false;

    if (user.twoFactorSecret) {
      valid = tfa.verifyTotp(user.twoFactorSecret, code);
    }

    // 2. Si TOTP invalide → essayer backup code
    if (!valid && user.twoFactorBackupCodes?.length) {
      const idx = await tfa.verifyAndConsumeBackupCode(code, user.twoFactorBackupCodes);
      if (idx >= 0) {
        // Consommer le backup code (le remplacer par null)
        const updated = [...user.twoFactorBackupCodes];
        updated[idx] = null;
        await User.findByIdAndUpdate(user._id, { twoFactorBackupCodes: updated });
        valid  = true;
        method = "backup_code";
      }
    }

    if (!valid) {
      return res.status(401).json({ message: "Code invalide ou expiré" });
    }

    // Mettre à jour la date de vérification
    await User.findByIdAndUpdate(user._id, { twoFactorVerifiedAt: new Date() });

    // Émettre les tokens définitifs
    const accessToken = generateAccessToken(user);
    await issueRefreshToken(user._id, res, req);
    res.cookie("bb_access", accessToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge:   15 * 60 * 1000,
      path:     "/",
    });

    await log({
      action:     "2FA_LOGIN",
      origine:    "HUMAIN",
      utilisateur: user,
      ressource:  { type: "User", id: user._id, reference: user.email },
      details:    { message: `Connexion 2FA réussie via ${method}`, method },
    });

    res.json({
      message: "Connexion réussie",
      user:    buildUserPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/2fa/disable
// Désactive la 2FA — exige mot de passe ET code TOTP.
// ─────────────────────────────────────────────────────────────────────────────
const disable2FA = async (req, res) => {
  try {
    const { password, code } = req.body;
    if (!password || !code) {
      return res.status(400).json({ message: "Mot de passe et code TOTP requis" });
    }

    const user = await User.findById(req.user._id).select("+password +twoFactorSecret");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

    // Vérifier le mot de passe
    const pwdValid = await user.comparePassword(password);
    if (!pwdValid) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    // Vérifier le code TOTP (ou backup code)
    let valid = false;
    if (user.twoFactorSecret) {
      valid = tfa.verifyTotp(user.twoFactorSecret, code);
    }
    if (!valid) {
      return res.status(401).json({ message: "Code invalide ou expiré" });
    }

    await User.findByIdAndUpdate(user._id, {
      twoFactorEnabled:        false,
      twoFactorSecret:         null,
      twoFactorTempSecret:     null,
      twoFactorBackupCodes:    [],
      twoFactorSetupCompleted: false,
      twoFactorVerifiedAt:     null,
    });

    await log({
      action:     "2FA_DISABLED",
      origine:    "HUMAIN",
      utilisateur: req.user,
      ressource:  { type: "User", id: req.user._id, reference: req.user.email },
      details:    { message: "Double authentification désactivée" },
    });

    res.json({ message: "Double authentification désactivée" });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/2fa/regenerate-backup-codes
// Régénère les backup codes — exige un code TOTP valide.
// ─────────────────────────────────────────────────────────────────────────────
const regenerateBackupCodes = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Code TOTP requis" });
    }

    const user = await User.findById(req.user._id).select("+twoFactorSecret");
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: "La 2FA n'est pas activée sur ce compte" });
    }

    const valid = tfa.verifyTotp(user.twoFactorSecret, code);
    if (!valid) {
      return res.status(401).json({ message: "Code invalide ou expiré" });
    }

    const { plain, hashed } = await tfa.generateBackupCodes();
    await User.findByIdAndUpdate(user._id, { twoFactorBackupCodes: hashed });

    await log({
      action:     "2FA_BACKUP_REGENERATED",
      origine:    "HUMAIN",
      utilisateur: req.user,
      ressource:  { type: "User", id: req.user._id, reference: req.user.email },
      details:    { message: "Codes de secours 2FA régénérés" },
    });

    res.json({
      message:     "Codes de secours régénérés avec succès.",
      backupCodes: plain,
      warning:     "Les anciens codes de secours sont désormais invalides. Conservez ces nouveaux codes en lieu sûr.",
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ── Exports legacy (compatibilité routes existantes) ──────────────────────────
// setup2FA  → POST /api/auth/2fa/setup
// confirm2FA → POST /api/auth/2fa/verify-setup  (renommé verify-setup)
// verify2FA  → POST /api/auth/2fa/verify-login  (renommé verify-login)

module.exports = {
  getStatus,
  setup2FA,
  verifySetup,
  verifyLogin,
  disable2FA,
  regenerateBackupCodes,
  // Alias backward-compat (utilisés dans les anciennes routes /2fa/confirm et /2fa/verify)
  confirm2FA: verifySetup,
  verify2FA:  verifyLogin,
};
