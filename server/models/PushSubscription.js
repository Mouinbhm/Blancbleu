/**
 * BlancBleu — PushSubscription (Web Push API)
 *
 * Une souscription par device/navigateur d'un user. Le `endpoint` est unique
 * (l'URL fournie par le push service du navigateur) — sert de clé de
 * dédoublonnage. Si un user se désabonne, on supprime sa sub plutôt que de
 * la marquer "active=false" (pas d'usage pour la conserver).
 */
const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true, index: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
