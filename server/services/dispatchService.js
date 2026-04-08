/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — Moteur d'Auto-Dispatch Intelligent             ║
 * ║  Ambulances Blanc Bleu · Nice · PFE Ingénieur               ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Algorithme de sélection optimale d'unité ambulancière      ║
 * ║  basé sur 6 critères pondérés                               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ALGORITHME (score sur 100 pts) :
 * ┌─────────────────────────────────────────────────────────────┐
 * │  1. Distance GPS          → 35 pts (Haversine + ETA)        │
 * │  2. Compatibilité type    → 25 pts (SMUR/VSAV/VSL)          │
 * │  3. Niveau carburant      → 15 pts (>70% = full score)      │
 * │  4. Spécialité équipage   → 15 pts (Médecin, Infirmier...)  │
 * │  5. Charge opérationnelle → 5  pts (missions récentes)      │
 * │  6. Ancienneté véhicule   → 5  pts (année fabrication)      │
 * └─────────────────────────────────────────────────────────────┘
 */

const Unit         = require('../models/Unit');
const Intervention = require('../models/Intervention');
const { haversine, calculerETA, formatETA } = require('../utils/geoUtils');

// ─── Configuration des types d'unités par priorité ───────────────────────────
const TYPE_PRIORITE = {
  P1: { premier:'SMUR', second:'VSAV', interdit:[]      },
  P2: { premier:'VSAV', second:'SMUR', interdit:[]      },
  P3: { premier:'VSL',  second:'VSAV', interdit:['SMUR']},
};

// ─── Spécialités requises par type d'incident ────────────────────────────────
const SPECIALITE_INCIDENT = {
  'Arrêt cardiaque':       ['Médecin','Infirmier'],
  'AVC':                   ['Médecin','Infirmier'],
  'Détresse respiratoire': ['Médecin','Infirmier'],
  'Accouchement':          ['Médecin','Infirmier','Secouriste'],
  'Traumatisme grave':     ['Médecin','Ambulancier'],
  'Douleur thoracique':    ['Médecin','Infirmier'],
  'Accident de la route':  ['Ambulancier','Secouriste'],
  'Intoxication':          ['Médecin','Infirmier'],
  'Malaise':               ['Ambulancier','Secouriste'],
  'Brûlure':               ['Ambulancier','Infirmier'],
  'Chute':                 ['Ambulancier'],
  'Autre':                 ['Ambulancier'],
};

// ─── Poids des critères (total = 100) ────────────────────────────────────────
const POIDS = {
  distance:   35,
  type:       25,
  carburant:  15,
  specialite: 15,
  charge:      5,
  anciennete:  5,
};


// ══════════════════════════════════════════════════════════════════════════════
// CRITÈRE 1 — Distance GPS (35 pts)
// Score inversement proportionnel à la distance
// Unité à 0 km = 35 pts · Unité à 10+ km = 0 pts
// ══════════════════════════════════════════════════════════════════════════════
function scoreDistance(unit, incidentLat, incidentLng) {
  if (!unit.position?.lat || !unit.position?.lng) return 0;

  const dist = haversine(
    unit.position.lat, unit.position.lng,
    incidentLat, incidentLng
  );

  // Fonction linéaire inverse : 0 km = 35pts, 10 km = 0 pts
  const score = Math.max(0, POIDS.distance * (1 - dist / 10));

  return {
    score:       Math.round(score * 10) / 10,
    distanceKm:  Math.round(dist * 100) / 100,
    detail:      `${dist.toFixed(2)} km de l'incident`,
  };
}


// ══════════════════════════════════════════════════════════════════════════════
// CRITÈRE 2 — Compatibilité type (25 pts)
// SMUR pour P1, VSAV pour P2, VSL pour P3
// ══════════════════════════════════════════════════════════════════════════════
function scoreType(unit, priorite) {
  const cfg = TYPE_PRIORITE[priorite] || TYPE_PRIORITE.P2;

  if (cfg.interdit.includes(unit.type)) {
    return { score: 0, detail: `${unit.type} inadapté pour ${priorite}` };
  }
  if (unit.type === cfg.premier) {
    return { score: POIDS.type, detail: `${unit.type} = type optimal pour ${priorite}` };
  }
  if (unit.type === cfg.second) {
    return { score: POIDS.type * 0.7, detail: `${unit.type} = type acceptable pour ${priorite}` };
  }
  return { score: POIDS.type * 0.4, detail: `${unit.type} = type sous-optimal` };
}


// ══════════════════════════════════════════════════════════════════════════════
// CRITÈRE 3 — Carburant (15 pts)
// >70% = 15 pts · 40-70% = 10 pts · 20-40% = 5 pts · <20% = 0 pts
// ══════════════════════════════════════════════════════════════════════════════
function scoreCarburant(unit) {
  const carb = unit.carburant || 0;
  let score, detail;

  if (carb >= 70) {
    score  = POIDS.carburant;
    detail = `Carburant optimal (${carb}%)`;
  } else if (carb >= 40) {
    score  = POIDS.carburant * 0.67;
    detail = `Carburant suffisant (${carb}%)`;
  } else if (carb >= 20) {
    score  = POIDS.carburant * 0.33;
    detail = `Carburant faible (${carb}%) — ravitaillement recommandé`;
  } else {
    score  = 0;
    detail = `Carburant critique (${carb}%) — intervention risquée`;
  }

  return { score: Math.round(score * 10) / 10, detail };
}


// ══════════════════════════════════════════════════════════════════════════════
// CRITÈRE 4 — Spécialité équipage (15 pts)
// Vérifie si l'équipage a les compétences requises pour l'incident
// ══════════════════════════════════════════════════════════════════════════════
function scoreSpecialite(unit, typeIncident) {
  const specialitesRequises = SPECIALITE_INCIDENT[typeIncident] || ['Ambulancier'];
  const equipage = unit.equipage || [];

  if (equipage.length === 0) {
    return { score: 0, detail: 'Équipage vide — non dispatchable' };
  }

  const rolesEquipage = equipage.map(e => e.role);
  const matchCount    = specialitesRequises.filter(s => rolesEquipage.includes(s)).length;
  const ratio         = matchCount / specialitesRequises.length;

  const score  = Math.round(POIDS.specialite * ratio * 10) / 10;
  const detail = matchCount > 0
    ? `Équipage adapté : ${rolesEquipage.join(', ')}`
    : `Équipage non spécialisé pour ${typeIncident}`;

  return { score, detail };
}


// ══════════════════════════════════════════════════════════════════════════════
// CRITÈRE 5 — Charge opérationnelle (5 pts)
// Nombre de missions récentes (24h) — moins = mieux
// ══════════════════════════════════════════════════════════════════════════════
async function scoreCharge(unit) {
  try {
    const hier = new Date(Date.now() - 24 * 3600 * 1000);
    const nbMissions = await Intervention.countDocuments({
      unitAssignee: unit._id,
      createdAt:    { $gte: hier },
    });

    // 0 mission = 5pts · 5+ missions = 0 pts
    const score  = Math.max(0, POIDS.charge * (1 - nbMissions / 5));
    const detail = `${nbMissions} mission(s) dans les 24h`;

    return { score: Math.round(score * 10) / 10, detail };
  } catch {
    return { score: POIDS.charge / 2, detail: 'Charge inconnue' };
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// CRITÈRE 6 — Ancienneté véhicule (5 pts)
// Véhicule récent = plus fiable
// ══════════════════════════════════════════════════════════════════════════════
function scoreAnciennete(unit) {
  const annee      = unit.annee || 2018;
  const ageMax     = 10;
  const age        = new Date().getFullYear() - annee;
  const score      = Math.max(0, POIDS.anciennete * (1 - age / ageMax));
  const detail     = `Véhicule ${annee} (${age} ans)`;

  return { score: Math.round(score * 10) / 10, detail };
}


// ══════════════════════════════════════════════════════════════════════════════
// MOTEUR PRINCIPAL — Auto-Dispatch
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Trouve la meilleure unité pour une intervention
 * @param {Object} params - { priorite, typeIncident, lat, lng }
 * @returns {Object} { unite, scoreTotal, eta, alternatives, justification }
 */
async function autoDispatch({ priorite, typeIncident, lat, lng }) {

  // 1. Charger toutes les unités disponibles
  const unitsDisponibles = await Unit.find({ statut: 'disponible' });

  if (unitsDisponibles.length === 0) {
    return {
      unite:         null,
      scoreTotal:    0,
      eta:           null,
      alternatives:  [],
      justification: ['Aucune unité disponible actuellement'],
      erreur:        'NO_UNIT_AVAILABLE',
    };
  }

  // 2. Calculer les scores pour chaque unité
  const scores = await Promise.all(
    unitsDisponibles.map(async (unit) => {

      const c1 = scoreDistance(unit, lat, lng);
      const c2 = scoreType(unit, priorite);
      const c3 = scoreCarburant(unit);
      const c4 = scoreSpecialite(unit, typeIncident);
      const c5 = await scoreCharge(unit);
      const c6 = scoreAnciennete(unit);

      const total = c1.score + c2.score + c3.score + c4.score + c5.score + c6.score;
      const eta   = calculerETA(c1.distanceKm || 5, priorite);

      return {
        unit,
        scoreTotal:   Math.round(total * 10) / 10,
        distanceKm:   c1.distanceKm || 0,
        etaMinutes:   eta,
        etaFormate:   formatETA(eta),
        criteres: {
          distance:   c1,
          type:       c2,
          carburant:  c3,
          specialite: c4,
          charge:     c5,
          anciennete: c6,
        },
      };
    })
  );

  // 3. Trier par score décroissant
  scores.sort((a, b) => b.scoreTotal - a.scoreTotal);

  // 4. Meilleure unité
  const meilleur = scores[0];

  // 5. Construire la justification
  const justification = [
    `Unité sélectionnée : ${meilleur.unit.nom} (${meilleur.unit.type})`,
    `Score global : ${meilleur.scoreTotal}/100`,
    `Distance : ${meilleur.distanceKm} km — ETA : ${meilleur.etaFormate}`,
    meilleur.criteres.type.detail,
    meilleur.criteres.specialite.detail,
    meilleur.criteres.carburant.detail,
  ];

  // 6. Alternatives (2ème et 3ème)
  const alternatives = scores.slice(1, 3).map(s => ({
    nom:        s.unit.nom,
    type:       s.unit.type,
    score:      s.scoreTotal,
    eta:        s.etaFormate,
    distance:   s.distanceKm,
  }));

  return {
    unite:        meilleur.unit,
    scoreTotal:   meilleur.scoreTotal,
    scoreDetails: meilleur.criteres,
    distanceKm:   meilleur.distanceKm,
    etaMinutes:   meilleur.etaMinutes,
    etaFormate:   meilleur.etaFormate,
    alternatives,
    justification,
  };
}

module.exports = { autoDispatch, calculerETA, formatETA };