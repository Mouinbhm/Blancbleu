/**
 * BlancBleu — Queues BullMQ
 *
 * BullMQ exige une connexion Redis (`maxRetriesPerRequest: null`). Comme
 * Redis est optionnel en dev local (cf. utils/redis.js), on stub les queues
 * quand Redis n'est pas dispo : .add() devient un no-op résolu, donc le code
 * appelant continue à fonctionner sans erreur (l'email/OCR/PDF n'est juste
 * pas traité en background — à exécuter manuellement ou en mode synchrone
 * via les `_*Now` doers).
 */

const Redis = require("ioredis");
const logger = require("../utils/logger");

const QUEUES = {
  EMAIL:   "email",
  OCR:     "ocr",
  PDF:     "pdf",
  CLEANUP: "cleanup",
  AI:      "ai",
};

let connection;
let queues = {};

const stubQueues = () =>
  Object.fromEntries(
    Object.values(QUEUES).map((name) => [
      name,
      { add: async () => ({ id: `mock-${name}-${Date.now()}` }), name, _stub: true },
    ]),
  );

const redisDisabled =
  process.env.NODE_ENV === "test" ||
  process.env.REDIS_DISABLED === "true" ||
  !process.env.REDIS_URL;

if (redisDisabled) {
  if (process.env.NODE_ENV !== "test") {
    logger.warn("BullMQ désactivé (REDIS_DISABLED ou pas de Redis) — jobs async no-op");
  }
  queues = stubQueues();
} else {
  try {
    const { Queue } = require("bullmq");

    connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,        // requis par BullMQ v5+
      enableReadyCheck: true,
      enableOfflineQueue: false,          // fail fast quand Redis est down
      retryStrategy: (times) => Math.min(times * 200, 30_000),
      reconnectOnError: () => true,
    });

    // Log throttle pour ne pas spammer
    let lastErrLog = 0;
    connection.on("error", (err) => {
      const now = Date.now();
      if (now - lastErrLog > 60_000) {
        logger.warn("BullMQ Redis erreur (jobs en attente)", { err: err.message });
        lastErrLog = now;
      }
    });

    queues = Object.fromEntries(
      Object.values(QUEUES).map((name) => [
        name,
        new Queue(name, {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { age: 24 * 3600, count: 1000 },
            removeOnFail:     { age: 7 * 24 * 3600 },
          },
        }),
      ]),
    );
  } catch (err) {
    logger.warn("BullMQ init échoué, fallback stubs", { err: err.message });
    queues = stubQueues();
  }
}

module.exports = { QUEUES, queues, connection };
