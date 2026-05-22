const jwt = require("jsonwebtoken");

// Routes exemptées — pas d'Origin requis ni de User-Agent applicatif
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/health",
  "/api/payments/stripe/webhook",
];

// User-Agent attendu pour les apps Flutter BlancBleu
const MOBILE_UA = /^BlancBleu(Patient|Driver)\/\d+\.\d+/;

/**
 * Protège les requêtes sans Origin header (non-browser) :
 * - laisse passer les apps BlancBleu (User-Agent reconnu)
 * - laisse passer les sessions valides (cookie bb_access ou Authorization header)
 * - bloque le reste avec 403
 *
 * Actif en production uniquement ; en dev/test les clients locaux et supertest
 * sont des environnements de confiance et ce filtre ne s'applique pas.
 */
module.exports = function mobileGuard(req, res, next) {
  // Requêtes browser normales : Origin header présent → pas concerné par ce guard
  if (req.get("Origin")) return next();

  // En dev/test, ne pas bloquer les outils locaux ni supertest
  if (process.env.NODE_ENV !== "production") return next();

  // Routes publiques exemptées
  if (PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
    return next();
  }

  // Apps mobiles BlancBleu identifiées par leur User-Agent
  const ua = req.get("User-Agent") || "";
  if (MOBILE_UA.test(ua)) return next();

  // Sessions authentifiées : cookie httpOnly bb_access
  const cookieToken = req.cookies?.bb_access;
  if (cookieToken) {
    try {
      jwt.verify(cookieToken, process.env.JWT_SECRET);
      return next();
    } catch {
      // Token expiré ou invalide — on continue vers 403
    }
  }

  // Authorization header (clients API authentifiés)
  const authHeader = req.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      return next();
    } catch {
      // Idem
    }
  }

  return res.status(403).json({ message: "Client non autorisé" });
};
