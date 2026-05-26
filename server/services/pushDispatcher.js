/**
 * BlancBleu — Push Dispatcher (Sprint M4).
 *
 * Helper qui pousse un job dans la queue BullMQ `push` au lieu d'appeler
 * pushNotification directement. Avantages :
 *   - non-bloquant (le caller n'attend pas l'envoi FCM)
 *   - retry automatique via BullMQ si FCM est temporairement KO
 *   - métriques / observabilité centralisées
 *   - tests : on vérifie qu'un job est mis en queue (vs vérifier l'envoi réel)
 *
 * Dégradation gracieuse : si Redis est down, la queue est stubée
 * (cf. queues/index.js) et `add()` renvoie un id mock sans erreur.
 * Si FIREBASE_SERVICE_ACCOUNT absent, le worker est no-op (cf. pushNotification.isEnabled).
 *
 * Usage :
 *   const { pushToDriver, pushToPatientUser } = require('../services/pushDispatcher');
 *   await pushToDriver(personnelId, {
 *     type: 'transport_assigned',
 *     transportId,
 *     title: 'Nouvelle mission',
 *     body: 'TRS-20260524-0001',
 *     channelId: 'blancbleu_critical',
 *   });
 */

const { queues, QUEUES } = require("../queues");
const logger = require("../utils/logger");

/**
 * Pousse un push vers un chauffeur (driver app).
 *
 * @param {string} personnelId — Personnel._id (string ou ObjectId)
 * @param {{
 *   type: string,        // 'transport_assigned' | 'transport_cancelled' | 'message_dispatcher' | 'shift_forced_end' | ...
 *   title: string,
 *   body: string,
 *   channelId?: string,  // Android channel — défaut 'blancbleu_default'
 *   sound?: string,
 *   data?: Object,       // payload libre (transportId, messageId, ...) sérialisé en strings côté worker
 * }} payload
 */
async function pushToDriver(personnelId, payload) {
  if (!personnelId) return { skipped: "no_personnel_id" };
  if (!payload?.type || !payload?.title) {
    logger.warn("[pushDispatcher] payload incomplet — skip", { payload });
    return { skipped: "invalid_payload" };
  }
  try {
    const q = queues[QUEUES.PUSH];
    const job = await q.add(
      "to_driver",
      { targetType: "personnel", targetId: String(personnelId), payload },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
    return { queued: true, jobId: job?.id || null };
  } catch (err) {
    logger.warn("[pushDispatcher] pushToDriver enqueue échoué", { err: err.message });
    return { error: err.message };
  }
}

/**
 * Pousse un push vers un patient mobile (par User._id).
 */
async function pushToPatientUser(userId, payload) {
  if (!userId) return { skipped: "no_user_id" };
  if (!payload?.type || !payload?.title) {
    logger.warn("[pushDispatcher] payload incomplet — skip", { payload });
    return { skipped: "invalid_payload" };
  }
  try {
    const q = queues[QUEUES.PUSH];
    const job = await q.add(
      "to_patient",
      { targetType: "user", targetId: String(userId), payload },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
    return { queued: true, jobId: job?.id || null };
  } catch (err) {
    logger.warn("[pushDispatcher] pushToPatientUser enqueue échoué", { err: err.message });
    return { error: err.message };
  }
}

/**
 * Pousse un push vers un patient mobile (par email — utile quand on n'a que
 * l'email du sous-doc transport.patient.email côté driverController).
 */
async function pushToPatientEmail(email, payload) {
  if (!email) return { skipped: "no_email" };
  if (!payload?.type || !payload?.title) return { skipped: "invalid_payload" };
  try {
    const q = queues[QUEUES.PUSH];
    const job = await q.add(
      "to_patient_email",
      { targetType: "user_email", targetId: email, payload },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
    return { queued: true, jobId: job?.id || null };
  } catch (err) {
    logger.warn("[pushDispatcher] pushToPatientEmail enqueue échoué", { err: err.message });
    return { error: err.message };
  }
}

module.exports = { pushToDriver, pushToPatientUser, pushToPatientEmail };
