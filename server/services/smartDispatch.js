/**
 * BlancBleu — Smart Dispatch Transport Sanitaire
 *
 * Score 100pts :
 *   compatibilité mobilité/véhicule (40)
 *   + disponibilité créneau (20)
 *   + proximité GPS (20)
 *   + charge du jour (10)
 *   + fiabilité chauffeur (10)
 *
 * Remplace dispatchService.js (urgences P1/P2/P3)
 */

const Vehicle = require("../models/Vehicle");
const Transport = require("../models/Transport");
const { haversine } = require("../utils/geoUtils");

// ─── Compatibilité mobilité → type véhicule ────────────────────────────────────
const MOBILITE_VEHICULE = {
  ASSIS: ["VSL", "AMBULANCE", "TPMR"],
  FAUTEUIL_ROULANT: ["TPMR"],
  ALLONGE: ["AMBULANCE"],
  CIVIERE: ["AMBULANCE"],
};

// ─── Score compatibilité (40pts) ──────────────────────────────────────────────
function scoreCompatibilite(vehicle, mobilite) {
  const typesCompatibles = MOBILITE_VEHICULE[mobilite] || ["VSL"];
  if (!typesCompatibles.includes(vehicle.type)) {
    return {
      score: 0,
      compatible: false,
      detail: `${vehicle.type} incompatible avec mobilité ${mobilite}`,
    };
  }

  // Bonus si type optimal
  const optimal = typesCompatibles[0]; // premier = type recommandé
  const score = vehicle.type === optimal ? 40 : 30;

  // Vérifications équipements spéciaux
  return { score, compatible: true, detail: `${vehicle.type} compatible` };
}

// ─── Score disponibilité créneau (20pts) ──────────────────────────────────────
async function scoreDisponibilite(vehicle, dateTransport, heureRDV, dureeEstimeeMin = 90) {
  // "En service" sans transport en cours = véhicule sur shift actif, prêt à
  // recevoir une mission. Seule une mission déjà en cours le rend indisponible.
  const surShiftLibre =
    vehicle.statut === "En service" && vehicle.currentShiftId && !vehicle.transportEnCours;

  if (vehicle.statut !== "Disponible" && !surShiftLibre) {
    return { score: 0, detail: `Véhicule ${vehicle.statut}` };
  }

  // Vérifier conflits sur le même créneau
  const debut = new Date(dateTransport);
  const fin = new Date(dateTransport);
  fin.setMinutes(fin.getMinutes() + dureeEstimeeMin);

  const conflits = await Transport.countDocuments({
    vehicule: vehicle._id,
    dateTransport: { $gte: debut, $lte: fin },
    statut: {
      $in: [
        "SCHEDULED",
        "ASSIGNED",
        "EN_ROUTE_TO_PICKUP",
        "ARRIVED_AT_PICKUP",
        "PATIENT_ON_BOARD",
        "ARRIVED_AT_DESTINATION",
      ],
    },
  });

  return conflits === 0
    ? { score: 20, detail: "Créneau libre" }
    : { score: 0, detail: `${conflits} transport(s) en conflit` };
}

// ─── Score proximité GPS (20pts) ──────────────────────────────────────────────
function scoreProximite(vehicle, lat, lng) {
  if (!vehicle.position?.lat || !vehicle.position?.lng || !lat || !lng) {
    return { score: 10, distanceKm: null, detail: "Position inconnue" };
  }
  const dist = haversine(vehicle.position.lat, vehicle.position.lng, lat, lng);
  const score = Math.max(0, 20 * (1 - dist / 20)); // 0km=20pts, 20km=0pt
  return {
    score: Math.round(score * 10) / 10,
    distanceKm: Math.round(dist * 100) / 100,
    detail: `${Math.round(dist * 10) / 10} km du patient`,
  };
}

// ─── Score charge du jour (10pts) ─────────────────────────────────────────────
async function scoreCharge(vehicle, dateTransport) {
  try {
    const debut = new Date(dateTransport);
    debut.setHours(0, 0, 0, 0);
    const fin = new Date(dateTransport);
    fin.setHours(23, 59, 59, 999);

    const nbTransports = await Transport.countDocuments({
      vehicule: vehicle._id,
      dateTransport: { $gte: debut, $lte: fin },
      statut: { $nin: ["CANCELLED", "NO_SHOW"] },
    });

    const score = Math.max(0, 10 * (1 - nbTransports / 8));
    return {
      score: Math.round(score * 10) / 10,
      nbJour: nbTransports,
      detail: `${nbTransports} transport(s) ce jour`,
    };
  } catch {
    return { score: 5, nbJour: 0, detail: "Charge inconnue" };
  }
}

// ─── Score fiabilité chauffeur (10pts) ────────────────────────────────────────
function scoreFiabilite(vehicle) {
  const taux = vehicle.tauxPonctualite || 90;
  const score = (taux / 100) * 10;
  return {
    score: Math.round(score * 10) / 10,
    detail: `Ponctualité ${taux}%`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// DISPATCH PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
async function smartDispatch({ mobilite, dateTransport, heureRDV, coordonneesDepart }) {
  const lat = coordonneesDepart?.lat;
  const lng = coordonneesDepart?.lng;

  // Récupérer les types compatibles
  const typesCompatibles = MOBILITE_VEHICULE[mobilite] || ["VSL"];

  // Charger les véhicules candidats. Un véhicule tenu par un shift actif est
  // "En service" sans transport en cours (cf. shiftController.startShift) :
  // c'est un chauffeur prêt à partir, donc un candidat — pas un véhicule occupé.
  // Seul `transportEnCours` distingue "en mission" de "disponible sur shift".
  const vehicules = await Vehicle.find({
    $or: [
      { statut: "Disponible" },
      {
        statut: "En service",
        currentShiftId: { $ne: null },
        $or: [{ transportEnCours: null }, { transportEnCours: { $exists: false } }],
      },
    ],
    type: { $in: typesCompatibles },
    deletedAt: null,
  }).populate("chauffeurAssigne", "nom prenom email tauxPonctualite");

  if (vehicules.length === 0) {
    return {
      vehicule: null,
      chauffeur: null,
      scoreTotal: 0,
      alternatives: [],
      justification: [`Aucun véhicule disponible compatible avec mobilité ${mobilite}`],
    };
  }

  // Calculer les scores
  const scores = await Promise.all(
    vehicules.map(async (v) => {
      const c1 = scoreCompatibilite(v, mobilite);
      if (!c1.compatible) return null; // Incompatible — exclure

      const [c2, c3, c4] = await Promise.all([
        scoreDisponibilite(v, dateTransport, heureRDV),
        Promise.resolve(scoreProximite(v, lat, lng)),
        scoreCharge(v, dateTransport),
      ]);
      const c5 = scoreFiabilite(v);

      const total = c1.score + c2.score + c3.score + c4.score + c5.score;

      return {
        vehicule: v,
        chauffeur: v.chauffeurAssigne,
        scoreTotal: Math.round(total * 10) / 10,
        distanceKm: c3.distanceKm,
        criteres: {
          compatibilite: c1,
          disponibilite: c2,
          proximite: c3,
          charge: c4,
          fiabilite: c5,
        },
      };
    }),
  );

  // Filtrer les nuls (incompatibles) et trier
  const candidats = scores
    .filter(Boolean)
    .filter((s) => s.criteres.disponibilite.score > 0) // Dispo obligatoire
    .sort((a, b) => b.scoreTotal - a.scoreTotal);

  if (candidats.length === 0) {
    return {
      vehicule: null,
      chauffeur: null,
      scoreTotal: 0,
      alternatives: [],
      justification: [`Aucun véhicule disponible sur ce créneau pour mobilité ${mobilite}`],
    };
  }

  const best = candidats[0];

  return {
    vehicule: best.vehicule,
    chauffeur: best.chauffeur,
    scoreTotal: best.scoreTotal,
    distanceKm: best.distanceKm,
    alternatives: candidats.slice(1, 3).map((c) => ({
      nom: c.vehicule.nom,
      type: c.vehicule.type,
      score: c.scoreTotal,
      distance: c.distanceKm,
    })),
    justification: [
      `Véhicule sélectionné : ${best.vehicule.nom} (${best.vehicule.type})`,
      `Score global : ${best.scoreTotal}/100`,
      best.criteres.compatibilite.detail,
      best.criteres.proximite.detail,
      best.criteres.charge.detail,
      best.criteres.fiabilite.detail,
    ],
  };
}

module.exports = { smartDispatch, MOBILITE_VEHICULE };
