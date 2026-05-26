/**
 * BlancBleu — Push Notification Service (FCM, Sprint M4 refactor).
 *
 * Envoi de notifications Firebase Cloud Messaging vers les apps driver et
 * patient. Initialise firebase-admin **uniquement** si `FIREBASE_SERVICE_ACCOUNT`
 * est défini. Sinon → no-op silencieux : l'app tourne sans push (socket +
 * notifs locales restent fonctionnels).
 *
 * Format accepté pour `FIREBASE_SERVICE_ACCOUNT` :
 *   - JSON inline (commence par `{`)
 *   - JSON encodé base64 (utile pour les env vars longues)
 *   - chemin de fichier absolu/relatif vers le service account JSON
 *
 * Message hybride (recommandé FCM) : on émet **toujours** un bloc `notification`
 * (pour que le système affiche le push quand l'app est tuée) **et** un bloc
 * `data` (pour le deep-link / traitement par l'app au tap). Android priority
 * "high" + channelId pour les events critiques (mission assignée).
 *
 * Cleanup token périmé : si FCM renvoie `messaging/registration-token-not-registered`,
 * on appelle un callback (fourni par le caller) pour supprimer le token en base.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

let _messaging = null;
let _enabled = false;

function _parseServiceAccount(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // 1. JSON inline
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  }
  // 2. JSON base64
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8").trim();
    if (decoded.startsWith("{")) return JSON.parse(decoded);
  } catch { /* fallthrough */ }
  // 3. Chemin de fichier
  try {
    const filePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch { /* fallthrough */ }
  return null;
}

(function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    logger.info("[PushNotification] FIREBASE_SERVICE_ACCOUNT absent — push désactivé (dégradation gracieuse)");
    return;
  }
  const sa = _parseServiceAccount(raw);
  if (!sa) {
    logger.warn("[PushNotification] FIREBASE_SERVICE_ACCOUNT invalide (ni JSON ni base64 ni chemin) — push désactivé");
    return;
  }
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    }
    _messaging = admin.messaging();
    _enabled = true;
    logger.info("[PushNotification] Firebase Admin SDK initialisé (projectId=" + (sa.project_id || "?") + ")");
  } catch (err) {
    logger.warn("[PushNotification] Firebase init échoué : " + err.message + " — push désactivé");
  }
})();

function isEnabled() { return _enabled; }

/**
 * Construit le message FCM hybride (notification + data + android tuning).
 * @private
 */
function _buildMessage(token, { title, body, data = {}, channelId, sound, priority }) {
  // Toutes les valeurs `data` doivent être des strings (contrainte FCM).
  const stringData = Object.fromEntries(
    Object.entries(data || {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
  );

  const msg = {
    token,
    notification: { title, body },
    data: stringData,
    android: {
      priority: priority || "high",
      notification: {
        channelId: channelId || "blancbleu_default",
        sound: sound || "default",
        // visibility:'public' → affichage écran verrouillé. Le body doit
        // rester générique (cf. étape 7 RGPD).
        visibility: "public",
      },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: {
        aps: {
          alert: { title, body },
          sound: sound || "default",
          "content-available": 1,
        },
      },
    },
  };
  return msg;
}

/**
 * Envoie une notification à un token unique.
 * @param {string} fcmToken
 * @param {{ title, body, data?, channelId?, sound?, priority? }} payload
 * @param {{ onInvalidToken?: (token:string) => Promise<void> }} [hooks]
 *        onInvalidToken : appelé si FCM rejette le token (caller supprime en DB).
 */
async function sendToToken(fcmToken, payload, hooks = {}) {
  if (!_enabled) return { skipped: "push_disabled" };
  if (!fcmToken) return { skipped: "no_token" };
  try {
    const messageId = await _messaging.send(_buildMessage(fcmToken, payload));
    return { success: true, messageId };
  } catch (err) {
    const code = err?.errorInfo?.code || err?.code || "";
    if (code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token") {
      logger.info("[PushNotification] Token périmé → cleanup demandé : " + fcmToken.slice(0, 20) + "...");
      try { await hooks.onInvalidToken?.(fcmToken); } catch (e) {
        logger.warn("[PushNotification] onInvalidToken hook échoué : " + e.message);
      }
      return { error: code, cleaned: true };
    }
    logger.warn("[PushNotification] Envoi échoué (" + code + ") : " + err.message);
    return { error: err.message, code };
  }
}

/**
 * Envoie en multicast à plusieurs tokens. Renvoie successCount + failureCount
 * + la liste des tokens invalides (à supprimer par le caller).
 */
async function sendToTokens(tokens, payload) {
  if (!_enabled) return { skipped: "push_disabled" };
  const list = (tokens || []).filter((t) => typeof t === "string" && t.length > 0);
  if (list.length === 0) return { skipped: "no_tokens" };

  try {
    const messages = list.map((t) => _buildMessage(t, payload));
    const res = await _messaging.sendEach(messages);
    const invalidTokens = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token") {
          invalidTokens.push(list[i]);
        }
      }
    });
    return {
      successCount: res.successCount,
      failureCount: res.failureCount,
      invalidTokens,
    };
  } catch (err) {
    logger.warn("[PushNotification] Multicast échoué : " + err.message);
    return { error: err.message };
  }
}

// ─── Rétrocompat (anciennes signatures, utilisées dans driverController etc.) ─

/** @deprecated — utiliser `sendToToken` directement. Gardé pour rétrocompat. */
async function sendPush({ token, title, body, data = {} }) {
  return sendToToken(token, { title, body, data });
}

/**
 * Notifie un patient par son User._id. Lookup auto du fcmToken.
 * Cleanup automatique si le token est périmé (suppression en base).
 */
async function notifyPatient({ userId, title, body, data = {}, channelId }) {
  if (!_enabled) return { skipped: "push_disabled" };
  try {
    const User = require("../models/User");
    const user = await User.findById(userId).select("fcmToken").lean();
    if (!user?.fcmToken) return { skipped: "no_token" };
    return sendToToken(user.fcmToken, { title, body, data, channelId }, {
      onInvalidToken: async () => {
        await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
      },
    });
  } catch (err) {
    logger.warn("[PushNotification] notifyPatient échoué : " + err.message);
  }
}

/**
 * Notifie un patient par email (recherche User patient).
 */
async function notifyPatientByEmail({ email, title, body, data = {}, channelId }) {
  if (!_enabled) return { skipped: "push_disabled" };
  try {
    const User = require("../models/User");
    const user = await User.findOne({ email, role: "patient" })
      .select("fcmToken _id").lean();
    if (!user?.fcmToken) return { skipped: "no_token" };
    return sendToToken(user.fcmToken, { title, body, data, channelId }, {
      onInvalidToken: async () => {
        await User.findByIdAndUpdate(user._id, { $unset: { fcmToken: 1 } });
      },
    });
  } catch (err) {
    logger.warn("[PushNotification] notifyPatientByEmail échoué : " + err.message);
  }
}

module.exports = {
  isEnabled,
  sendToToken,
  sendToTokens,
  // Rétrocompat
  sendPush,
  notifyPatient,
  notifyPatientByEmail,
};
