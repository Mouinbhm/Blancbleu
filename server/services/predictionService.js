/**
 * BlancBleu — Prédiction des besoins en flotte
 *
 * Algorithme : moyenne glissante sur les 8 dernières semaines
 * par jour ISO de semaine (1=Lun..7=Dim) et par type de véhicule.
 *
 * Tension = transports attendus / véhicules disponibles (hors hors_service).
 *   < 0.70 → OK
 *   0.70–0.90 → TENDU
 *   ≥ 0.90 → CRITIQUE
 */

const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");

const TYPES = ["VSL", "TPMR", "AMBULANCE"];
const JOURS_FR = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SEMAINES_HISTORIQUE = 8;

const STATUTS_ACTIFS = [
  "COMPLETED",
  "ASSIGNED",
  "SCHEDULED",
  "CONFIRMED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION",
];

function tensionLabel(ratio) {
  if (ratio >= 0.9) return "CRITIQUE";
  if (ratio >= 0.7) return "TENDU";
  return "OK";
}

function jsJourVersISO(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Prédit les besoins en flotte pour les prochains nbJours jours.
 * @param {number} nbJours - Nombre de jours à prédire (max 14)
 * @returns {Promise<{ predictions: Array, capacite: Object, semaines_historique: number }>}
 */
async function predireBesoinsFlotte(nbJours = 7) {
  const nbJoursEffectif = Math.min(Math.max(1, nbJours), 14);
  const depuisDate = new Date(Date.now() - SEMAINES_HISTORIQUE * 7 * 24 * 60 * 60 * 1000);

  // Agrégation en deux passes :
  // 1) Compter par (semaine ISO, jourSemaine, typeTransport)
  // 2) Moyenner sur le nombre de semaines observées
  const historique = await Transport.aggregate([
    {
      $match: {
        deletedAt: null,
        dateTransport: { $gte: depuisDate },
        statut: { $in: STATUTS_ACTIFS },
      },
    },
    {
      $group: {
        _id: {
          jourSemaine: { $isoDayOfWeek: "$dateTransport" },
          typeTransport: "$typeTransport",
          annee: { $isoWeekYear: "$dateTransport" },
          semaine: { $isoWeek: "$dateTransport" },
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: {
          jourSemaine: "$_id.jourSemaine",
          typeTransport: "$_id.typeTransport",
        },
        totalCount: { $sum: "$count" },
        nbSemaines: { $sum: 1 },
      },
    },
  ]);

  // Construire la map jourISO → type → moyenne arrondie
  const moyenneMap = {};
  for (let j = 1; j <= 7; j++) {
    moyenneMap[j] = {};
    for (const type of TYPES) moyenneMap[j][type] = 0;
  }

  for (const entry of historique) {
    const { jourSemaine, typeTransport } = entry._id;
    if (moyenneMap[jourSemaine] && TYPES.includes(typeTransport)) {
      moyenneMap[jourSemaine][typeTransport] =
        Math.ceil(entry.totalCount / Math.max(entry.nbSemaines, 1));
    }
  }

  // Capacité par type : véhicules actifs (ni supprimés, ni hors_service)
  const flotteAgg = await Vehicle.aggregate([
    { $match: { deletedAt: null, statut: { $ne: "hors_service" } } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);

  const capacite = { VSL: 0, TPMR: 0, AMBULANCE: 0 };
  for (const f of flotteAgg) {
    if (TYPES.includes(f._id)) capacite[f._id] = f.count;
  }

  // Prédictions jour par jour
  const predictions = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < nbJoursEffectif; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    const jourISO = jsJourVersISO(date.getDay());
    const dateStr = date.toISOString().slice(0, 10);

    const parType = {};
    let tensionMax = 0;

    for (const type of TYPES) {
      const attendus = moyenneMap[jourISO][type];
      const disponibles = capacite[type];
      const tension =
        disponibles > 0
          ? Math.round((attendus / disponibles) * 100) / 100
          : attendus > 0
            ? 1
            : 0;
      tensionMax = Math.max(tensionMax, tension);
      parType[type] = { attendus, disponibles, tension };
    }

    predictions.push({
      date: dateStr,
      jourSemaine: JOURS_FR[jourISO],
      jourISO,
      parType,
      tensionMax: Math.round(tensionMax * 100) / 100,
      tensionLabel: tensionLabel(tensionMax),
    });
  }

  return {
    predictions,
    capacite,
    semaines_historique: SEMAINES_HISTORIQUE,
  };
}

module.exports = { predireBesoinsFlotte };
