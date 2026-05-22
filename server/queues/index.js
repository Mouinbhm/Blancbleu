/**
 * BlancBleu — Queues BullMQ
 *
 * Définit une connexion Redis dédiée aux jobs (BullMQ exige
 * `maxRetriesPerRequest: null`) et instancie une Queue par domaine.
 *
 * En test, on n'instancie rien (les jobs sont exécutés en synchronisé via les
 * "doers" exposés par les services).
 */

const Redis = require("ioredis");
const logger = require("../utils/logger");

const QUEUES = {
  EMAIL:   "email",
  OCR:     "ocr",
  PDF:     "pdf",
  CLEANUP: "cleanup",
};

let connection;
let queues = {};

if (process.env.NODE_ENV !== "test") {
  const { Queue } = require("bullmq");

  connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null, // requis par BullMQ v5+
    enableReadyCheck: true,
  });
  connection.on("error", (err) => logger.warn("BullMQ Redis erreur", { err: err.message }));

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
} else {
  // Stubs pour tests : .add() devient un no-op résolu
  queues = Object.fromEntries(
    Object.values(QUEUES).map((name) => [
      name,
      { add: async () => ({ id: `mock-${name}-${Date.now()}` }), name },
    ]),
  );
}

module.exports = { QUEUES, queues, connection };
