/**
 * BlancBleu — Push Notification Service (FCM)
 *
 * Sends Firebase Cloud Messaging push notifications to patient devices.
 * Requires FIREBASE_SERVICE_ACCOUNT env var (JSON string of service account).
 * When not configured, all calls are no-ops — app works normally without push.
 */

let _messaging = null;

(function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return;
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    }
    _messaging = admin.messaging();
    console.log("[PushNotification] Firebase Admin SDK initialisé");
  } catch (err) {
    console.warn("[PushNotification] Firebase non disponible :", err.message);
  }
})();

/**
 * Send a push notification to a single FCM token.
 * @param {{ token: string, title: string, body: string, data?: object }} opts
 */
async function sendPush({ token, title, body, data = {} }) {
  if (!_messaging || !token) return { skipped: true };
  try {
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );
    const messageId = await _messaging.send({
      token,
      notification: { title, body },
      data: stringData,
    });
    return { success: true, messageId };
  } catch (err) {
    console.warn("[PushNotification] Envoi échoué :", err.message);
    return { error: err.message };
  }
}

/**
 * Notify a patient by their User _id.
 * Looks up their fcmToken and sends the push if present.
 */
async function notifyPatient({ userId, title, body, data = {} }) {
  if (!_messaging) return;
  try {
    const User = require("../models/User");
    const user = await User.findById(userId).select("fcmToken").lean();
    if (!user?.fcmToken) return;
    return sendPush({ token: user.fcmToken, title, body, data });
  } catch (err) {
    console.warn("[PushNotification] notifyPatient échoué :", err.message);
  }
}

/**
 * Notify a patient found by their email address.
 */
async function notifyPatientByEmail({ email, title, body, data = {} }) {
  if (!_messaging) return;
  try {
    const User = require("../models/User");
    const user = await User.findOne({ email, role: "patient" }).select("fcmToken _id").lean();
    if (!user?.fcmToken) return;
    return sendPush({ token: user.fcmToken, title, body, data });
  } catch (err) {
    console.warn("[PushNotification] notifyPatientByEmail échoué :", err.message);
  }
}

module.exports = { sendPush, notifyPatient, notifyPatientByEmail };
