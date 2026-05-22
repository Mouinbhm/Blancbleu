/**
 * Client Redis partagé — cache + sessions distribuées.
 *
 * Connecte à process.env.REDIS_URL ou localhost:6379 par défaut. Si Redis est
 * indisponible, ioredis tente de reconnecter automatiquement ; les opérations
 * de cache renvoient null/silencieusement.
 */

const Redis  = require("ioredis");
const logger = require("./logger");

// En test, on évite d'ouvrir une vraie connexion Redis — un mock minimal suffit
// (les rate limiters utilisent le store mémoire par défaut quand NODE_ENV=test).
function makeClient() {
  if (process.env.NODE_ENV === "test") {
    const noop = async () => null;
    return {
      get: noop, set: noop, del: noop, keys: async () => [], call: noop,
      on: () => {}, quit: noop, status: "ready",
    };
  }
  const client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on("connect", () => logger.info("Redis connecté"));
  client.on("error",   (err) => logger.warn("Redis erreur", { err: err.message }));
  return client;
}

const redis = makeClient();

/** Cache wrapper avec TTL (secondes). Renvoie null si miss ou parsing JSON KO. */
async function getJSON(key) {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setJSON(key, value, ttlSeconds) {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn("Redis setJSON échoué", { key, err: err.message });
  }
}

async function del(key) {
  try { await redis.del(key); } catch { /* best-effort */ }
}

async function delPattern(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn("Redis delPattern échoué", { pattern, err: err.message });
  }
}

module.exports = { redis, getJSON, setJSON, del, delPattern };
