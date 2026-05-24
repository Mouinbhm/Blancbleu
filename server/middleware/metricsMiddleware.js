/**
 * Mesure la durée de chaque requête HTTP et l'enregistre dans
 * metrics.httpDuration. La label "route" utilise le pattern Express
 * (req.route.path, ex: "/transports/:id") pour éviter l'explosion de
 * cardinalité d'une variable par ID.
 */

const { httpDuration } = require("../utils/metrics");

module.exports = function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;

    // Préfère le pattern Express plutôt que le path résolu pour éviter
    // l'explosion de cardinalité (/transports/abc1, /transports/abc2, ...).
    const route = req.route?.path || _normalize(req.path);

    httpDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(durationSec);
  });

  next();
};

// Normalise les paths sans route Express en remplaçant les ObjectId-like et
// les UUID par ":id" pour limiter la cardinalité.
function _normalize(path) {
  return path
    .replace(/\/[0-9a-fA-F]{24}(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f-]{36}(?=\/|$)/g, "/:uuid");
}
