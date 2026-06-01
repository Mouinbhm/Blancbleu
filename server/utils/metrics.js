/**
 * Métriques Prometheus exposées sur GET /metrics (protégé par
 * X-Metrics-Token ou Authorization: Bearer, cf. Server.js).
 *
 * Métriques exposées :
 *   - http_request_duration_seconds (histogram)  — durée HTTP par route/statut
 *   - dispatch_recommendations_total (counter)   — recommandations IA générées
 *   - blancbleu_bullmq_queue_jobs (gauge)        — profondeur des files BullMQ
 *   - process_*, nodejs_*                         — default metrics (CPU, RAM, GC)
 */

const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Durée des requêtes HTTP (en secondes), par méthode/route/statut",
  labelNames: ["method", "route", "status"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const dispatchCounter = new client.Counter({
  name: "dispatch_recommendations_total",
  help: "Nombre de recommandations dispatch générées, par source",
  labelNames: ["source"], // ia | fallback_node
  registers: [register],
});

// ── Gauge : profondeur des files BullMQ ──────────────────────────────────────
const bullmqQueueJobs = new client.Gauge({
  name: "blancbleu_bullmq_queue_jobs",
  help: "Nombre de jobs BullMQ par file et par état",
  labelNames: ["queue", "state"],
  registers: [register],
});

// ── Collecteur BullMQ ────────────────────────────────────────────────────────
// Poll getJobCounts() sur chaque file réelle (les stubs no-op sont ignorés) et
// met à jour la gauge. require lazy de ../queues pour ne pas forcer l'ouverture
// Redis au chargement. Jamais throw : une file injoignable garde sa dernière
// valeur.
const QUEUE_STATES = ["waiting", "active", "delayed", "failed", "completed"];

async function collectQueueMetrics() {
  try {
     
    const { queues } = require("../queues");
    if (!queues) return;
    for (const [name, queue] of Object.entries(queues)) {
      if (!queue || queue._stub || typeof queue.getJobCounts !== "function") continue;
      const counts = await queue.getJobCounts(...QUEUE_STATES);
      for (const state of QUEUE_STATES) {
        bullmqQueueJobs.set({ queue: name, state }, counts[state] || 0);
      }
    }
  } catch {
    /* file injoignable — on garde les dernières valeurs, pas de crash */
  }
}

let _collectorTimer = null;
function startQueueMetricsCollector(intervalMs = 15_000) {
  if (_collectorTimer || process.env.NODE_ENV === "test") return;
  _collectorTimer = setInterval(collectQueueMetrics, intervalMs);
  _collectorTimer.unref(); // ne retient pas le process
  collectQueueMetrics(); // première collecte immédiate
}

// Démarre au chargement (no-op en test ou si BullMQ stub/off).
startQueueMetricsCollector();

module.exports = {
  register,
  httpDuration,
  dispatchCounter,
  bullmqQueueJobs,
  collectQueueMetrics,
  startQueueMetricsCollector,
};
