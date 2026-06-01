/**
 * BlancBleu — Protection CSRF (double-submit cookie).
 *
 * Les sessions reposent sur des cookies httpOnly `bb_access`/`bb_refresh`
 * (envoyés automatiquement par le navigateur). C'est précisément le vecteur
 * CSRF : un site tiers peut déclencher une requête mutante authentifiée.
 *
 * Mitigation déjà en place : `SameSite=Strict` sur les cookies. On ajoute en
 * défense-en-profondeur le pattern **double-submit** (csrf-csrf) : un cookie
 * `bb_csrf` + un header `X-CSRF-Token` que seul un script same-origin peut
 * lire/poser. Le serveur vérifie que les deux concordent.
 *
 * Exclusions (pas de cookie de session → CSRF non applicable) :
 *   - Webhooks externes (Stripe) — pas d'accès aux cookies, signés HMAC.
 *   - Routes service-to-service (microservice IA) — auth par AI_SERVICE_TOKEN.
 *   - App mobile (driver/patient) — auth par Bearer header, pas par cookie.
 *
 * Désactivable via CSRF_ENABLED=false (tests E2E, debug).
 */

const { doubleCsrf } = require("csrf-csrf");
const logger = require("../utils/logger");

const ENABLED =
  process.env.CSRF_ENABLED === "true" ||
  (process.env.CSRF_ENABLED === undefined && process.env.NODE_ENV === "production");

const isProd = process.env.NODE_ENV === "production";

// Secret du HMAC CSRF. On réutilise JWT_SECRET (déjà fort et présent) faute de
// secret dédié — acceptable car le token CSRF est non-rejouable (lié à la
// session). En prod, un CSRF_SECRET dédié est préférable.
const CSRF_SECRET =
  process.env.CSRF_SECRET || process.env.JWT_SECRET || "dev-csrf-secret-change-me-32chars!!";

const { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  // Lie le token à la session (cookie d'accès). Un token généré pour une
  // session ne vaut pas pour une autre.
  getSessionIdentifier: (req) => req.cookies?.bb_access || req.ip || "anon",
  cookieName: isProd ? "__Host-bb_csrf" : "bb_csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: isProd,
    path: "/",
  },
  size: 32,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});

// Préfixes exclus de la vérification CSRF (server-to-server / mobile / webhook).
const EXCLUDED_PREFIXES = [
  "/api/payments/stripe/webhook", // signé HMAC Stripe
  "/api/ai/training-data", // service-to-service (AI_SERVICE_TOKEN)
  "/api/ai/model", // service-to-service
  "/api/v1/", // app mobile driver/patient (Bearer)
  "/api/patient", // app mobile patient (Bearer)
  "/api/auth/login", // pas encore de session
  "/api/auth/refresh", // protégé par le cookie refresh + rotation
];

function _isExcluded(req) {
  return EXCLUDED_PREFIXES.some((p) => req.path.startsWith(p));
}

/**
 * Middleware de protection : vérifie le token sur les requêtes mutantes
 * (POST/PUT/PATCH/DELETE), no-op sur GET/HEAD/OPTIONS et routes exclues.
 */
function csrfProtection(req, res, next) {
  if (!ENABLED) return next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (_isExcluded(req)) return next();
  return doubleCsrfProtection(req, res, next);
}

/**
 * Handler GET /api/csrf-token : pose le cookie bb_csrf + renvoie le token que
 * le client doit replacer dans le header X-CSRF-Token.
 */
function csrfTokenHandler(req, res) {
  if (!ENABLED) {
    return res.json({ csrfToken: null, enabled: false });
  }
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken, enabled: true });
}

/**
 * Error handler : transforme l'erreur de token invalide en 403 propre.
 * À monter APRÈS les routes (juste avant le errorHandler global).
 */
function csrfErrorHandler(err, req, res, next) {
  if (err === invalidCsrfTokenError || err?.code === "EBADCSRFTOKEN") {
    logger.warn("[csrf] token invalide ou manquant", { path: req.path, method: req.method });
    return res.status(403).json({
      message: "Token CSRF invalide ou manquant",
      code: "EBADCSRFTOKEN",
    });
  }
  return next(err);
}

module.exports = {
  csrfProtection,
  csrfTokenHandler,
  csrfErrorHandler,
  _isEnabled: () => ENABLED,
};
