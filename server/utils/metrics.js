/**
 * Métriques Prometheus exposées sur GET /metrics (protégé par
 * X-Metrics-Token, cf. Server.js).
 *
 * Métriques exposées :
 *   - http_request_duration_seconds (histogram)  — durée HTTP par route/statut
 *   - dispatch_recommendations_total (counter)   — recommandations IA générées
 *   - process_*, nodejs_*                         — default metrics (CPU, RAM, GC)
 */

const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name:       "http_request_duration_seconds",
  help:       "Durée des requêtes HTTP (en secondes), par méthode/route/statut",
  labelNames: ["method", "route", "status"],
  buckets:    [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers:  [register],
});

const dispatchCounter = new client.Counter({
  name:       "dispatch_recommendations_total",
  help:       "Nombre de recommandations dispatch générées, par source",
  labelNames: ["source"], // ia | fallback_node
  registers:  [register],
});

module.exports = {
  register,
  httpDuration,
  dispatchCounter,
};
