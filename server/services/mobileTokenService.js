/**
 * BlancBleu — Mobile token service
 *
 * Gestion access + refresh tokens pour les apps mobiles (driver + patient).
 * Les apps mobiles n'utilisent PAS les cookies httpOnly (trop fragiles sur
 * mobile) — les tokens sont transportés dans le BODY JSON :
 *
 *   POST .../login    →  { token: <jwt>, refreshToken: <opaque>, ... }
 *   POST .../refresh  →  body { refreshToken } → { token, refreshToken } (rotation)
 *
 * Différences avec le web :
 *  - Pas de Set-Cookie. Le mobile stocke les 2 tokens en secure storage.
 *  - Rotation à chaque refresh (l'ancien refresh est révoqué immédiatement).
 *  - audience = "personnel" ou "patient" (distinct du "web" cookie-based).
 *
 * NB : access token signé via JWT (process.env.JWT_SECRET). Refresh token
 * opaque (40 bytes hex), hashé SHA-256 avant stockage.
 */

const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/RefreshToken");

const ACCESS_TTL_SECONDS = 60 * 60; // 1 heure

/**
 * Signe un access token JWT pour une audience donnée.
 * @param {"personnel"|"patient"} audience
 * @param {Object} entity - personnel ou User patient (avec _id minimum)
 */
function signAccessToken(audience, entity) {
  const base = { id: entity._id };
  if (audience === "personnel") {
    Object.assign(base, {
      email:  entity.email,
      role:   entity.role,
      type:   "personnel",
      nom:    entity.nom    || "",
      prenom: entity.prenom || "",
    });
  } else if (audience === "patient") {
    Object.assign(base, {
      email: entity.email,
      role:  "patient",
      type:  "patient",
    });
  }
  return jwt.sign(base, process.env.JWT_SECRET, { expiresIn: `${ACCESS_TTL_SECONDS}s` });
}

/**
 * Émet un couple { accessToken, refreshToken } pour un login mobile.
 */
async function issueTokens({ audience, entity, req }) {
  const accessToken = signAccessToken(audience, entity);
  const { rawToken: refreshToken } = await RefreshToken.issue({
    userId:    entity._id,
    audience,
    userAgent: req?.headers?.["user-agent"]?.slice(0, 200) || "",
    ip:        req?.ip || "",
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

/**
 * Rotation refresh : vérifie l'ancien, l'invalide, émet un nouveau couple.
 * @param {Object} loadEntity - fn(userId) => Promise<entity|null>
 * @returns {Promise<{ accessToken, refreshToken, entity } | null>}
 */
async function rotateTokens({ audience, rawRefreshToken, loadEntity, req }) {
  if (!rawRefreshToken) return null;

  const tokenDoc = await RefreshToken.findValidByAudience(rawRefreshToken, audience);
  if (!tokenDoc) return null;

  const entity = await loadEntity(tokenDoc.userId);
  if (!entity) return null;

  // Révoque l'ancien AVANT d'émettre le nouveau (rotation stricte).
  await RefreshToken.updateOne(
    { _id: tokenDoc._id },
    { revoked: true, revokedAt: new Date(), revokedReason: "rotated" },
  );

  const { accessToken, refreshToken, expiresIn } = await issueTokens({
    audience, entity, req,
  });
  return { accessToken, refreshToken, expiresIn, entity };
}

/**
 * Révoque un refresh token (logout single-device).
 */
async function revokeToken(rawRefreshToken) {
  return RefreshToken.revokeRaw(rawRefreshToken, "logout");
}

module.exports = {
  signAccessToken,
  issueTokens,
  rotateTokens,
  revokeToken,
  ACCESS_TTL_SECONDS,
};
