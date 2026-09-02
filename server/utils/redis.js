/**
 * Client Redis partagé — cache + sessions distribuées.
 *
 * Redis est OPTIONNEL : si REDIS_DISABLED=true OU si la connexion ne peut pas
 * être établie, on retombe sur un stub no-op. Les helpers (getJSON, setJSON,
 * del, delPattern) sont best-effort : ils n'échouent jamais et renvoient null
 * sur cache miss.
 *
 * Auto-désactivation :
 *   - NODE_ENV=test         → stub (les tests n'utilisent pas Redis)
 *   - REDIS_DISABLED=true   → stub
 *   - Si la connexion plante en dev, ioredis retry indéfiniment (silencieux)
 *     sans crash grâce à maxRetriesPerRequest:null + enableOfflineQueue:false.
 */

const Redis = require("ioredis");
const logger = require("./logger");

function makeStub(reason) {
  if (reason) logger.warn(`Redis désactivé : ${reason}`);
  const noop = async () => null;
  return {
    get: noop,
    set: noop,
    del: noop,
    keys: async () => [],
    call: noop,
    on: () => {},
    quit: noop,
    status: "ready",
    _stub: true,
  };
}

function makeClient() {
  if (process.env.NODE_ENV === "test") return makeStub();
  if (process.env.REDIS_DISABLED === "true") return makeStub("REDIS_DISABLED=true");
  if (!process.env.REDIS_URL) return makeStub("REDIS_URL absent — cache/rate-limiter en mémoire");

  const url = process.env.REDIS_URL;
  const client = new Redis(url, {
    // null = retry indéfiniment sans jamais throw MaxRetriesPerRequestError
    maxRetriesPerRequest: null,
    // Buffer les commandes émises avant que la connexion soit prête.
    //
    // ioredis se connecte de façon ASYNCHRONE : au require-time, plusieurs
    // modules envoient déjà des commandes — middleware/rateLimiter.js construit
    // ses RedisStore (express-rate-limit appelle store.init() → SCRIPT LOAD) et
    // Server.js branche l'adapter Socket.IO (psubscribe). Avec
    // enableOfflineQueue:false, ces commandes lèvent immédiatement
    // "Stream isn't writeable and enableOfflineQueue options is false" et le
    // process meurt au boot — alors que Redis est parfaitement joignable.
    // En file d'attente, elles partent dès que la connexion est prête.
    //
    // La résilience en RUNTIME reste assurée par maxRetriesPerRequest:null +
    // retryStrategy (reconnexion) et par le wrapper safe() qui avale les
    // erreurs de cache.
    enableOfflineQueue: true,
    // PAS de `commandTimeout` ici : il ferait rejeter TOUTES les commandes,
    // y compris les fire-and-forget que personne ne catche (psubscribe /
    // subscribe / publish du redis-adapter Socket.IO) → unhandled rejection →
    // crash du process. Le timeout est appliqué par withTimeout() ci-dessous,
    // uniquement sur les appels dont on possède le catch.
    enableReadyCheck: true,
    lazyConnect: false,
    // Backoff exponentiel sur la reconnexion (max 30s)
    retryStrategy: (times) => Math.min(times * 200, 30_000),
    // Ne pas crash sur les commandes en erreur
    reconnectOnError: () => true,
  });

  client.on("connect", () => logger.info("Redis connecté"));

  // Log d'erreur throttle : 1 message au début, puis 1 toutes les 60s
  let lastErrLog = 0;
  client.on("error", (err) => {
    const now = Date.now();
    if (now - lastErrLog > 60_000) {
      logger.warn("Redis erreur (cache désactivé tant que down)", { err: err.message });
      lastErrLog = now;
    }
  });

  return client;
}

const redis = makeClient();

const COMMAND_TIMEOUT_MS = 5_000;

/**
 * Borne une commande Redis dans le temps.
 *
 * Avec enableOfflineQueue:true + maxRetriesPerRequest:null, une commande émise
 * pendant que Redis est down part dans la file d'attente et sa promesse ne se
 * résout JAMAIS — ni succès, ni erreur. Tout `await` dessus pend pour de bon.
 * À n'utiliser que sur un appel dont l'appelant catche la rejection.
 */
function withTimeout(promise, ms = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis command timeout")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const safe = async (op, fallback = null) => {
  if (redis._stub) return fallback;
  // Court-circuit tant que la connexion n'est pas prête : on rend la main
  // immédiatement au lieu d'attendre le timeout à chaque appel.
  if (redis.status !== "ready") return fallback;
  try {
    return await withTimeout(op());
  } catch {
    return fallback;
  }
};

/** Cache wrapper avec TTL (secondes). Renvoie null si miss/échec. */
async function getJSON(key) {
  const raw = await safe(() => redis.get(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setJSON(key, value, ttlSeconds) {
  await safe(() => redis.set(key, JSON.stringify(value), "EX", ttlSeconds));
}

async function del(key) {
  await safe(() => redis.del(key));
}

async function delPattern(pattern) {
  const keys = await safe(() => redis.keys(pattern), []);
  if (keys && keys.length) await safe(() => redis.del(...keys));
}

module.exports = { redis, getJSON, setJSON, del, delPattern, withTimeout };
