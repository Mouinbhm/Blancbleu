/**
 * BlancBleu — Planning Load Service
 * Calcule la charge de planning d'un chauffeur ou véhicule
 * pour une journée donnée.
 *
 * Critères :
 *   - Nombre de missions prévues dans la journée
 *   - Chevauchement horaire potentiel
 *   - Temps de pause estimé
 *
 * Score retourné (0-100) :
 *   100  → aucune mission (complètement disponible)
 *   80   → 1-3 missions
 *   50   → 4-6 missions (charge modérée)
 *   20   → > 6 missions (surchargé)
 */

const logger = require("../utils/logger");

const STATUTS_PLANIFIES = [
  "CONFIRMED", "SCHEDULED", "ASSIGNED", "RESCHEDULED", "REQUESTED",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _debutJour(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _finJour(date) {
  const d = _debutJour(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function _getTransportsDuJour(filtre, date) {
  const Transport = require("../models/Transport");
  const debut = _debutJour(date);
  const fin   = _finJour(date);
  return Transport.find({
    ...filtre,
    statut: { $in: STATUTS_PLANIFIES },
    dateTransport: { $gte: debut, $lte: fin },
    deletedAt: null,
  }).select("heureDepart heureRDV dureeEstimee").lean();
}

function _scoreNbMissions(n) {
  if (n === 0)  return 100;
  if (n <= 3)   return 80;
  if (n <= 6)   return 50;
  return 20;
}

function _heureEnMinutes(heureStr) {
  if (!heureStr) return null;
  const [h, m] = heureStr.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Détecte les chevauchements horaires dans une liste de missions.
 * Retourne true si au moins un chevauchement détecté.
 */
function _detecteChevauchement(transports) {
  const plages = transports
    .map((t) => {
      const debut = _heureEnMinutes(t.heureDepart || t.heureRDV);
      if (debut === null) return null;
      const duree = t.dureeEstimee || 45; // 45 min par défaut
      return { debut, fin: debut + duree };
    })
    .filter(Boolean)
    .sort((a, b) => a.debut - b.debut);

  for (let i = 0; i < plages.length - 1; i++) {
    if (plages[i].fin > plages[i + 1].debut) return true;
  }
  return false;
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Calcule la charge de planning d'un chauffeur pour une date.
 * @returns {{ score: number, nbMissions: number, chevauchement: boolean }}
 */
async function getDriverPlanningLoad(driverId, date = new Date()) {
  try {
    const transports = await _getTransportsDuJour({ chauffeur: driverId }, date);
    const nb = transports.length;
    const score = _scoreNbMissions(nb);
    const chevauchement = _detecteChevauchement(transports);
    return {
      score: chevauchement ? Math.max(score - 20, 10) : score,
      nbMissions: nb,
      chevauchement,
    };
  } catch (err) {
    logger.warn("[planningLoadService] Erreur charge chauffeur", { err: err.message });
    return { score: 60, nbMissions: 0, chevauchement: false };
  }
}

/**
 * Calcule la charge de planning d'un véhicule pour une date.
 * @returns {{ score: number, nbMissions: number, chevauchement: boolean }}
 */
async function getVehiclePlanningLoad(vehicleId, date = new Date()) {
  try {
    const transports = await _getTransportsDuJour({ vehicule: vehicleId }, date);
    const nb = transports.length;
    const score = _scoreNbMissions(nb);
    const chevauchement = _detecteChevauchement(transports);
    return {
      score: chevauchement ? Math.max(score - 20, 10) : score,
      nbMissions: nb,
      chevauchement,
    };
  } catch (err) {
    logger.warn("[planningLoadService] Erreur charge véhicule", { err: err.message });
    return { score: 60, nbMissions: 0, chevauchement: false };
  }
}

/**
 * Score de charge agrégé véhicule + chauffeur (le plus contraignant).
 * @returns {number} score 0-100
 */
async function getPlanningLoadScore(driverId, vehicleId, date = new Date()) {
  const [driver, vehicle] = await Promise.all([
    driverId  ? getDriverPlanningLoad(driverId, date)  : Promise.resolve({ score: 100 }),
    vehicleId ? getVehiclePlanningLoad(vehicleId, date) : Promise.resolve({ score: 100 }),
  ]);
  return Math.min(driver.score, vehicle.score);
}

module.exports = {
  getDriverPlanningLoad,
  getVehiclePlanningLoad,
  getPlanningLoadScore,
};
