/**
 * BlancBleu — Push Worker BullMQ (Sprint M4).
 *
 * Consomme les jobs de la queue `push` (mis par pushDispatcher) et appelle
 * pushNotification après résolution du token FCM côté Personnel/User.
 *
 * Cleanup automatique : si FCM rejette le token (`registration-token-not-
 * registered`), on supprime le token périmé en base via le hook onInvalidToken.
 *
 * Job shape : { targetType: 'personnel'|'user'|'user_email', targetId, payload }
 */

const { Worker } = require("bullmq");
const { QUEUES, connection } = require("../queues");
const logger = require("../utils/logger");

async function processPushJob(job) {
  const { targetType, targetId, payload } = job.data || {};
  if (!targetType || !targetId || !payload) {
    logger.warn("[pushWorker] job invalide", { data: job.data });
    return { skipped: "invalid_job" };
  }

  const pushNotification = require("../services/pushNotification");
  if (!pushNotification.isEnabled()) {
    return { skipped: "push_disabled" };
  }

  // Réassignés dans chaque branche du if/else qui suit — l'init à null est
  // dead (eslint no-useless-assignment). Si le if/else ajoutait un cas qui
  // ne réassigne pas, ces variables seraient `undefined`, ce qui est OK et
  // testé par les checks `if (!token)` plus bas.
  let token;
  let cleanupHook;

  try {
    if (targetType === "personnel") {
      const Personnel = require("../models/Personnel");
      const doc = await Personnel.findById(targetId).select("fcmToken").lean();
      token = doc?.fcmToken || null;
      cleanupHook = async () => {
        await Personnel.findByIdAndUpdate(targetId, { fcmToken: null });
      };
    } else if (targetType === "user") {
      const User = require("../models/User");
      const doc = await User.findById(targetId).select("fcmToken").lean();
      token = doc?.fcmToken || null;
      cleanupHook = async () => {
        await User.findByIdAndUpdate(targetId, { $unset: { fcmToken: 1 } });
      };
    } else if (targetType === "user_email") {
      const User = require("../models/User");
      const doc = await User.findOne({ email: targetId, role: "patient" })
        .select("fcmToken _id")
        .lean();
      token = doc?.fcmToken || null;
      const uid = doc?._id;
      cleanupHook = async () => {
        if (uid) await User.findByIdAndUpdate(uid, { $unset: { fcmToken: 1 } });
      };
    } else {
      return { skipped: `unknown_target_type:${targetType}` };
    }

    if (!token) return { skipped: "no_token_in_db" };

    const res = await pushNotification.sendToToken(
      token,
      {
        title: payload.title,
        body: payload.body,
        data: { type: payload.type, ...(payload.data || {}) },
        channelId: payload.channelId,
        sound: payload.sound,
        priority: payload.priority,
      },
      { onInvalidToken: cleanupHook },
    );
    return res;
  } catch (err) {
    logger.warn("[pushWorker] envoi échoué", { err: err.message, targetType, targetId });
    throw err; // BullMQ retentera selon les attempts/backoff du job
  }
}

let pushWorker = null;

if (connection) {
  pushWorker = new Worker(QUEUES.PUSH, processPushJob, { connection, concurrency: 5 });

  pushWorker.on("completed", (job, res) =>
    logger.info(`[worker:push] job ${job.id} (${job.name}) OK`, {
      result: res?.skipped || (res?.success ? "sent" : res?.error || "done"),
    }),
  );
  pushWorker.on("failed", (job, err) =>
    logger.warn(`[worker:push] job ${job?.id} KO`, {
      err: err.message,
      attempts: job?.attemptsMade,
    }),
  );
  pushWorker.on("error", (err) =>
    logger.error("[worker:push] erreur globale", { err: err.message }),
  );
}

module.exports = { pushWorker, processPushJob };
