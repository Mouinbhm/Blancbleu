const rateLimit = require("express-rate-limit");

// ─── Formateur de réponse uniforme ────────────────────────────────────────────
const handler = (req, res) => {
  res.status(429).json({
    message: "Trop de requêtes. Veuillez patienter avant de réessayer.",
    retryAfter: res.getHeader("Retry-After"),
  });
};

// ─── 1. Auth : login + forgot-password ───────────────────────────────────────
// 10 tentatives / 15 minutes par IP — bloque le brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: false,
});

// ─── 2. Register : création de compte ────────────────────────────────────────
// 5 créations / heure par IP — protection même si la route est restreinte
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// ─── 3. Module IA : prédictions coûteuses ────────────────────────────────────
// 30 requêtes / minute par IP — évite l'épuisement du service Flask
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// ─── 4. Global : toutes les autres routes ────────────────────────────────────
// 200 requêtes / minute par IP — filet de sécurité général
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: (req) => req.path === "/api/health",
});

// ─── 5. 2FA : vérification de codes TOTP ─────────────────────────────────────
// 5 tentatives / 5 minutes — protection contre le brute force des codes TOTP
const twoFaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: true,
});

module.exports = { authLimiter, registerLimiter, aiLimiter, globalLimiter, twoFaLimiter };
