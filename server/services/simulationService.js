/**
 * BlancBleu — Simulation GPS Véhicules Transport Sanitaire
 * Adapté transport non urgent — utilise Vehicle au lieu de Unit
 */
const Vehicle = require("../models/Vehicle");
const socketService = require("./socketService");

const INTERVAL_MS = 8000;
let _interval = null;
let _actif = false;

const ZONE = { latMin: 43.66, latMax: 43.76, lngMin: 7.18, lngMax: 7.32 };

function deplacer(lat, lng, vitesse = 30) {
  const rayon = ((vitesse / 3600) * (INTERVAL_MS / 1000)) / 111;
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: Math.max(
      ZONE.latMin,
      Math.min(ZONE.latMax, lat + Math.cos(angle) * rayon),
    ),
    lng: Math.max(
      ZONE.lngMin,
      Math.min(ZONE.lngMax, lng + Math.sin(angle) * rayon),
    ),
  };
}

async function simulerDeplacement() {
  try {
    const vehicles = await Vehicle.find({ deletedAt: null });

    for (const vehicle of vehicles) {
      if (vehicle.statut === "Maintenance" || vehicle.statut === "Hors service")
        continue;

      let modifie = false;

      if (vehicle.statut === "En service" && vehicle.position?.lat) {
        const vitesse = vehicle.type === "AMBULANCE" ? 50 : 40;
        const nouvellePos = deplacer(
          vehicle.position.lat,
          vehicle.position.lng,
          vitesse,
        );
        const distTick = (vitesse / 3600) * (INTERVAL_MS / 1000);
        const consoL100 = 12;
        const reservoir = 80;
        const pctConso = ((distTick * consoL100) / 100 / reservoir) * 100;

        vehicle.position = {
          lat: Math.round(nouvellePos.lat * 100000) / 100000,
          lng: Math.round(nouvellePos.lng * 100000) / 100000,
          adresse: vehicle.position.adresse || "En route",
          updatedAt: new Date(),
        };
        vehicle.kilometrage =
          Math.round((vehicle.kilometrage + distTick) * 10) / 10;
        vehicle.carburant = Math.max(
          0,
          Math.round((vehicle.carburant - pctConso) * 100) / 100,
        );
        modifie = true;
      } else if (vehicle.statut === "Disponible") {
        modifie = true;
      }

      if (modifie) {
        await vehicle.save();
        socketService.emitLocationUpdated?.({
          unitId: vehicle._id,
          nom: vehicle.nom,
          type: vehicle.type,
          statut: vehicle.statut,
          position: vehicle.position,
          carburant: vehicle.carburant,
          kilometrage: vehicle.kilometrage,
          transportEnCours: vehicle.transportEnCours,
        });
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[Simulation] Erreur:", err.message);
    }
  }
}

// ── SIMULATION DÉSACTIVÉE — mettre true pour réactiver (démos PFE) ───────────
const SIMULATION_ACTIVE = false;

function demarrer() {
  if (!SIMULATION_ACTIVE) {
    console.log("🔒 Simulation véhicules désactivée (SIMULATION_ACTIVE = false)");
    return;
  }
  if (_actif) return;
  _actif = true;
  _interval = setInterval(simulerDeplacement, INTERVAL_MS);
  console.log("🚐 Simulation GPS véhicules démarrée");
}

function arreter() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  _actif = false;
}

module.exports = { demarrer, arreter };
