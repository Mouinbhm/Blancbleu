/**
 * BlancBleu — Service de Dispatch IA v1.0
 *
 * Orchestrateur entre la logique de dispatch et le microservice IA Python.
 * Expose une interface unique pour le missionController avec :
 *   - appel au microservice IA (aiClient)
 *   - fallback local si IA indisponible
 *   - validation métier de la recommandation
 */

const Vehicle = require("../models/Vehicle");
const Personnel = require("../models/Personnel");
const aiClient = require("./aiClient");
const logger = require("../utils/logger");

const SEUIL_CONFIANCE_AUTO = 0.70; // Au-dessus → assignation automatique possible

// ── Vérification compatibilité patient → véhicule ────────────────────────────
function isVehicleCompatible(patient, vehicle) {
  if (!patient || !vehicle) return { ok: false, raison: "Données manquantes" };
  const mobilite = patient.mobilite || "ASSIS";
  const capacites = vehicle.capacites || {};

  if (mobilite === "FAUTEUIL_ROULANT" && !capacites.equipeFauteuil) {
    return { ok: false, raison: "Véhicule non équipé pour fauteuil roulant (TPMR requis)" };
  }
  if (["ALLONGE", "CIVIERE"].includes(mobilite) && !capacites.equipeBrancard) {
    return { ok: false, raison: "Véhicule non équipé pour patient allongé (AMBULANCE requise)" };
  }
  if (patient.oxygene && !capacites.equipeOxygene) {
    return { ok: false, raison: "Véhicule sans équipement oxygène" };
  }
  return { ok: true, raison: null };
}

// ── Scoring local (fallback si IA Python indisponible) ───────────────────────
function scorerVehiculeLocal(transport, vehicle) {
  let score = 0.5; // base
  const patient = transport.patient || {};
  const compat = isVehicleCompatible(patient, vehicle);
  if (!compat.ok) return { score: 0, raison: compat.raison };

  // Bonus ponctualité
  if (vehicle.tauxPonctualite) score += vehicle.tauxPonctualite / 1000;
  // Malus kilométrage élevé
  if (vehicle.kilometrage > 100000) score -= 0.05;
  // Bonus véhicule neuf
  const age = new Date().getFullYear() - (vehicle.annee || 2020);
  if (age <= 2) score += 0.05;

  return { score: Math.min(score, 0.95), raison: "Scoring local (IA indisponible)" };
}

function scorerChauffeurLocal(chauffeur) {
  let score = 0.5;
  if (chauffeur.tauxPonctualite) score += chauffeur.tauxPonctualite / 1000;
  return { score: Math.min(score, 0.95) };
}

// ── Fallback dispatch local ───────────────────────────────────────────────────
function dispatchLocal(transport, vehicules, chauffeurs) {
  const patient = transport.patient || {};

  // Filtrer véhicules compatibles
  const compatibles = vehicules.filter((v) => isVehicleCompatible(patient, v).ok);
  if (compatibles.length === 0) {
    return { ok: false, message: "Aucun véhicule compatible disponible" };
  }

  // Trier par score
  const classes = compatibles
    .map((v) => ({ vehicule: v, ...scorerVehiculeLocal(transport, v) }))
    .sort((a, b) => b.score - a.score);

  const bestVehicle = classes[0].vehicule;
  const vehicleScore = classes[0].score;

  // Meilleur chauffeur disponible
  const classesChauffeurs = chauffeurs
    .map((c) => ({ chauffeur: c, ...scorerChauffeurLocal(c) }))
    .sort((a, b) => b.score - a.score);

  const bestDriver = classesChauffeurs[0]?.chauffeur || null;

  const confidence = bestDriver
    ? (vehicleScore + classesChauffeurs[0].score) / 2
    : vehicleScore;

  return {
    ok: true,
    vehicleId: bestVehicle._id,
    vehicleNom: bestVehicle.nom,
    driverId: bestDriver?._id || null,
    driverNom: bestDriver ? `${bestDriver.nom} ${bestDriver.prenom}` : null,
    confidence: parseFloat(confidence.toFixed(3)),
    justification: "Scoring local — compatibilité + ponctualité + kilométrage",
    source: "local",
    alternatives: classes.slice(1, 3).map((c) => ({
      vehicleId: c.vehicule._id,
      score: parseFloat(c.score.toFixed(3)),
    })),
  };
}

// ── Fonction principale : getBestAssignment ───────────────────────────────────
/**
 * Obtient la meilleure assignation véhicule + chauffeur pour un transport.
 *
 * Processus :
 *   1. Charge les véhicules disponibles et compatibles
 *   2. Charge le personnel disponible
 *   3. Appelle le microservice IA Python
 *   4. Fallback local si IA indisponible
 *
 * @param {Object} transport - Document Transport (avec patient embedded)
 * @returns {Promise<{
 *   ok: boolean,
 *   vehicleId: ObjectId,
 *   driverId: ObjectId,
 *   confidence: number,          // 0-1
 *   justification: string,
 *   source: 'ia'|'local',
 *   autoApplicable: boolean,     // true si confidence > seuil
 *   alternatives: Array
 * }>}
 */
async function getBestAssignment(transport) {
  // ── 1. Charger les véhicules disponibles ──────────────────────────────────
  const vehicules = await Vehicle.find({
    statut: "disponible",
    deletedAt: null,
  }).lean();

  if (vehicules.length === 0) {
    return { ok: false, message: "Aucun véhicule disponible en ce moment" };
  }

  // ── 2. Charger le personnel disponible ────────────────────────────────────
  const chauffeurs = await Personnel.find({
    statut: "en-service",
    role: { $in: ["Ambulancier", "Chauffeur"] },
    deletedAt: null,
  }).lean();

  // ── 3. Appel microservice IA ──────────────────────────────────────────────
  try {
    const iaResult = await aiClient.recommanderDispatch(transport, vehicules, chauffeurs);

    // Mapper la réponse FastAPI → format interne
    const rec = iaResult.recommandation || iaResult;
    const vehiculeId = rec.vehiculeId || rec.vehicle_id;
    const chauffeurId = rec.chauffeurId || rec.driver_id;
    const confidence = rec.score ?? rec.confidence ?? 0;

    if (!vehiculeId) {
      logger.warn("[aiDispatchService] IA n'a pas retourné de véhicule, fallback local");
      return { ...dispatchLocal(transport, vehicules, chauffeurs), source: "local_after_ia" };
    }

    return {
      ok: true,
      vehicleId: vehiculeId,
      driverId: chauffeurId || null,
      confidence: parseFloat(confidence.toFixed(3)),
      justification: rec.justification || "Recommandation IA",
      source: "ia",
      autoApplicable: confidence >= SEUIL_CONFIANCE_AUTO,
      alternatives: (iaResult.alternatives || []).map((a) => ({
        vehicleId: a.vehiculeId || a.vehicle_id,
        score: a.score,
      })),
    };

  } catch (err) {
    logger.warn("[aiDispatchService] IA indisponible, fallback local", {
      err: err.message,
    });
    return {
      ...dispatchLocal(transport, vehicules, chauffeurs),
      source: "local",
      autoApplicable: false, // Ne pas auto-appliquer un résultat local
      iaError: err.message,
    };
  }
}

module.exports = {
  getBestAssignment,
  isVehicleCompatible,
  SEUIL_CONFIANCE_AUTO,
};
