const rateLimit = require("express-rate-limit");
const { MemoryStore } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redis, withTimeout } = require("../utils/redis");

// ─── Formateur de réponse uniforme ────────────────────────────────────────────
const handler = (req, res) => {
  res.status(429).json({
    message: "Trop de requêtes. Veuillez patienter avant de réessayer.",
    retryAfter: res.getHeader("Retry-After"),
  });
};

// ─── Store partagé Redis pour le rate limiting multi-instance ────────────────
// Quand Redis est indisponible (test, REDIS_DISABLED, stub no-op) → on retombe
// sur le store mémoire par défaut. Suffisant en dev/test ; en prod multi-instance,
// monter Redis pour partager les quotas entre containers.
//
// Cas plus vicieux : REDIS_URL est configuré mais le serveur Redis est DOWN.
// Le store était alors branché sur Redis et chaque requête restait pendue —
// `redis.call()` part dans l'offline queue d'ioredis et ne se résout jamais, et
// rate-limit-redis fait `await this.incrementScriptSha` avant chaque increment.
// Résultat : tout le trafic passant par globalLimiter (donc le login) figeait.
// ResilientRedisStore bascule sur un MemoryStore tant que Redis ne répond pas,
// puis repasse sur Redis dès qu'il revient (les compteurs repartent de zéro à
// la bascule — dégradation assumée, on préfère ça à une API bloquée).
class ResilientRedisStore {
  // Les quotas ne sont pas partagés entre instances pendant la bascule mémoire,
  // mais false évite le warning `unsharedStore` d'express-rate-limit.
  localKeys = false;

  constructor(prefix) {
    this.redisStore = new RedisStore({
      sendCommand: (...args) => {
        // Fail-fast plutôt que de laisser la commande dormir dans l'offline queue.
        if (redis.status !== "ready") throw new Error("Redis indisponible");
        // Redis peut mourir entre ce test et la réponse : withTimeout garantit
        // que la promesse finit par se résoudre (rejection avalée plus bas).
        return withTimeout(redis.call(...args));
      },
      prefix: `bb:rl:${prefix}:`,
    });
    this.memoryStore = new MemoryStore();
  }

  get active() {
    return redis.status === "ready" ? this.redisStore : this.memoryStore;
  }

  init(options) {
    this.memoryStore.init(options);
    // express-rate-limit n'attend PAS la promesse retournée par init() : une
    // rejection non catchée tuerait le process (unhandled rejection). Si le
    // SCRIPT LOAD échoue, rate-limit-redis le recharge tout seul au premier
    // increment qui repasse par Redis.
    Promise.resolve(this.redisStore.init(options)).catch(() => {});
  }

  async increment(key) {
    try {
      return await this.active.increment(key);
    } catch {
      return this.memoryStore.increment(key);
    }
  }

  async decrement(key) {
    try {
      await this.active.decrement(key);
    } catch {
      /* best-effort */
    }
  }

  async resetKey(key) {
    try {
      await this.active.resetKey(key);
    } catch {
      /* best-effort */
    }
  }

  async resetAll() {
    try {
      await this.active.resetAll?.();
    } catch {
      /* best-effort */
    }
  }

  async get(key) {
    try {
      return await this.active.get(key);
    } catch {
      return undefined;
    }
  }
}

function makeStore(prefix) {
  if (process.env.NODE_ENV === "test") return undefined;
  if (redis._stub) return undefined;
  return new ResilientRedisStore(prefix);
}

// ─── 1. Auth : login + forgot-password ───────────────────────────────────────
// 10 tentatives / 15 minutes par IP — bloque le brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: false,
  store: makeStore("auth"),
});

// ─── 2. Register : création de compte ────────────────────────────────────────
// 5 créations / heure par IP — protection même si la route est restreinte
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: makeStore("register"),
});

// ─── 3. Module IA : prédictions coûteuses ────────────────────────────────────
// 30 requêtes / minute par IP — évite l'épuisement du service Flask
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: makeStore("ai"),
});

// ─── 4. Global : toutes les autres routes ────────────────────────────────────
// 200 requêtes / minute par IP — filet de sécurité général
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: (req) => req.path === "/api/health",
  store: makeStore("global"),
});

// ─── 5. 2FA : vérification de codes TOTP ─────────────────────────────────────
// 5 tentatives / 5 minutes — protection contre le brute force des codes TOTP
const twoFaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: true,
  store: makeStore("2fa"),
});

module.exports = { authLimiter, registerLimiter, aiLimiter, globalLimiter, twoFaLimiter };
