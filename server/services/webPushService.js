/**
 * BlancBleu — Web Push Service
 *
 * Wrapper autour de la lib web-push. Init lazy au premier appel via les env
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 *
 * Si les VAPID keys ne sont PAS configurées :
 *   - isConfigured() retourne false
 *   - les fonctions send* deviennent no-op (log warn une fois)
 *
 * Nettoyage auto : un push qui retourne 410 (Gone) ou 404 supprime la sub
 * concernée (token expiré / désinscription côté navigateur).
 */

const logger = require("../utils/logger");

let _webpush = null;
let _configured = false;
let _warnedNotConfigured = false;

function _lazyInit() {
  if (_webpush) return _webpush;
  // eslint-disable-next-line global-require
  _webpush = require("web-push");
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    _webpush.setVapidDetails(
      VAPID_SUBJECT || "mailto:contact@blancbleu.fr",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
    );
    _configured = true;
  }
  return _webpush;
}

function isConfigured() {
  _lazyInit();
  return _configured;
}

function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function sendPushToSubscription(sub, payload) {
  const wp = _lazyInit();
  if (!_configured) {
    if (!_warnedNotConfigured) {
      logger.warn("[webPush] VAPID non configuré — push désactivé");
      _warnedNotConfigured = true;
    }
    return { sent: false, reason: "not_configured" };
  }

  try {
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      typeof payload === "string" ? payload : JSON.stringify(payload),
    );
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err, statusCode: err.statusCode };
  }
}

/**
 * Envoie à toutes les subs d'un user. Supprime les subs expirées (410/404).
 */
async function sendToUser(userId, payload) {
  if (!isConfigured()) return { sent: 0, removed: 0 };
  const PushSubscription = require("../models/PushSubscription");

  const subs = await PushSubscription.find({ userId }).lean();
  if (subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const res = await sendPushToSubscription(sub, payload);
      if (res.sent) {
        sent += 1;
        // touch lastUsedAt best-effort
        PushSubscription.updateOne(
          { _id: sub._id },
          { $set: { lastUsedAt: new Date() } },
        ).catch(() => {});
      } else if (res.statusCode === 410 || res.statusCode === 404) {
        await PushSubscription.deleteOne({ _id: sub._id });
        removed += 1;
      } else if (res.error) {
        logger.warn("[webPush] échec push", {
          userId, endpoint: sub.endpoint.slice(0, 80), err: res.error.message,
        });
      }
    }),
  );

  return { sent, removed };
}

/**
 * Envoie à tous les users d'un rôle (ex: "dispatcher", "admin").
 */
async function sendToRole(role, payload) {
  if (!isConfigured()) return { sent: 0, removed: 0, users: 0 };
  const User = require("../models/User");
  const users = await User.find({ role, actif: { $ne: false } }).select("_id").lean();
  if (users.length === 0) return { sent: 0, removed: 0, users: 0 };

  const results = await Promise.all(users.map((u) => sendToUser(u._id, payload)));
  return {
    users: users.length,
    sent:    results.reduce((s, r) => s + r.sent, 0),
    removed: results.reduce((s, r) => s + r.removed, 0),
  };
}

module.exports = {
  isConfigured,
  getPublicKey,
  sendToUser,
  sendToRole,
  // Internes (utiles pour tests)
  _lazyInit,
};
