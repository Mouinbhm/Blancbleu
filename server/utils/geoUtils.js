/**
 * BlancBleu — GeoUtils v3.0
 * Haversine · OSRM Routing · ETA · Consommation · Itinéraire mission
 *
 * NOUVEAU en v3.0 :
 *   - calculerETARoutier() : ETA via OSRM (routing routier réel)
 *   - Fallback automatique vers Haversine si OSRM indisponible
 *   - Cache simple des résultats OSRM (5 min TTL)
 */

const axios = require("axios");
const logger = require("./logger");

// ─── Configuration OSRM ───────────────────────────────────────────────────────
// Instance publique OSRM — remplacer par instance privée en production
// Alternative auto-hébergée : https://github.com/Project-OSRM/osrm-backend
const OSRM_BASE = process.env.OSRM_URL || "https://router.project-osrm.org";
const OSRM_TIMEOUT = 3000; // 3s max — fallback si dépassé

// ─── Cache OSRM (mémoire, TTL 5 min) ─────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function _cacheKey(lat1, lng1, lat2, lng2) {
  return `${lat1.toFixed(4)},${lng1.toFixed(4)}-${lat2.toFixed(4)},${lng2.toFixed(4)}`;
}

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function _cacheSet(key, value) {
  _cache.set(key, { value, ts: Date.now() });
  // Limiter la taille du cache
  if (_cache.size > 500) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HAVERSINE — Distance à vol d'oiseau (fallback + calculs internes)
// ══════════════════════════════════════════════════════════════════════════════
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const d1 = ((lat2 - lat1) * Math.PI) / 180;
  const d2 = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(d1 / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(d2 / 2) ** 2;
  return (
    Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OSRM ROUTING — Distance et durée par la route
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Calcule la distance et durée via OSRM (routing routier réel)
 * Fallback automatique vers Haversine si OSRM indisponible
 *
 * @returns {{ distanceKm, dureeSecondes, source: 'osrm'|'haversine' }}
 */
async function calculerRouteOSRM(lat1, lng1, lat2, lng2) {
  const key = _cacheKey(lat1, lng1, lat2, lng2);
  const cached = _cacheGet(key);
  if (cached) return { ...cached, source: "osrm_cache" };

  try {
    const url = `${OSRM_BASE}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const { data } = await axios.get(url, { timeout: OSRM_TIMEOUT });

    if (data.code !== "Ok" || !data.routes?.[0]) {
      throw new Error("Réponse OSRM invalide");
    }

    const route = data.routes[0];
    const result = {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      dureeSecondes: Math.round(route.duration),
    };

    _cacheSet(key, result);
    return { ...result, source: "osrm" };
  } catch (err) {
    // OSRM indisponible — fallback Haversine avec facteur sinuosité
    logger.warn("OSRM indisponible — fallback Haversine", { err: err.message });
    const distKm = haversine(lat1, lng1, lat2, lng2);
    const facteurRoute = 1.35; // Les routes sont ~35% plus longues que vol d'oiseau
    return {
      distanceKm: Math.round(distKm * facteurRoute * 100) / 100,
      dureeSecondes: null,
      source: "haversine",
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ETA — Estimation temps d'arrivée (Haversine — synchrone, pour usage interne)
// ══════════════════════════════════════════════════════════════════════════════
function calculerETA(distanceKm, priorite = "P2") {
  const cfg = {
    P1: { vitesse: 75, facteur: 1.25, depart: 1 },
    P2: { vitesse: 55, facteur: 1.35, depart: 2 },
    P3: { vitesse: 35, facteur: 1.45, depart: 3 },
  };
  const { vitesse, facteur, depart } = cfg[priorite] || cfg.P2;

  // Facteur heure de pointe Nice
  const h = new Date().getHours();
  const fp =
    (h >= 8 && h < 10) || (h >= 17 && h < 19)
      ? 1.2
      : h >= 22 || h < 6
        ? 0.85
        : 1.0;

  const minutes = Math.ceil(
    (distanceKm / vitesse) * 60 * facteur * fp + depart,
  );
  return {
    minutes,
    formate:
      minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)}h${minutes % 60}min`,
    fourchette: `${Math.floor(minutes * 0.8)}-${Math.ceil(minutes * 1.2)} min`,
    distanceKm,
    source: "haversine",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ETA ROUTIER — Via OSRM (asynchrone, plus précis)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * ETA via OSRM avec ajustement priorité (sirènes P1, code P2)
 * Fallback automatique vers calculerETA si OSRM indisponible
 */
async function calculerETARoutier(lat1, lng1, lat2, lng2, priorite = "P2") {
  const route = await calculerRouteOSRM(lat1, lng1, lat2, lng2);

  let minutes;

  if (route.dureeSecondes !== null) {
    // Durée OSRM + ajustement priorité
    const facteurPriorite = { P1: 0.75, P2: 0.9, P3: 1.0 }[priorite] || 0.9;
    const depart = { P1: 1, P2: 2, P3: 3 }[priorite] || 2;
    minutes = Math.ceil((route.dureeSecondes / 60) * facteurPriorite) + depart;
  } else {
    // Fallback Haversine
    const eta = calculerETA(route.distanceKm, priorite);
    minutes = eta.minutes;
  }

  return {
    minutes,
    formate:
      minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)}h${minutes % 60}min`,
    fourchette: `${Math.floor(minutes * 0.8)}-${Math.ceil(minutes * 1.2)} min`,
    distanceKm: route.distanceKm,
    source: route.source,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════════════════════════════════════════════
function formatETA(minutes) {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function calculerConsommation(distanceKm, specs = {}) {
  const conso = specs.consommationL100 || 12;
  const reservoir = specs.capaciteReservoir || 80;
  const litres = (distanceKm * conso) / 100;
  return Math.round((litres / reservoir) * 100 * 100) / 100;
}

function distanceMissionComplete(base, incident, hopital) {
  const d1 = haversine(base.lat, base.lng, incident.lat, incident.lng);
  const d2 = hopital
    ? haversine(incident.lat, incident.lng, hopital.lat, hopital.lng)
    : 0;
  const d3 = hopital
    ? haversine(hopital.lat, hopital.lng, base.lat, base.lng)
    : haversine(incident.lat, incident.lng, base.lat, base.lng);
  return {
    baseVersIncident: d1,
    incidentVersHopital: d2,
    hopitalVersBase: d3,
    total: Math.round((d1 + d2 + d3) * 100) / 100,
  };
}

function trierParProximite(units, lat, lng, priorite = "P2") {
  return units
    .filter((u) => u.position?.lat && u.position?.lng)
    .map((u) => {
      const dist = haversine(u.position.lat, u.position.lng, lat, lng);
      const eta = calculerETA(dist, priorite);
      return {
        ...(u.toObject?.() || u),
        _id: u._id,
        geo: {
          distanceKm: dist,
          etaMinutes: eta.minutes,
          etaFormate: eta.formate,
        },
      };
    })
    .sort((a, b) => a.geo.distanceKm - b.geo.distanceKm);
}

function estDansZoneNice(lat, lng) {
  return lat >= 43.6 && lat <= 43.8 && lng >= 7.15 && lng <= 7.35;
}

module.exports = {
  haversine,
  calculerETA,
  calculerETARoutier,
  calculerRouteOSRM,
  formatETA,
  calculerConsommation,
  distanceMissionComplete,
  trierParProximite,
  estDansZoneNice,
};
