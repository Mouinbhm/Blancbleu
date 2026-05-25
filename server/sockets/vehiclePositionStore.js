/**
 * BlancBleu — Vehicle position store (Sprint M2 — multi-instance ready).
 *
 * Avant M2 : `Map` mémoire dans driverSocket.js, perdue à chaque redéploiement
 * et invisible des autres instances en cas de scaling horizontal.
 *
 * Après M2 : clés Redis `vehicle:position:{id}` avec TTL court (120 s). Si
 * une position n'a pas été mise à jour depuis 2 min, elle disparaît
 * naturellement du snapshot — évite les positions fantômes.
 *
 * Fallback : si Redis est en mode stub (NODE_ENV=test ou REDIS_DISABLED ou
 * REDIS_URL absent), on retombe sur une Map en mémoire. Pas de scaling
 * horizontal possible en dev/test — c'est cohérent avec le reste du stack.
 */

const { redis } = require("../utils/redis");

const KEY_PREFIX = "vehicle:position:";
const TTL_SECONDS = 120;

// Fallback Map mémoire (utilisée quand Redis._stub)
const _memory = new Map();

const _redisUsable = !redis._stub;

async function set(vehicleId, payload) {
  if (!vehicleId) return;
  if (!_redisUsable) {
    _memory.set(String(vehicleId), payload);
    return;
  }
  try {
    await redis.set(
      KEY_PREFIX + String(vehicleId),
      JSON.stringify(payload),
      "EX",
      TTL_SECONDS,
    );
  } catch {
    // Best-effort : ne JAMAIS faire crasher l'emit GPS si Redis hoquete
    _memory.set(String(vehicleId), payload);
  }
}

async function get(vehicleId) {
  if (!vehicleId) return null;
  if (!_redisUsable) return _memory.get(String(vehicleId)) || null;
  try {
    const raw = await redis.get(KEY_PREFIX + String(vehicleId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return _memory.get(String(vehicleId)) || null;
  }
}

/**
 * Snapshot complet : { vehicleId: payload, ... }.
 * Utilisé par sockets/index.js pour pousser l'état initial à un staff qui
 * vient de se connecter.
 */
async function getAll() {
  if (!_redisUsable) {
    return Object.fromEntries(_memory);
  }
  try {
    const keys = await redis.keys(KEY_PREFIX + "*");
    if (!keys || keys.length === 0) return {};
    const values = await Promise.all(keys.map((k) => redis.get(k)));
    const out = {};
    for (let i = 0; i < keys.length; i += 1) {
      const id = keys[i].slice(KEY_PREFIX.length);
      try {
        out[id] = values[i] ? JSON.parse(values[i]) : null;
      } catch {
        out[id] = null;
      }
    }
    return out;
  } catch {
    return Object.fromEntries(_memory);
  }
}

/** Tests : reset complet. */
async function _reset() {
  _memory.clear();
  if (_redisUsable) {
    try {
      const keys = await redis.keys(KEY_PREFIX + "*");
      if (keys && keys.length) await redis.del(...keys);
    } catch { /* best-effort */ }
  }
}

module.exports = {
  set,
  get,
  getAll,
  _reset,
  _isRedisUsable: () => _redisUsable,
  TTL_SECONDS,
};
