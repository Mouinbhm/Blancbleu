/**
 * BlancBleu — Routes Analytics
 *
 * GET /api/analytics/dashboard     → KPIs globaux temps réel
 * GET /api/analytics/interventions → Stats interventions (TMR, priorités, types)
 * GET /api/analytics/flotte        → Stats flotte (dispo, km, carburant)
 * GET /api/analytics/ia            → Performance module IA
 * GET /api/analytics/historique    → Tendances sur N jours
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { protect, authorize } = require("../middleware/auth");
const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const AuditLog = require("../models/AuditLog");

// ─── Helper : plage de dates ───────────────────────────────────────────────────
function plage(jours = 30) {
  return new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/dashboard
// KPIs globaux pour le tableau de bord principal
// ══════════════════════════════════════════════════════════════════════════════
router.get("/dashboard", protect, async (req, res) => {
  try {
    const depuis = plage(30);

    const [
      totalInterventions,
      actives,
      completees30j,
      annulees30j,
      totalUnites,
      unitesDisponibles,
      unitesEnMission,
      unitesMaintenances,
      tmrData,
      parPriorite,
      escalades30j,
    ] = await Promise.all([
      Intervention.countDocuments(),
      Intervention.countDocuments({
        statut: {
          $in: [
            "CREATED",
            "VALIDATED",
            "ASSIGNED",
            "EN_ROUTE",
            "ON_SITE",
            "TRANSPORTING",
          ],
        },
      }),
      Intervention.countDocuments({
        statut: "COMPLETED",
        updatedAt: { $gte: depuis },
      }),
      Intervention.countDocuments({
        statut: "CANCELLED",
        updatedAt: { $gte: depuis },
      }),
      Unit.countDocuments(),
      Unit.countDocuments({ statut: "disponible" }),
      Unit.countDocuments({ statut: "en_mission" }),
      Unit.countDocuments({ statut: "maintenance" }),

      // TMR moyen — Temps Médian de Réponse (création → arrivée sur site)
      Intervention.aggregate([
        {
          $match: {
            statut: "COMPLETED",
            heureCreation: { $gte: depuis },
            heureArrivee: { $exists: true },
          },
        },
        {
          $project: {
            tmrMinutes: {
              $divide: [
                { $subtract: ["$heureArrivee", "$heureCreation"] },
                60000,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            tmrMoyen: { $avg: "$tmrMinutes" },
            tmrMin: { $min: "$tmrMinutes" },
            tmrMax: { $max: "$tmrMinutes" },
            count: { $sum: 1 },
          },
        },
      ]),

      // Distribution par priorité (30 derniers jours)
      Intervention.aggregate([
        { $match: { createdAt: { $gte: depuis } } },
        { $group: { _id: "$priorite", count: { $sum: 1 } } },
      ]),

      // Nombre d'escalades déclenchées
      AuditLog.countDocuments({
        action: "ESCALADE_TRIGGERED",
        createdAt: { $gte: depuis },
      }),
    ]);

    const tmr = tmrData[0] || {
      tmrMoyen: null,
      tmrMin: null,
      tmrMax: null,
      count: 0,
    };
    const priorites = { P1: 0, P2: 0, P3: 0 };
    parPriorite.forEach((p) => {
      if (p._id) priorites[p._id] = p.count;
    });

    const tauxDisponibilite =
      totalUnites > 0 ? Math.round((unitesDisponibles / totalUnites) * 100) : 0;

    const tauxCompletion =
      completees30j + annulees30j > 0
        ? Math.round((completees30j / (completees30j + annulees30j)) * 100)
        : 0;

    res.json({
      timestamp: new Date(),
      periode: "30 derniers jours",
      interventions: {
        total: totalInterventions,
        actives,
        completees: completees30j,
        annulees: annulees30j,
        tauxCompletion,
        parPriorite: priorites,
      },
      flotte: {
        total: totalUnites,
        disponibles: unitesDisponibles,
        enMission: unitesEnMission,
        maintenance: unitesMaintenances,
        tauxDisponibilite,
      },
      performance: {
        tmrMoyenMinutes: tmr.tmrMoyen
          ? Math.round(tmr.tmrMoyen * 10) / 10
          : null,
        tmrMinMinutes: tmr.tmrMin ? Math.round(tmr.tmrMin * 10) / 10 : null,
        tmrMaxMinutes: tmr.tmrMax ? Math.round(tmr.tmrMax * 10) / 10 : null,
        nbInterventionsAvecTMR: tmr.count,
        escalades30j,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/interventions
// Stats détaillées interventions
// ══════════════════════════════════════════════════════════════════════════════
router.get("/interventions", protect, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const depuis = plage(jours);

    const [
      parType,
      parStatut,
      parPriorite,
      dureeMoyenne,
      tauxEscalade,
      topAdresses,
    ] = await Promise.all([
      // Top 10 types d'incidents
      Intervention.aggregate([
        { $match: { createdAt: { $gte: depuis } } },
        { $group: { _id: "$typeIncident", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Par statut
      Intervention.aggregate([
        { $group: { _id: "$statut", count: { $sum: 1 } } },
      ]),

      // Par priorité avec TMR
      Intervention.aggregate([
        { $match: { createdAt: { $gte: depuis } } },
        {
          $group: {
            _id: "$priorite",
            count: { $sum: 1 },
            tmrMoyen: {
              $avg: {
                $cond: [
                  { $and: ["$heureArrivee", "$heureCreation"] },
                  {
                    $divide: [
                      { $subtract: ["$heureArrivee", "$heureCreation"] },
                      60000,
                    ],
                  },
                  null,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Durée moyenne de mission (COMPLETED)
      Intervention.aggregate([
        {
          $match: {
            statut: "COMPLETED",
            createdAt: { $gte: depuis },
            dureeMinutes: { $exists: true, $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            moyenne: { $avg: "$dureeMinutes" },
            mediane: { $avg: "$dureeMinutes" }, // approximation
            min: { $min: "$dureeMinutes" },
            max: { $max: "$dureeMinutes" },
          },
        },
      ]),

      // Taux d'escalade par priorité
      AuditLog.aggregate([
        {
          $match: {
            action: "ESCALADE_TRIGGERED",
            createdAt: { $gte: depuis },
          },
        },
        { $group: { _id: null, total: { $sum: 1 } } },
      ]),

      // Top 5 adresses récurrentes
      Intervention.aggregate([
        { $match: { createdAt: { $gte: depuis } } },
        { $group: { _id: "$adresse", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const statutMap = {};
    parStatut.forEach((s) => {
      if (s._id) statutMap[s._id] = s.count;
    });

    res.json({
      periode: `${jours} derniers jours`,
      parType,
      parStatut: statutMap,
      parPriorite: parPriorite.map((p) => ({
        priorite: p._id,
        count: p.count,
        tmrMoyen: p.tmrMoyen ? Math.round(p.tmrMoyen * 10) / 10 : null,
      })),
      dureesMission: dureeMoyenne[0]
        ? {
            moyenneMinutes: Math.round(dureeMoyenne[0].moyenne),
            minMinutes: Math.round(dureeMoyenne[0].min),
            maxMinutes: Math.round(dureeMoyenne[0].max),
          }
        : null,
      escalades: tauxEscalade[0]?.total || 0,
      topAdresses: topAdresses.map((a) => ({ adresse: a._id, count: a.count })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/flotte
// Stats flotte ambulancière
// ══════════════════════════════════════════════════════════════════════════════
router.get("/flotte", protect, async (req, res) => {
  try {
    const [unites, statsFlotte] = await Promise.all([
      Unit.find().select(
        "nom type statut carburant kilometrage lastStatusChangeAt",
      ),

      Unit.aggregate([
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            disponibles: {
              $sum: { $cond: [{ $eq: ["$statut", "disponible"] }, 1, 0] },
            },
            kmMoyen: { $avg: "$kilometrage" },
            carburantMoyen: { $avg: "$carburant" },
            carburantBas: {
              $sum: { $cond: [{ $lte: ["$carburant", 20] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const alertesCarburant = unites
      .filter((u) => u.carburant <= 20)
      .map((u) => ({
        id: u._id,
        nom: u.nom,
        type: u.type,
        carburant: u.carburant,
        niveau: u.carburant <= 10 ? "CRITIQUE" : "BAS",
      }));

    res.json({
      parType: statsFlotte,
      alertesCarburant,
      nbAlertes: alertesCarburant.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/ia
// Performance module IA de triage
// ══════════════════════════════════════════════════════════════════════════════
router.get("/ia", protect, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const depuis = plage(jours);

    const [predictions, overrides, fallbacks] = await Promise.all([
      // Nombre total de prédictions
      AuditLog.countDocuments({
        action: "IA_PREDICTION",
        createdAt: { $gte: depuis },
      }),

      // Nombre d'overrides (règles expertes ont modifié la prédiction ML)
      AuditLog.countDocuments({
        action: "IA_OVERRIDE",
        createdAt: { $gte: depuis },
      }),

      // Nombre de fallbacks (Flask indisponible, règles métier utilisées)
      AuditLog.countDocuments({
        action: "IA_FALLBACK",
        createdAt: { $gte: depuis },
      }),
    ]);

    const tauxOverride =
      predictions > 0 ? Math.round((overrides / predictions) * 100) : 0;
    const tauxFallback =
      predictions > 0 ? Math.round((fallbacks / predictions) * 100) : 0;
    const tauxML = 100 - tauxOverride - tauxFallback;

    res.json({
      periode: `${jours} derniers jours`,
      predictions,
      overrides,
      fallbacks,
      tauxML: Math.max(0, tauxML),
      tauxOverride,
      tauxFallback,
      sante:
        tauxFallback > 20 ? "DEGRADEE" : tauxFallback > 5 ? "PARTIELLE" : "OK",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/historique
// Tendances journalières sur N jours (pour graphiques)
// ══════════════════════════════════════════════════════════════════════════════
router.get("/historique", protect, async (req, res) => {
  try {
    const jours = Math.min(parseInt(req.query.jours) || 7, 90);
    const depuis = plage(jours);

    const historique = await Intervention.aggregate([
      { $match: { createdAt: { $gte: depuis } } },
      {
        $group: {
          _id: {
            annee: { $year: "$createdAt" },
            mois: { $month: "$createdAt" },
            jour: { $dayOfMonth: "$createdAt" },
          },
          total: { $sum: 1 },
          p1: { $sum: { $cond: [{ $eq: ["$priorite", "P1"] }, 1, 0] } },
          p2: { $sum: { $cond: [{ $eq: ["$priorite", "P2"] }, 1, 0] } },
          p3: { $sum: { $cond: [{ $eq: ["$priorite", "P3"] }, 1, 0] } },
          completees: {
            $sum: { $cond: [{ $eq: ["$statut", "COMPLETED"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.annee": 1, "_id.mois": 1, "_id.jour": 1 } },
    ]);

    const data = historique.map((h) => ({
      date: `${h._id.annee}-${String(h._id.mois).padStart(2, "0")}-${String(h._id.jour).padStart(2, "0")}`,
      total: h.total,
      p1: h.p1,
      p2: h.p2,
      p3: h.p3,
      completees: h.completees,
    }));

    res.json({ jours, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
