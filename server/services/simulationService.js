/**
 * BlancBleu — Service de Simulation GPS
 * Déplace les unités aléatoirement autour de Nice pour tester la carte
 */
const Unit = require("../models/Unit");
const socketService = require("./socketService");

// Zone Nice
const ZONE_NICE = { latMin: 43.66, latMax: 43.76, lngMin: 7.18, lngMax: 7.32 };
const INTERVAL_MS = 5000; // toutes les 5 secondes
let _simulationInterval = null;
let _actif = false;

function positionAleatoire(latBase, lngBase, rayon = 0.003) {
  const dlat = (Math.random() - 0.5) * rayon * 2;
  const dlng = (Math.random() - 0.5) * rayon * 2;
  const lat = Math.max(
    ZONE_NICE.latMin,
    Math.min(ZONE_NICE.latMax, latBase + dlat),
  );
  const lng = Math.max(
    ZONE_NICE.lngMin,
    Math.min(ZONE_NICE.lngMax, lngBase + dlng),
  );
  return {
    lat: Math.round(lat * 100000) / 100000,
    lng: Math.round(lng * 100000) / 100000,
    vitesse: Math.round(Math.random() * 60),
    cap: Math.round(Math.random() * 360),
  };
}

async function simulerDeplacement() {
  try {
    const units = await Unit.find({
      statut: { $in: ["disponible", "en_mission"] },
    });
    for (const unit of units) {
      if (!unit.position?.lat) continue;
      const nouvellePos = positionAleatoire(
        unit.position.lat,
        unit.position.lng,
      );
      await unit.updateLocation(nouvellePos.lat, nouvellePos.lng, {
        vitesse: unit.statut === "en_mission" ? nouvellePos.vitesse : 0,
        cap: nouvellePos.cap,
      });
      socketService.emitLocationUpdated?.({
        unitId: unit._id,
        nom: unit.nom,
        type: unit.type,
        statut: unit.statut,
        position: unit.position,
        interventionEnCours: unit.interventionEnCours,
      });
    }
  } catch (err) {
    console.error("Simulation erreur:", err.message);
  }
}

function demarrer() {
  if (_actif) return;
  _actif = true;
  console.log("🗺️  Simulation GPS démarrée (toutes les 5s)");
  _simulationInterval = setInterval(simulerDeplacement, INTERVAL_MS);
  simulerDeplacement(); // premier déplacement immédiat
}

function arreter() {
  if (_simulationInterval) clearInterval(_simulationInterval);
  _actif = false;
  console.log("🗺️  Simulation GPS arrêtée");
}

function estActif() {
  return _actif;
}

module.exports = { demarrer, arreter, estActif };
