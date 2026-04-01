const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ─── Helper : génère un JWT ───────────────────────────────────────────────────
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ─── Helper : réponse utilisateur sans le mot de passe ───────────────────────
const userPayload = (user) => ({
  id: user._id,
  nom: user.nom,
  prenom: user.prenom,
  email: user.email,
  role: user.role,
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Créer un nouveau compte
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password) {
      return res
        .status(400)
        .json({ message: "Tous les champs sont obligatoires" });
    }

    const existe = await User.findOne({ email });
    if (existe) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const user = await User.create({
      nom,
      prenom,
      email,
      password: hashed,
      role,
    });

    res.status(201).json({
      message: "Compte créé avec succès",
      token: generateToken(user._id),
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Connexion dispatcher
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    // select('+password') car le champ est select: false dans le modèle
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
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

    res.json({
      message: "Connexion réussie",
      token: generateToken(user._id),
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Récupérer le profil de l'utilisateur connecté
// @route   GET /api/auth/me
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    // req.user est injecté par le middleware protect
    res.json({ user: userPayload(req.user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier le mot de passe de l'utilisateur connecté
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

    if (nouveauPassword.length < 6) {
      return res
        .status(400)
        .json({
          message:
            "Le nouveau mot de passe doit contenir au moins 6 caractères",
        });
    }

    const user = await User.findById(req.user._id).select("+password");
    const valid = await user.comparePassword(ancienPassword);

    if (!valid) {
      return res.status(401).json({ message: "Ancien mot de passe incorrect" });
    }

    const salt3 = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(nouveauPassword, salt3);
    await user.save({ validateBeforeSave: false }); // déclenche le hook pre('save') qui hash le mdp

    res.json({
      message: "Mot de passe mis à jour",
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier le profil (nom, prénom) de l'utilisateur connecté
// @route   PATCH /api/auth/profile
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { nom, prenom } = req.body;
    const champs = {};
    if (nom) champs.nom = nom;
    if (prenom) champs.prenom = prenom;

    const user = await User.findByIdAndUpdate(req.user._id, champs, {
      new: true,
      runValidators: true,
    });

    res.json({ message: "Profil mis à jour", user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister tous les utilisateurs (admin seulement)
// @route   GET /api/auth/users
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Activer ou désactiver un compte utilisateur
// @route   PATCH /api/auth/users/:id/toggle
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const toggleUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    user.actif = !user.actif;
    await user.save();

    res.json({
      message: `Compte ${user.actif ? "activé" : "désactivé"}`,
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updatePassword,
  updateProfile,
  getAllUsers,
  toggleUser,
};
