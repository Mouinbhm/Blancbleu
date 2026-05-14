/**
 * BlancBleu — Driver Performance Service
 * Calcule les métriques de performance des chauffeurs
 * à partir des données réelles de transport.
 *
 * Critères de ponctualité :
 *   retard ≤ 5 min   → ponctuel
 *   retard 5-15 min  → léger retard
 *   retard > 15 min  → retard important
 *
 * Score (0-100) :
 *   Très ponctuel    → 100
 *   Quelques retards → 70
 *   Retards fréquents→ 40
 *   Aucune donnée    → 50
 */

const logger = require("../utils/logger");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _getTransports(driverId, periodDays = 90) {
  const Transport = require("../models/Transport");
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  return Transport.find({
    chauffeur: driverId,
    statut: { $in: ["COMPLETED", "BILLED", "PAID"] },
    dateTransport: { $gte: since },
    deletedAt: null,
  }).select("heureDepart heurePriseEnCharge heureRDV statusHistory").lean();
}

function _calcRetardMinutes(transport) {
  // Heure réelle prise en charge
  const reelleTs = transport.heurePriseEnCharge
    || transport.actualPickupTime
    || transport.statusHistory?.find((s) => s.status === "PICKUP_REACHED")?.timestamp;
  if (!reelleTs) return null;

  // Heure prévue
  const prevue = transport.heureRDV || transport.heureDepart;
  if (!prevue) return null;

  const dateRef = transport.dateTransport
    ? new Date(transport.dateTransport)
    : new Date(reelleTs);

  const [hh, mm] = prevue.split(":").map(Number);
  const prevueDate = new Date(dateRef);
  prevueDate.setHours(hh, mm, 0, 0);

  const retardMs = new Date(reelleTs) - prevueDate;
  return Math.round(retardMs / 60000); // en minutes
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Calcule le score de ponctualité d'un chauffeur (0-100).
 * @param {string|ObjectId} driverId
 * @param {number} periodDays — période d'analyse en jours (défaut 90j)
 */
async function getDriverPunctualityScore(driverId, periodDays = 90) {
  try {
    const transports = await _getTransports(driverId, periodDays);
    if (transports.length === 0) return 50; // neutre — pas d'historique

    const retards = transports
      .map(_calcRetardMinutes)
      .filter((r) => r !== null);

    if (retards.length === 0) return 50;

    const ponctuels  = retards.filter((r) => r <= 5).length;
    const legers     = retards.filter((r) => r > 5 && r <= 15).length;
    const importants = retards.filter((r) => r > 15).length;
    const total      = retards.length;

    // Score pondéré : ponctuel→3pts, léger→1pt, important→0pt
    const points = (ponctuels * 3 + legers * 1) / (total * 3);
    const score  = Math.round(points * 100);

    if (score >= 90) return 100;
    if (score >= 75) return 80;
    if (score >= 55) return 60;
    if (score >= 40) return 40;
    return 20;
  } catch (err) {
    logger.warn("[driverPerformanceService] Erreur calcul ponctualité", { err: err.message });
    return 50;
  }
}

/**
 * Stats de retard détaillées pour un chauffeur.
 * @returns {{ total, ponctuels, legersRetards, importantsRetards, moyenneRetardMin, score }}
 */
async function getDriverDelayStats(driverId, periodDays = 90) {
  try {
    const transports = await _getTransports(driverId, periodDays);
    const retards = transports
      .map(_calcRetardMinutes)
      .filter((r) => r !== null);

    if (retards.length === 0) {
      return { total: 0, ponctuels: 0, legersRetards: 0, importantsRetards: 0, moyenneRetardMin: null, score: 50 };
    }

    const ponctuels       = retards.filter((r) => r <= 5).length;
    const legersRetards    = retards.filter((r) => r > 5 && r <= 15).length;
    const importantsRetards = retards.filter((r) => r > 15).length;
    const moyenneRetardMin = Math.round(retards.reduce((s, r) => s + r, 0) / retards.length);
    const score = await getDriverPunctualityScore(driverId, periodDays);

    return { total: retards.length, ponctuels, legersRetards, importantsRetards, moyenneRetardMin, score };
  } catch (err) {
    logger.warn("[driverPerformanceService] Erreur stats retard", { err: err.message });
    return { total: 0, ponctuels: 0, legersRetards: 0, importantsRetards: 0, moyenneRetardMin: null, score: 50 };
  }
}

/**
 * Met à jour le taux de ponctualité d'un personnel après un transport terminé.
 * À appeler depuis le transport controller lors du passage à COMPLETED.
 */
async function updateDriverPerformanceAfterTransport(transportId) {
  try {
    const Transport = require("../models/Transport");
    const Personnel = require("../models/Personnel");

    const transport = await Transport.findById(transportId).lean();
    if (!transport?.chauffeur) return;

    const score = await getDriverPunctualityScore(transport.chauffeur);
    await Personnel.findByIdAndUpdate(transport.chauffeur, {
      tauxPonctualite: score,
    });
  } catch (err) {
    logger.warn("[driverPerformanceService] Erreur mise à jour ponctualité", { err: err.message });
  }
}

module.exports = {
  getDriverPunctualityScore,
  getDriverDelayStats,
  updateDriverPerformanceAfterTransport,
};
