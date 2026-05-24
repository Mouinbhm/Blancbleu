const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss");
const logger = require("../utils/logger");

// ─── Protection injection NoSQL ───────────────────────────────────────────────
const noSqlSanitize = mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ req, key }) => {
    logger.warn(
      `[SANITIZE] Injection NoSQL détectée — clé: ${key} — IP: ${req.ip}`,
    );
  },
});

// ─── Protection XSS — middleware manuel compatible Node v24 ──────────────────
// xss-clean est abandonné et cassé sur Node 22+. On utilise le package xss
// directement sur les champs texte du body.
const xssSanitize = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
};

function sanitizeObject(obj) {
  if (typeof obj === "string") return xss(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === "object") {
    const clean = {};
    for (const key of Object.keys(obj)) {
      clean[key] = sanitizeObject(obj[key]);
    }
    return clean;
  }
  return obj;
}

module.exports = { noSqlSanitize, xssSanitize };
