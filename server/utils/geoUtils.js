/**
 * BlancBleu — Utilitaires géographiques
 * Formules précises pour zone urbaine Nice
 */

/** Distance Haversine (km) entre 2 points GPS */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * ETA réaliste Nice (minutes)
 * P1 = sirènes 75 km/h + 1 min départ
 * P2 = prioritaire 55 km/h + 2 min
 * P3 = normal 35 km/h + 3 min
 */
function calculerETA(distanceKm, priorite = "P2") {
  const cfg = {
    P1: { vitesse: 75, depart: 1 },
    P2: { vitesse: 55, depart: 2 },
    P3: { vitesse: 35, depart: 3 },
  };
  const { vitesse, depart } = cfg[priorite] || cfg.P2;
  // Facteur urbain Nice : x1.3 (embouteillages côte)
  const facteurUrbain = 1.3;
  return Math.ceil((distanceKm / vitesse) * 60 * facteurUrbain + depart);
}

function formatETA(minutes) {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ""}`;
}

module.exports = { haversine, calculerETA, formatETA };
