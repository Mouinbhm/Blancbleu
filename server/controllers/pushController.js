/**
 * BlancBleu — Controller Web Push subscriptions
 */
const PushSubscription = require("../models/PushSubscription");
const webPush          = require("../services/webPushService");
const logger           = require("../utils/logger");

// ── GET /api/notifications/push/vapid-public-key (PUBLIC) ───────────────────
exports.getVapidPublicKey = (_req, res) => {
  const key = webPush.getPublicKey();
  if (!key) {
    return res.status(503).json({
      message: "Web Push non configuré côté serveur (VAPID keys manquantes)",
    });
  }
  res.json({ publicKey: key });
};

// ── POST /api/notifications/push/subscribe ──────────────────────────────────
exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: "Subscription invalide (endpoint + keys.p256dh + keys.auth requis)" });
    }

    const doc = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId:    req.user._id,
          endpoint:  subscription.endpoint,
          keys:      { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
          userAgent: req.headers["user-agent"]?.slice(0, 200) || "",
        },
      },
      { upsert: true, new: true },
    );

    logger.info("[webPush] subscription enregistrée", { userId: req.user._id });
    res.json({ success: true, id: doc._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/notifications/push/unsubscribe ──────────────────────────────
exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ message: "endpoint requis" });

    const result = await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
    res.json({ success: true, removed: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/notifications/push/status ──────────────────────────────────────
exports.getStatus = async (req, res) => {
  try {
    const count = await PushSubscription.countDocuments({ userId: req.user._id });
    res.json({
      configured: webPush.isConfigured(),
      subscriptions: count,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
