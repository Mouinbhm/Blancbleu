/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — Géodécision                                    ║
 * ║  Distance · ETA · Tri par proximité · Zone Nice             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════════════════════
// 1. DISTANCE HAVERSINE (km)
// Formule trigonométrique précise pour courtes distances (<500 km)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Calcule la distance orthodromique entre 2 points GPS
 * @param {number} lat1, lng1 - Point A (unité)
 * @param {number} lat2, lng2 - Point B (incident)
 * @returns {number} Distance en kilomètres (arrondie à 2 décimales)
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Rayon Terre (km)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 100) / 100; // Arrondi 2 décimales
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CALCUL ETA (Estimated Time of Arrival)
// Basé sur la priorité, la distance et les contraintes urbaines de Nice
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Paramètres de vitesse selon priorité (profil urbain Nice)
 * Source : données terrain SAMU 06 Nice
 */
const PROFILS_VITESSE = {
  P1: {
    vitesse: 75, // km/h — sirènes + feux rouges ignorés
    facteurUrbain: 1.25, // embouteillages côte d'Azur
    tempsDepart: 1, // minute(s) pour mobilisation équipage
    description: "Urgence absolue — gyrophares + sirènes",
  },
  P2: {
    vitesse: 55,
    facteurUrbain: 1.35,
    tempsDepart: 2,
    description: "Urgence — priorité de passage",
  },
  P3: {
    vitesse: 35,
    facteurUrbain: 1.45,
    tempsDepart: 3,
    description: "Transport standard — circulation normale",
  },
};

/**
 * Calcule l'ETA en minutes
 * @param {number} distanceKm
 * @param {string} priorite - 'P1' | 'P2' | 'P3'
 * @param {string} heureJour - 'pointe' | 'normal' | 'nuit' (optionnel)
 * @returns {Object} { minutes, fourchette, description }
 */
function calculerETA(distanceKm, priorite = "P2", heureJour = null) {
  const profil = PROFILS_VITESSE[priorite] || PROFILS_VITESSE.P2;

  // Facteur heure de pointe Nice (8h-9h30 / 17h-19h)
  let facteurHeure = 1.0;
  if (heureJour === "pointe") {
    facteurHeure = 1.3;
  } else {
    const heure = new Date().getHours();
    if ((heure >= 8 && heure < 10) || (heure >= 17 && heure < 19)) {
      facteurHeure = 1.2; // Heure de pointe auto-détectée
    } else if (heure >= 22 || heure < 6) {
      facteurHeure = 0.85; // Nuit — circulation fluide
    }
  }

  const facteurTotal = profil.facteurUrbain * facteurHeure;
  const tempsTrajet = (distanceKm / profil.vitesse) * 60 * facteurTotal;
  const etaMinutes = Math.ceil(tempsTrajet + profil.tempsDepart);

  // Fourchette ±20%
  const etaMin = Math.max(1, Math.floor(etaMinutes * 0.8));
  const etaMax = Math.ceil(etaMinutes * 1.2);

  return {
    minutes: etaMinutes,
    fourchette: `${etaMin}-${etaMax} min`,
    formate: formatETA(etaMinutes),
    description: profil.description,
    distanceKm,
  };
}

/**
 * Formate les minutes en string lisible
 */
function formatETA(minutes) {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. TRI DES UNITÉS PAR PROXIMITÉ + SCORE COMPOSITE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Trie les unités par distance et calcule leur ETA
 * @param {Array}  units       - Liste des unités MongoDB
 * @param {number} incidentLat
 * @param {number} incidentLng
 * @param {string} priorite
 * @returns {Array} Unités triées avec distance + ETA + score
 */
function trierParProximite(units, incidentLat, incidentLng, priorite = "P2") {
  const unitsAvecGeo = units
    .filter((u) => u.position?.lat && u.position?.lng)
    .map((u) => {
      const dist = haversine(
        u.position.lat,
        u.position.lng,
        incidentLat,
        incidentLng,
      );
      const eta = calculerETA(dist, priorite);

      // Score proximité : 100 pts si 0 km, 0 pts si > 15 km
      const scoreProximite = Math.max(0, Math.round((1 - dist / 15) * 100));

      return {
        ...(u.toObject ? u.toObject() : u),
        _id: u._id,
        geo: {
          distanceKm: dist,
          etaMinutes: eta.minutes,
          etaFormate: eta.formate,
          etaFourchette: eta.fourchette,
          scoreProximite,
        },
      };
    })
    .sort((a, b) => a.geo.distanceKm - b.geo.distanceKm);

  return unitsAvecGeo;
}

/**
 * Vérifie si une coordonnée est dans la zone de couverture Nice
 * Zone : 43.6°N - 43.8°N · 7.15°E - 7.35°E
 */
function estDansZoneNice(lat, lng) {
  return lat >= 43.6 && lat <= 43.8 && lng >= 7.15 && lng <= 7.35;
}

/**
 * Calcule le centre géographique d'un ensemble de points GPS
 * Utile pour NOVI (multiple victimes)
 */
function centreGeographique(points) {
  if (!points || points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
  };
}

module.exports = {
  haversine,
  calculerETA,
  formatETA,
  trierParProximite,
  estDansZoneNice,
  centreGeographique,
  PROFILS_VITESSE,
};
