const mongoose = require("mongoose");
const crypto = require("crypto");

const refreshTokenSchema = new mongoose.Schema(
  {
    // Référence à l'utilisateur propriétaire du token.
    // Le ref "User" est conservé pour le web (qui populate via cookies). Pour
    // les audiences "personnel" et "patient", on ne populate pas — on récupère
    // l'entité dans sa propre collection au moment de la rotation.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Audience : distingue les tokens mobile (refresh dans body) du web
    // (refresh en cookie httpOnly). Indispensable car les userId vivent dans
    // des collections différentes (User pour web/patient, Personnel pour driver).
    audience: {
      type: String,
      enum: ["web", "personnel", "patient"],
      default: "web",
      index: true,
    },

    // Token stocké hashé (SHA-256) — la valeur brute n'est jamais persistée
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    // Métadonnées pour l'audit de sécurité
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },

    // Révocation manuelle (logout, changement de mot de passe, rotation)
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },

    // Expiration : 7 jours
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

// TTL MongoDB — suppression automatique après expiration
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index composite pour la révocation par userId (logout de tous les appareils)
refreshTokenSchema.index({ userId: 1, revoked: 1 });
// Index pour les lookups par audience
refreshTokenSchema.index({ userId: 1, audience: 1, revoked: 1 });

// ─── Helpers statiques ───────────────────────────────────────────────────────

// Hash un token brut avant de le stocker ou comparer
refreshTokenSchema.statics.hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

// Trouver un token valide (non révoqué, non expiré) par valeur brute — web only.
// Le populate "userId" suppose audience web (User collection).
refreshTokenSchema.statics.findValid = function (rawToken) {
  const hash = this.hashToken(rawToken);
  return this.findOne({
    tokenHash: hash,
    revoked: false,
    expiresAt: { $gt: new Date() },
  }).populate("userId");
};

// Lookup audience-aware, sans populate (utilisé par les flux mobile).
refreshTokenSchema.statics.findValidByAudience = function (rawToken, audience) {
  const hash = this.hashToken(rawToken);
  return this.findOne({
    tokenHash: hash,
    audience,
    revoked: false,
    expiresAt: { $gt: new Date() },
  });
};

// Génère + persiste un refresh token. Renvoie { rawToken, doc }.
refreshTokenSchema.statics.issue = async function ({ userId, audience, userAgent = "", ip = "" }) {
  const raw = crypto.randomBytes(40).toString("hex");
  const doc = await this.create({
    userId,
    audience,
    tokenHash: this.hashToken(raw),
    userAgent,
    ip,
  });
  return { rawToken: raw, doc };
};

// Révoquer tous les tokens d'un utilisateur (logout global)
refreshTokenSchema.statics.revokeAllForUser = function (userId, reason = "logout") {
  return this.updateMany(
    { userId, revoked: false },
    { revoked: true, revokedAt: new Date(), revokedReason: reason },
  );
};

// Révoquer un token unique (logout d'un device)
refreshTokenSchema.statics.revokeRaw = async function (rawToken, reason = "logout") {
  if (!rawToken) return null;
  const hash = this.hashToken(rawToken);
  return this.updateOne(
    { tokenHash: hash, revoked: false },
    { revoked: true, revokedAt: new Date(), revokedReason: reason },
  );
};

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);