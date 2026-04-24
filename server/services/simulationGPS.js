/**
 * BlancBleu — Simulation GPS Transport Non Urgent v2.0
 *
 * Machine d'état explicite avec 5 phases :
 *   VERS_PATIENT    → dépôt → prise en charge
 *   ATTENTE_PATIENT → prise en charge patient (20s)
 *   VERS_HOPITAL    → prise en charge → destination
 *   ATTENTE_HOPITAL → dépôt patient (3 min)
 *   TERMINE         → simulation arrêtée
 *
 * Chaque transition lifecycle est dans son propre try/catch.
 * clearInterval() uniquement quand phase === TERMINE.
 */

const axios = require("axios");
const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const socketService = require("./socketService");

const logger = (() => {
  try { return require("../utils/logger"); } catch { return console; }
})();

// ── Configuration ─────────────────────────────────────────────────────────────
const OSRM_BASE  = process.env.OSRM_URL || "https://router.project-osrm.org";
const VITESSE_KMH           = 50;   // vitesse réelle conservée
const FACTEUR_ACCELERATION  = 10;   // x10 pour démo
const INTERVAL_MS           = 200;  // 5 mises à jour/seconde (fluide)
const SYSTEME     = { email: "simulation@blancbleu.system" };

// ── Machine d'état ────────────────────────────────────────────────────────────
const PHASES = {
  VERS_PATIENT:    "VERS_PATIENT",
  ATTENTE_PATIENT: "ATTENTE_PATIENT",
  VERS_HOPITAL:    "VERS_HOPITAL",
  ATTENTE_HOPITAL: "ATTENTE_HOPITAL",
  TERMINE:         "TERMINE",
};

const simulationsActives = new Map();

// ── Geo helpers ───────────────────────────────────────────────────────────────
function distanceEntrePoints(p1, p2) {
  const R  = 6371000;
  const d1 = ((p2.lat - p1.lat) * Math.PI) / 180;
  const d2 = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a  =
    Math.sin(d1 / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
    Math.cos((p2.lat * Math.PI) / 180) *
    Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _routeLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distanceEntrePoints(points[i], points[i + 1]);
  }
  return total;
}

// ── Route fetching — retourne { points, distanceM, dureeS } ──────────────────
function _routeLineaire(depart, arrivee, nbPoints = 100) {
  const pts = [];
  for (let i = 0; i <= nbPoints; i++) {
    const t = i / nbPoints;
    pts.push({
      lat: depart.lat + (arrivee.lat - depart.lat) * t,
      lng: depart.lng + (arrivee.lng - depart.lng) * t,
    });
  }
  const distanceM = _routeLength(pts);
  return { points: pts, distanceM, dureeS: distanceM / (VITESSE_KMH * 1000 / 3600) };
}

async function getRouteWithMeta(depart, arrivee) {
  try {
    const url =
      `${OSRM_BASE}/route/v1/driving/` +
      `${depart.lng},${depart.lat};${arrivee.lng},${arrivee.lat}` +
      `?overview=full&geometries=geojson`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates?.length > 1) {
      const r = data.routes[0];
      return {
        points:    r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        distanceM: r.distance,
        dureeS:    r.duration,
      };
    }
  } catch (err) {
    logger.warn("[simulationGPS] OSRM indisponible, fallback linéaire", { err: err.message });
  }
  return _routeLineaire(depart, arrivee);
}

// ── Avancement par distance (sans interpolation — snap aux waypoints) ─────────
function _avancerIndex(route, pointIndex, metresParStep) {
  let distanceParcourue = 0;
  let newIndex = pointIndex;

  while (
    newIndex < route.points.length - 1 &&
    distanceParcourue < metresParStep
  ) {
    const d = distanceEntrePoints(route.points[newIndex], route.points[newIndex + 1]);
    distanceParcourue += d;
    newIndex++;
  }

  return newIndex;
}

// ── Lifecycle transitions avec try/catch individuel ───────────────────────────
async function _transition(fnName, ...args) {
  try {
    const lifecycle = require("./transportLifecycle"); // lazy — évite circulaire
    return await lifecycle[fnName](...args);
  } catch (err) {
    logger.warn(`[simulationGPS] ${fnName} échoué : ${err.message}`);
    return null;
  }
}

// ── Simulation principale ─────────────────────────────────────────────────────
async function demarrerSimulation(transportId) {
  const key = String(transportId);
  if (simulationsActives.has(key)) {
    logger.warn("[simulationGPS] Simulation déjà active", { transportId: key });
    return;
  }

  const transport = await Transport.findById(transportId)
    .populate("vehicule", "position nom immatriculation");
  if (!transport) {
    logger.warn("[simulationGPS] Transport introuvable", { transportId: key });
    return;
  }

  const vehiculeId = String(transport.vehicule?._id || "");
  if (!vehiculeId) {
    logger.warn("[simulationGPS] Aucun véhicule assigné", { transportId: key });
    return;
  }

  const pickupCoords = transport.adresseDepart?.coordonnees;
  const destCoords   = transport.adresseDestination?.coordonnees;
  if (!pickupCoords?.lat || !destCoords?.lat) {
    logger.warn("[simulationGPS] Coordonnées manquantes, simulation annulée", { transportId: key });
    return;
  }

  const depot = transport.vehicule?.position?.lat
    ? { lat: transport.vehicule.position.lat, lng: transport.vehicule.position.lng }
    : { lat: pickupCoords.lat + 0.02, lng: pickupCoords.lng + 0.015 };

  // Récupérer les deux routes en parallèle
  const [route1, route2] = await Promise.all([
    getRouteWithMeta(depot, pickupCoords),
    getRouteWithMeta(pickupCoords, destCoords),
  ]);

  // ── Logs démarrage ────────────────────────────────────────────────────────
  logger.info(`🚑 SIMULATION DÉMARRÉE`);
  logger.info(`   Transport : ${transport.numero}`);
  logger.info(`   Véhicule  : ${transport.vehicule?.nom || vehiculeId}`);
  logger.info(`   Route 1   : ${Math.round(route1.distanceM)}m (${route1.points.length} pts)`);
  logger.info(`   Route 2   : ${Math.round(route2.distanceM)}m (${route2.points.length} pts)`);
  logger.info(`   Durée est.: ${Math.round((route1.dureeS + route2.dureeS) / 60)} min`);

  const etat = {
    transportId:    key,
    vehiculeId,
    phase:          PHASES.VERS_PATIENT,
    route:          route1,
    route2,
    pointIndex:     0,
    enAttente:      false,
    interval:       null,
    lastLoggedProg: -1,
  };

  simulationsActives.set(key, etat);

  // T+5s : EN_ROUTE_TO_PICKUP
  setTimeout(async () => {
    if (!simulationsActives.has(key)) return;
    logger.info(`[simulationGPS] → EN_ROUTE_TO_PICKUP — ${transport.numero}`);
    const ok = await _transition("marquerEnRoute", key, SYSTEME);
    if (ok) logger.info("✅ EN_ROUTE_TO_PICKUP confirmé");
  }, 5000);

  const metresParStep = (VITESSE_KMH * 1000 / 3600) * (INTERVAL_MS / 1000) * FACTEUR_ACCELERATION;

  // ── Boucle principale ─────────────────────────────────────────────────────
  etat.interval = setInterval(async () => {
    const sim = simulationsActives.get(key);
    if (!sim || sim.enAttente || sim.phase === PHASES.TERMINE) return;

    const route = sim.phase === PHASES.VERS_PATIENT ? sim.route : sim.route2;

    // Calculer avancement
    const newIndex = _avancerIndex(route, sim.pointIndex, metresParStep);
    sim.pointIndex = newIndex;
    const position = route.points[newIndex];

    // Progression dans le segment courant (0-100%)
    const prog = route.points.length > 1
      ? Math.round((newIndex / (route.points.length - 1)) * 100)
      : 100;

    // Log aux jalons 25%, 50%, 75%, 100%
    if (prog > 0 && prog % 25 === 0 && prog !== sim.lastLoggedProg) {
      sim.lastLoggedProg = prog;
      logger.info(
        `📡 ${sim.phase} — ${prog}%` +
        ` (${position.lat.toFixed(4)}, ${position.lng.toFixed(4)})`,
      );
    }

    // Mise à jour position véhicule en DB (best-effort, non bloquant)
    Vehicle.findByIdAndUpdate(vehiculeId, {
      "position.lat":       position.lat,
      "position.lng":       position.lng,
      "position.updatedAt": new Date(),
    }).catch(() => {});

    // Émission GPS Socket.IO
    socketService.emitVehiculePosition?.({
      vehiculeId,
      transportId: key,
      lat:         position.lat,
      lng:         position.lng,
      vitesse:     VITESSE_KMH,
      phase:       sim.phase,
      progression: prog,
    });

    const finSegment = newIndex >= route.points.length - 1;
    if (!finSegment) return;

    // ══════════════════════════════════════════════════════════════════════
    // FIN SEGMENT 1 : Dépôt → Patient
    // ══════════════════════════════════════════════════════════════════════
    if (sim.phase === PHASES.VERS_PATIENT) {
      sim.enAttente = true;
      sim.phase     = PHASES.ATTENTE_PATIENT;

      logger.info(`📍 Arrivé chez le patient — ${transport.numero}`);

      try {
        const lifecycle = require("./transportLifecycle");
        await lifecycle.marquerArriveePatient(key, position, SYSTEME);
        logger.info("✅ Transition → ARRIVED_AT_PICKUP");
      } catch (err) {
        logger.warn(`[simulationGPS] ARRIVED_AT_PICKUP échoué : ${err.message}`);
      }

      logger.info("⏳ Prise en charge patient (20 s)…");

      setTimeout(async () => {
        if (!simulationsActives.has(key)) return;

        try {
          const lifecycle = require("./transportLifecycle");
          await lifecycle.marquerPatientABord(key, SYSTEME);
          logger.info("✅ Transition → PATIENT_ON_BOARD");
        } catch (err) {
          logger.warn(`[simulationGPS] PATIENT_ON_BOARD échoué : ${err.message}`);
        }

        const currentSim = simulationsActives.get(key);
        if (!currentSim) return;

        logger.info(`🏥 Départ vers la destination — ${transport.numero}`);
        currentSim.phase          = PHASES.VERS_HOPITAL;
        currentSim.pointIndex     = 0;
        currentSim.lastLoggedProg = -1;
        currentSim.enAttente      = false; // reprendre l'avancement
      }, 20 * 1000 / FACTEUR_ACCELERATION);
    }

    // ══════════════════════════════════════════════════════════════════════
    // FIN SEGMENT 2 : Patient → Destination
    // ══════════════════════════════════════════════════════════════════════
    else if (sim.phase === PHASES.VERS_HOPITAL) {
      sim.enAttente = true;
      sim.phase     = PHASES.ATTENTE_HOPITAL;

      logger.info(`🏥 Arrivé à destination — ${transport.numero}`);

      try {
        const lifecycle = require("./transportLifecycle");
        await lifecycle.marquerArriveeDestination(key, position, SYSTEME);
        logger.info("✅ Transition → ARRIVED_AT_DESTINATION");
      } catch (err) {
        logger.warn(`[simulationGPS] ARRIVED_AT_DESTINATION échoué : ${err.message}`);
      }

      logger.info("⏳ Dépôt du patient (3 min)…");

      setTimeout(async () => {
        if (!simulationsActives.has(key)) return;

        try {
          const lifecycle = require("./transportLifecycle");
          await lifecycle.completerTransport(key, SYSTEME);
          logger.info(`✅ Transport COMPLÉTÉ — ${transport.numero}`);
        } catch (err) {
          logger.warn(`[simulationGPS] COMPLETED échoué : ${err.message}`);
        }

        const currentSim = simulationsActives.get(key);
        if (!currentSim) return;

        // clearInterval seulement ici — phase TERMINE garantie
        currentSim.phase = PHASES.TERMINE;
        clearInterval(currentSim.interval);
        simulationsActives.delete(key);
        logger.info(`🏁 Simulation terminée — ${transport.numero}`);
      }, 3 * 60 * 1000 / FACTEUR_ACCELERATION);
    }
  }, INTERVAL_MS);

  logger.info(`[simulationGPS] Boucle démarrée`, { transportId: key });
}

function arreterSimulation(transportId) {
  const key = String(transportId);
  const sim = simulationsActives.get(key);
  if (!sim) return;

  if (sim.interval) clearInterval(sim.interval);
  simulationsActives.delete(key);
  logger.info("[simulationGPS] Simulation arrêtée manuellement", { transportId: key });
}

module.exports = { demarrerSimulation, arreterSimulation };
