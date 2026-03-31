const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/Auth");

// ─── Génère un JWT ────────────────────────────────────────────────────────────
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Créer un nouveau compte dispatcher
router.post("/register", async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password) {
      return res
        .status(400)
        .json({ message: "Tous les champs sont obligatoires" });
    }

    const existe = await User.findOne({ email });
    if (existe) {
      return res.status(409).json({ message: "Email déjà utilisé" });
    }

    const user = await User.create({ nom, prenom, email, password, role });

    res.status(201).json({
      message: "Compte créé avec succès",
      token: generateToken(user._id),
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Connexion dispatcher
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res
        .status(401)
        .json({ message: "Email ou mot de passe incorrect" });
    }

    if (!user.actif) {
      return res.status(403).json({ message: "Compte désactivé" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res
        .status(401)
        .json({ message: "Email ou mot de passe incorrect" });
    }

    res.json({
      message: "Connexion réussie",
      token: generateToken(user._id),
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Récupérer le profil connecté
router.get("/me", protect, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
