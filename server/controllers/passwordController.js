const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const ResetToken = require("../models/ResetToken");
const { sendResetEmail } = require("../services/emailService");

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Demander une réinitialisation — envoie un email avec le lien
// @route   POST /api/auth/forgot-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email obligatoire" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Toujours répondre OK pour ne pas révéler si l'email existe
    if (!user) {
      return res.json({
        message:
          "Si cet email existe, un lien de réinitialisation a été envoyé.",
      });
    }

    // Supprimer les anciens tokens de cet utilisateur
    await ResetToken.deleteMany({ userId: user._id });

    // Générer un token sécurisé
    const token = crypto.randomBytes(32).toString("hex");

    // Sauvegarder en base
    await ResetToken.create({ userId: user._id, token });

    // Construire l'URL de reset
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;

    // Envoyer l'email
    await sendResetEmail(user.email, user.prenom, resetUrl);

    res.json({
      message: "Si cet email existe, un lien de réinitialisation a été envoyé.",
    });
  } catch (err) {
    console.error("forgotPassword error:", err.message);
    res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Vérifier si un token est valide
// @route   GET /api/auth/reset-password/:token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    const record = await ResetToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!record) {
      return res.status(400).json({ message: "Lien invalide ou expiré" });
    }

    res.json({ valid: true, message: "Token valide" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Réinitialiser le mot de passe avec le token
// @route   POST /api/auth/reset-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ message: "Token et nouveau mot de passe requis" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({
          message: "Le mot de passe doit contenir au moins 6 caractères",
        });
    }

    // Vérifier le token
    const record = await ResetToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!record) {
      return res.status(400).json({ message: "Lien invalide ou expiré" });
    }

    // Hasher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    // Mettre à jour l'utilisateur
    await User.findByIdAndUpdate(record.userId, { password: hashed });

    // Marquer le token comme utilisé
    await ResetToken.findByIdAndUpdate(record._id, { used: true });

    res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { forgotPassword, verifyResetToken, resetPassword };
