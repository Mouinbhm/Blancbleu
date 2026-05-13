const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { sendWelcomeEmail } = require("../services/emailService");

const safeMsg = (err) =>
  process.env.NODE_ENV === "production"
    ? "Erreur interne du serveur"
    : err.message;

// ─── Config tokens ────────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_COOKIE_NAME = "bb_refresh";
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours en ms
  path: "/api/auth",
};
const ACCESS_COOKIE_NAME = "bb_access";
const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 15 * 60 * 1000, // 15 minutes en ms
  path: "/api",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

const generateRawRefreshToken = () => crypto.randomBytes(40).toString("hex");

const userPayload = (user) => ({
  id: user._id,
  nom: user.nom,
  prenom: user.prenom,
  email: user.email,
  role: user.role,
  mustChangePassword:      user.mustChangePassword      ?? false,
  twoFactorEnabled:        user.twoFactorEnabled        ?? false,
  twoFactorRequired:       user.twoFactorRequired       ?? false,
  twoFactorSetupCompleted: user.twoFactorSetupCompleted ?? false,
});

// Crée, persiste et pose le cookie refresh token
const issueRefreshToken = async (userId, res, req) => {
  const raw = generateRawRefreshToken();
  const hash = RefreshToken.hashToken(raw);

  await RefreshToken.create({
    userId,
    tokenHash: hash,
    userAgent: req.get("user-agent") || "",
    ip: req.ip,
  });

  res.cookie(REFRESH_COOKIE_NAME, raw, REFRESH_COOKIE_OPTS);
  return raw;
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Créer un nouveau compte
// @route   POST /api/auth/register
// @access  Privé — admin seulement (protégé dans auth.js)
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    const existe = await User.findOne({ email: email.toLowerCase() });
    if (existe) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }

    const ROLES_VALIDES = ["dispatcher", "superviseur", "admin", "comptable"];
    const roleValide = ROLES_VALIDES.includes(role) ? role : "dispatcher";

    const salt = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(password, salt);

    const user = await User.create({
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role: roleValide,
      mustChangePassword: true,
    });

    // Envoyer email de bienvenue avec les identifiants temporaires (best-effort)
    try {
      await sendWelcomeEmail(user.email, user.prenom, user.nom, user.email, password, roleValide);
    } catch (mailErr) {
      console.warn("[register] Email de bienvenue non envoyé :", mailErr.message);
    }

    res.status(201).json({
      message: "Compte créé avec succès",
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Connexion utilisateur
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password +twoFactorEnabled +twoFactorRequired +twoFactorSetupCompleted",
    );
    if (!user) {
      // Délai constant pour éviter le timing attack
      await bcrypt.compare(
        password,
        "$2b$12$invalidhashfortimingnormalization",
      );
      return res
        .status(401)
        .json({ message: "Email ou mot de passe incorrect" });
    }

    if (!user.actif) {
      return res.status(403).json({ message: "Ce compte a été désactivé" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res
        .status(401)
        .json({ message: "Email ou mot de passe incorrect" });
    }

    // Admin with 2FA mandatory but not yet set up → guide to setup
    if (user.role === "admin" && user.twoFactorRequired && !user.twoFactorSetupCompleted) {
      const tempToken = jwt.sign(
        { id: user._id, requires2FASetup: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" },
      );
      return res.json({ requiresTwoFactorSetup: true, tempToken });
    }

    // 2FA already active — issue a short-lived temp token instead of full session
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user._id, requires2FA: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" },
      );
      return res.json({ requiresTwoFactor: true, tempToken });
    }

    const accessToken = generateAccessToken(user._id);
    await issueRefreshToken(user._id, res, req);
    res.cookie(ACCESS_COOKIE_NAME, accessToken, ACCESS_COOKIE_OPTS);

    res.json({
      message: "Connexion réussie",
      token: accessToken,
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Renouveler l'access token via le refresh token (cookie httpOnly)
// @route   POST /api/auth/refresh
// @access  Public (nécessite le cookie)
// ─────────────────────────────────────────────────────────────────────────────
const refresh = async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!raw) {
      return res
        .status(401)
        .json({ message: "Session expirée — reconnectez-vous" });
    }

    const record = await RefreshToken.findValid(raw);

    if (!record || !record.userId) {
      // Invalider le cookie côté client même si le token est inconnu
      res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
      return res
        .status(401)
        .json({ message: "Session invalide — reconnectez-vous" });
    }

    const user = record.userId; // populate("userId") dans findValid

    if (!user.actif) {
      return res.status(403).json({ message: "Ce compte a été désactivé" });
    }

    // Rotation du refresh token — invalider l'ancien, émettre un nouveau
    await RefreshToken.findByIdAndUpdate(record._id, {
      revoked: true,
      revokedAt: new Date(),
      revokedReason: "rotation",
    });
    await issueRefreshToken(user._id, res, req);

    const accessToken = generateAccessToken(user._id);
    res.cookie(ACCESS_COOKIE_NAME, accessToken, ACCESS_COOKIE_OPTS);

    res.json({ user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Déconnexion — révoke le refresh token et efface le cookie
// @route   POST /api/auth/logout
// @access  Public (le cookie suffit)
// ─────────────────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];

    if (raw) {
      const hash = RefreshToken.hashToken(raw);
      await RefreshToken.findOneAndUpdate(
        { tokenHash: hash },
        { revoked: true, revokedAt: new Date(), revokedReason: "logout" },
      );
    }

    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
    res.clearCookie(ACCESS_COOKIE_NAME, { path: "/api" });
    res.json({ message: "Déconnexion réussie" });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Déconnexion de tous les appareils
// @route   POST /api/auth/logout-all
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const logoutAll = async (req, res) => {
  try {
    await RefreshToken.revokeAllForUser(req.user._id, "logout-all");
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
    res.clearCookie(ACCESS_COOKIE_NAME, { path: "/api" });
    res.json({ message: "Déconnexion de tous les appareils effectuée" });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Profil utilisateur connecté
// @route   GET /api/auth/me
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    res.json({ user: userPayload(req.user) });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier le mot de passe — révoque tous les refresh tokens
// @route   PATCH /api/auth/password
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updatePassword = async (req, res) => {
  try {
    const { ancienPassword, nouveauPassword } = req.body;

    if (!ancienPassword || !nouveauPassword) {
      return res
        .status(400)
        .json({ message: "Les deux mots de passe sont requis" });
    }

    if (nouveauPassword.length < 8) {
      return res.status(400).json({
        message: "Le nouveau mot de passe doit contenir au moins 8 caractères",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    const valid = await user.comparePassword(ancienPassword);

    if (!valid) {
      return res.status(401).json({ message: "Ancien mot de passe incorrect" });
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(nouveauPassword, salt);
    await user.save({ validateBeforeSave: false });

    // Effacer le flag de première connexion si actif
    if (user.mustChangePassword) {
      user.mustChangePassword = false;
      await user.save({ validateBeforeSave: false });
    }

    // Révoquer tous les sessions actives — forcer la reconnexion sur tous les appareils
    await RefreshToken.revokeAllForUser(req.user._id, "password-change");
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });

    // Émettre un nouvel access token pour la session courante
    const accessToken = generateAccessToken(user._id);
    await issueRefreshToken(user._id, res, req);
    res.cookie(ACCESS_COOKIE_NAME, accessToken, ACCESS_COOKIE_OPTS);

    res.json({
      message: "Mot de passe mis à jour — toutes les autres sessions ont été révoquées",
      token: accessToken,
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier le profil (nom, prénom)
// @route   PATCH /api/auth/profile
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { nom, prenom } = req.body;
    const champs = {};
    if (nom?.trim()) champs.nom = nom.trim();
    if (prenom?.trim()) champs.prenom = prenom.trim();

    const user = await User.findByIdAndUpdate(req.user._id, champs, {
      new: true,
      runValidators: true,
    });

    res.json({ message: "Profil mis à jour", user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister tous les utilisateurs
// @route   GET /api/auth/users
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip  = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Activer / désactiver un compte
// @route   PATCH /api/auth/users/:id/toggle
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const toggleUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    // Un admin ne peut pas se désactiver lui-même
    if (user._id.toString() === req.user._id.toString()) {
      return res
        .status(400)
        .json({ message: "Vous ne pouvez pas désactiver votre propre compte" });
    }

    user.actif = !user.actif;
    await user.save();

    // Si désactivation : révoquer toutes les sessions
    if (!user.actif) {
      await RefreshToken.revokeAllForUser(user._id, "account-disabled");
    }

    res.json({
      message: `Compte ${user.actif ? "activé" : "désactivé"}`,
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer un compte utilisateur
// @route   DELETE /api/auth/users/:id
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" });
    }

    await RefreshToken.revokeAllForUser(user._id, "account-deleted");
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "Compte supprimé" });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Réinitialiser le mot de passe d'un utilisateur (admin)
// @route   POST /api/auth/users/:id/reset-password
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const adminResetPassword = async (req, res) => {
  try {
    const { nouveauPassword } = req.body;
    if (!nouveauPassword || nouveauPassword.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(nouveauPassword, salt);
    user.mustChangePassword = true;
    await user.save({ validateBeforeSave: false });

    await RefreshToken.revokeAllForUser(user._id, "admin-reset-password");

    // Renvoi email avec nouveaux identifiants
    try {
      await sendWelcomeEmail(user.email, user.prenom, user.nom, user.email, nouveauPassword, user.role);
    } catch (mailErr) {
      console.warn("[adminResetPassword] Email non envoyé :", mailErr.message);
    }

    res.json({ message: "Mot de passe réinitialisé et email envoyé" });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

module.exports = {
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
};
