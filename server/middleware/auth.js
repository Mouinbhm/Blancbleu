const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ─── Protège les routes avec JWT ──────────────────────────────────────────────
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Non autorisé — token manquant" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user || !req.user.actif) {
      return res.status(401).json({ message: "Compte inactif ou introuvable" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré" });
  }
};

// ─── Restreint à certains rôles ───────────────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Rôle '${req.user.role}' non autorisé pour cette action`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
