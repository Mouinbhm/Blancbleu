const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcryptjs");
const Personnel = require("../models/Personnel");

const sign = (personnel) =>
  jwt.sign(
    {
      id:     personnel._id,
      email:  personnel.email,
      role:   personnel.role,
      type:   "personnel",
      nom:    personnel.nom    || "",
      prenom: personnel.prenom || "",
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" },
  );

const personnelPayload = (p) => ({
  id:                  p._id,
  firstName:           p.prenom,
  lastName:            p.nom,
  email:               p.email,
  role:                p.role,
  status:              p.statut,
  forcePasswordChange: p.forcePasswordChange,
});

// POST /api/v1/personnel/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email et mot de passe requis" });

    const personnel = await Personnel.findOne({ email: email.toLowerCase().trim() })
      .select("+password");

    if (!personnel)
      return res.status(401).json({ message: "Identifiants incorrects" });

    if (!personnel.actif)
      return res.status(403).json({ message: "Compte désactivé" });

    if (!personnel.password)
      return res.status(401).json({ message: "Compte non activé — contactez votre responsable" });

    const valid = await personnel.comparePassword(password);
    if (!valid)
      return res.status(401).json({ message: "Identifiants incorrects" });

    personnel.lastLogin = new Date();
    await personnel.save({ validateBeforeSave: false });

    const token = sign(personnel);
    return res.json({ token, personnel: personnelPayload(personnel) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/personnel/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Les deux mots de passe sont requis" });

    if (newPassword.length < 8)
      return res.status(400).json({ message: "Le nouveau mot de passe doit contenir au moins 8 caractères" });

    const personnel = await Personnel.findById(req.personnel._id).select("+password");
    const valid = await personnel.comparePassword(currentPassword);
    if (!valid)
      return res.status(401).json({ message: "Mot de passe actuel incorrect" });

    personnel.password            = await bcrypt.hash(newPassword, 12);
    personnel.forcePasswordChange = false;
    await personnel.save({ validateBeforeSave: false });

    const token = sign(personnel);
    return res.json({ message: "Mot de passe mis à jour", token });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/v1/personnel/auth/me
const me = async (req, res) => {
  return res.json({ personnel: personnelPayload(req.personnel) });
};

// PATCH /api/v1/personnel/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { nom, prenom, telephone } = req.body;

    const updates = {};
    if (nom      !== undefined) updates.nom       = String(nom).trim();
    if (prenom   !== undefined) updates.prenom    = String(prenom).trim();
    if (telephone !== undefined) updates.telephone = String(telephone).trim();

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: "Aucune donnée à mettre à jour" });

    const personnel = await Personnel.findByIdAndUpdate(
      req.personnel._id,
      { $set: updates },
      { new: true, runValidators: false },
    );

    const token = sign(personnel); // refresh token with updated nom/prenom
    return res.json({ message: "Profil mis à jour", token, personnel: personnelPayload(personnel) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/personnel/auth/logout
const logout = async (req, res) => {
  try {
    await Personnel.findByIdAndUpdate(req.personnel._id, { fcmToken: null });
    return res.json({ message: "Déconnecté" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { login, changePassword, me, logout, updateProfile };
