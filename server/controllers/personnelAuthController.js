const bcrypt   = require("bcryptjs");
const Personnel = require("../models/Personnel");
const mobileTokenService = require("../services/mobileTokenService");

// Sprint M1 : signe un access token court (1h). Le refresh prend le relais.
// Conservée pour les flows qui ne refresh pas (changePassword, updateProfile).
const sign = (personnel) => mobileTokenService.signAccessToken("personnel", personnel);

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

    const { accessToken, refreshToken, expiresIn } = await mobileTokenService.issueTokens({
      audience: "personnel",
      entity:   personnel,
      req,
    });
    return res.json({
      token: accessToken,
      refreshToken,
      expiresIn,
      personnel: personnelPayload(personnel),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/personnel/auth/refresh
// Body : { refreshToken }
// Rotation stricte : l'ancien refresh est révoqué immédiatement.
const refresh = async (req, res) => {
  try {
    const { refreshToken: rawRefresh } = req.body || {};
    if (!rawRefresh) {
      return res.status(400).json({ message: "refreshToken requis" });
    }

    const result = await mobileTokenService.rotateTokens({
      audience:        "personnel",
      rawRefreshToken: rawRefresh,
      loadEntity:      async (userId) => {
        const p = await Personnel.findById(userId);
        if (!p || !p.actif) return null;
        return p;
      },
      req,
    });

    if (!result) {
      return res.status(401).json({ message: "Refresh token invalide ou expiré" });
    }

    return res.json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      personnel: personnelPayload(result.entity),
    });
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

// POST /api/v1/personnel/auth/avatar
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu" });
    const relativePath = `/uploads/avatars/${req.file.filename}`;
    await Personnel.findByIdAndUpdate(req.personnel._id, { photoUrl: relativePath });
    // Return both relative path and absolute URL for convenience
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    return res.json({ url: `${baseUrl}${relativePath}`, path: relativePath });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/personnel/auth/documents
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu" });
    const relativePath = `/uploads/documents/${req.file.filename}`;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    return res.json({ url: `${baseUrl}${relativePath}`, path: relativePath });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/personnel/auth/fcm-token (Sprint M4)
// Body : { token } — enregistre/met à jour le token FCM du chauffeur.
const registerFcmToken = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: "token requis" });
    await Personnel.findByIdAndUpdate(req.personnel._id, { fcmToken: token });
    return res.json({ message: "Token FCM enregistré" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/v1/personnel/auth/fcm-token (Sprint M4)
// Efface le token FCM (au logout côté app pour éviter d'envoyer des push
// au device de l'utilisateur après son logout).
const deleteFcmToken = async (req, res) => {
  try {
    await Personnel.findByIdAndUpdate(req.personnel._id, { fcmToken: null });
    return res.json({ message: "Token FCM supprimé" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/personnel/auth/logout
// Body : { refreshToken? } — best-effort, on tente de révoquer le refresh
// fourni s'il en existe un (single-device logout). Si absent, on clear juste
// fcmToken comme avant (rétrocompat avec les anciens clients).
const logout = async (req, res) => {
  try {
    const { refreshToken: rawRefresh } = req.body || {};
    if (rawRefresh) {
      await mobileTokenService.revokeToken(rawRefresh).catch(() => {});
    }
    await Personnel.findByIdAndUpdate(req.personnel._id, { fcmToken: null });
    return res.json({ message: "Déconnecté" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  login, refresh, changePassword, me, logout, updateProfile, uploadAvatar, uploadDocument,
  registerFcmToken, deleteFcmToken,
};
