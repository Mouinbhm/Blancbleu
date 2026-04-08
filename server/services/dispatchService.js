/**
 * BlancBleu — Moteur Auto-Dispatch Intelligent
 * Score sur 100 pts : distance(35) + type(25) + carburant(15) + specialite(15) + charge(5) + anciennete(5)
 */
const Unit = require("../models/Unit");
const Intervention = require("../models/Intervention");
const { haversine, calculerETA, formatETA } = require("../utils/geoUtils");

const TYPE_PRIORITE = {
  P1: { premier: "SMUR", second: "VSAV" },
  P2: { premier: "VSAV", second: "SMUR" },
  P3: { premier: "VSL", second: "VSAV" },
};

const SPECIALITE_INCIDENT = {
  "Arrêt cardiaque": ["Médecin", "Infirmier"],
  AVC: ["Médecin", "Infirmier"],
  "Détresse respiratoire": ["Médecin", "Infirmier"],
  Accouchement: ["Médecin", "Infirmier"],
  "Traumatisme grave": ["Médecin", "Ambulancier"],
  "Douleur thoracique": ["Médecin", "Infirmier"],
  "Accident de la route": ["Ambulancier", "Secouriste"],
  Malaise: ["Ambulancier"],
  Brûlure: ["Ambulancier"],
  Chute: ["Ambulancier"],
  Autre: ["Ambulancier"],
};

function scoreDistance(unit, lat, lng) {
  if (!unit.position?.lat || !unit.position?.lng)
    return { score: 0, distanceKm: 99 };
  const dist = haversine(unit.position.lat, unit.position.lng, lat, lng);
  const score = Math.max(0, 35 * (1 - dist / 10));
  return {
    score: Math.round(score * 10) / 10,
    distanceKm: Math.round(dist * 100) / 100,
  };
}

function scoreType(unit, priorite) {
  const cfg = TYPE_PRIORITE[priorite] || TYPE_PRIORITE.P2;
  if (unit.type === cfg.premier)
    return { score: 25, detail: `${unit.type} optimal` };
  if (unit.type === cfg.second)
    return { score: 17, detail: `${unit.type} acceptable` };
  return { score: 10, detail: `${unit.type} sous-optimal` };
}

function scoreCarburant(unit) {
  const c = unit.carburant || 0;
  const score = c >= 70 ? 15 : c >= 40 ? 10 : c >= 20 ? 5 : 0;
  return { score, detail: `Carburant ${c}%` };
}

function scoreSpecialite(unit, typeIncident) {
  const requis = SPECIALITE_INCIDENT[typeIncident] || ["Ambulancier"];
  const roles = (unit.equipage || []).map((e) => e.role);
  if (roles.length === 0) return { score: 0, detail: "Équipage vide" };
  const match = requis.filter((r) => roles.includes(r)).length;
  const score = Math.round(15 * (match / requis.length) * 10) / 10;
  return { score, detail: `Équipage : ${roles.join(", ")}` };
}

async function scoreCharge(unit) {
  try {
    const hier = new Date(Date.now() - 24 * 3600 * 1000);
    const nb = await Intervention.countDocuments({
      unitAssignee: unit._id,
      createdAt: { $gte: hier },
    });
    const score = Math.max(0, 5 * (1 - nb / 5));
    return {
      score: Math.round(score * 10) / 10,
      detail: `${nb} mission(s) / 24h`,
    };
  } catch {
    return { score: 2.5, detail: "Charge inconnue" };
  }
}

function scoreAnciennete(unit) {
  const age = new Date().getFullYear() - (unit.annee || 2018);
  const score = Math.max(0, 5 * (1 - age / 10));
  return {
    score: Math.round(score * 10) / 10,
    detail: `Véhicule ${unit.annee || "?"} (${age} ans)`,
  };
}

async function autoDispatch({ priorite, typeIncident, lat, lng }) {
  const units = await Unit.find({ statut: "disponible" });
  if (units.length === 0) {
    return {
      unite: null,
      scoreTotal: 0,
      eta: null,
      alternatives: [],
      justification: ["Aucune unité disponible"],
    };
  }

  const scores = await Promise.all(
    units.map(async (unit) => {
      const c1 = scoreDistance(unit, lat, lng);
      const c2 = scoreType(unit, priorite);
      const c3 = scoreCarburant(unit);
      const c4 = scoreSpecialite(unit, typeIncident);
      const c5 = await scoreCharge(unit);
      const c6 = scoreAnciennete(unit);
      const total =
        c1.score + c2.score + c3.score + c4.score + c5.score + c6.score;
      const eta = calculerETA(c1.distanceKm || 5, priorite);
      return {
        unit,
        scoreTotal: Math.round(total * 10) / 10,
        distanceKm: c1.distanceKm,
        etaMinutes: eta.minutes,
        etaFormate: eta.formate,
        criteres: {
          distance: c1,
          type: c2,
          carburant: c3,
          specialite: c4,
          charge: c5,
          anciennete: c6,
        },
      };
    }),
  );

  scores.sort((a, b) => b.scoreTotal - a.scoreTotal);
  const best = scores[0];

  return {
    unite: best.unit,
    scoreTotal: best.scoreTotal,
    distanceKm: best.distanceKm,
    etaMinutes: best.etaMinutes,
    etaFormate: best.etaFormate,
    alternatives: scores.slice(1, 3).map((s) => ({
      nom: s.unit.nom,
      type: s.unit.type,
      score: s.scoreTotal,
      eta: s.etaFormate,
      distance: s.distanceKm,
    })),
    justification: [
      `Unité sélectionnée : ${best.unit.nom} (${best.unit.type})`,
      `Score global : ${best.scoreTotal}/100`,
      `Distance : ${best.distanceKm} km — ETA : ${best.etaFormate}`,
      best.criteres.type.detail,
      best.criteres.specialite.detail,
    ],
  };
}

module.exports = { autoDispatch, calculerETA, formatETA };
