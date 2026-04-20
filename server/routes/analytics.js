/**
 * BlancBleu — Routes Analytics Transport Sanitaire
 * Adapté transport non urgent — utilise Transport et Vehicle
 */
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const AuditLog = require("../models/AuditLog");
const predictionService = require("../services/predictionService");

function plage(jours = 30) {
  return new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
}

// ── GET /api/analytics/dashboard ─────────────────────────────────────────────
router.get("/dashboard", protect, async (req, res) => {
  try {
    const depuis = plage(30);

    const [
      totalTransports,
      actifs,
      completes30j,
      annules30j,
      noShows30j,
      totalVehicules,
      vehiculesDisponibles,
      vehiculesEnMission,
      vehiculesMaintenance,
      dureeMoyenne,
      parMotif,
    ] = await Promise.all([
      Transport.countDocuments({ deletedAt: null }),
      Transport.countDocuments({
        deletedAt: null,
        statut: {
          $in: [
            "CONFIRMED",
            "SCHEDULED",
            "ASSIGNED",
            "EN_ROUTE_TO_PICKUP",
            "ARRIVED_AT_PICKUP",
            "PATIENT_ON_BOARD",
            "ARRIVED_AT_DESTINATION",
          ],
        },
      }),
      Transport.countDocuments({
        deletedAt: null,
        statut: "COMPLETED",
        updatedAt: { $gte: depuis },
      }),
      Transport.countDocuments({
        deletedAt: null,
        statut: "CANCELLED",
        updatedAt: { $gte: depuis },
      }),
      Transport.countDocuments({
        deletedAt: null,
        statut: "NO_SHOW",
        updatedAt: { $gte: depuis },
      }),
      Vehicle.countDocuments({ deletedAt: null }),
      Vehicle.countDocuments({ deletedAt: null, statut: "disponible" }),
      Vehicle.countDocuments({ deletedAt: null, statut: "en_mission" }),
      Vehicle.countDocuments({ deletedAt: null, statut: "maintenance" }),
      Transport.aggregate([
        {
          $match: {
            deletedAt: null,
            statut: "COMPLETED",
            createdAt: { $gte: depuis },
            dureeReelleMinutes: { $exists: true, $gt: 0 },
          },
        },
        { $group: { _id: null, moyenne: { $avg: "$dureeReelleMinutes" } } },
      ]),
      Transport.aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: depuis } } },
        { $group: { _id: "$motif", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const tauxDisponibilite =
      totalVehicules > 0
        ? Math.round((vehiculesDisponibles / totalVehicules) * 100)
        : 0;
    const tauxCompletion =
      completes30j + annules30j > 0
        ? Math.round((completes30j / (completes30j + annules30j)) * 100)
        : 0;
    const tauxNoShow =
      completes30j + noShows30j > 0
        ? Math.round((noShows30j / (completes30j + noShows30j)) * 100)
        : 0;

    res.json({
      timestamp: new Date(),
      periode: "30 derniers jours",
      transports: {
        total: totalTransports,
        actifs,
        completes: completes30j,
        annules: annules30j,
        noShows: noShows30j,
        tauxCompletion,
        tauxNoShow,
      },
      flotte: {
        total: totalVehicules,
        disponibles: vehiculesDisponibles,
        enMission: vehiculesEnMission,
        maintenance: vehiculesMaintenance,
        tauxDisponibilite,
      },
      performance: {
        dureeMoyenneMinutes: dureeMoyenne[0]?.moyenne
          ? Math.round(dureeMoyenne[0].moyenne)
          : null,
      },
      parMotif,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/analytics/transports ────────────────────────────────────────────
router.get("/transports", protect, async (req, res) => {
  try {
    const jours = parseInt(req.query.jours) || 30;
    const depuis = plage(jours);

    const [parType, parMotif, parStatut, dureeMoyenne] = await Promise.all([
      Transport.aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: depuis } } },
        { $group: { _id: "$typeTransport", count: { $sum: 1 } } },
      ]),
      Transport.aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: depuis } } },
        { $group: { _id: "$motif", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Transport.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$statut", count: { $sum: 1 } } },
      ]),
      Transport.aggregate([
        {
          $match: {
            deletedAt: null,
            statut: "COMPLETED",
            createdAt: { $gte: depuis },
            dureeReelleMinutes: { $exists: true, $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            moyenne: { $avg: "$dureeReelleMinutes" },
            min: { $min: "$dureeReelleMinutes" },
            max: { $max: "$dureeReelleMinutes" },
          },
        },
      ]),
    ]);

    const statutMap = {};
    parStatut.forEach((s) => {
      if (s._id) statutMap[s._id] = s.count;
    });

    res.json({
      periode: `${jours} derniers jours`,
      parType,
      parMotif,
      parStatut: statutMap,
      durees: dureeMoyenne[0]
        ? {
            moyenne: Math.round(dureeMoyenne[0].moyenne),
            min: Math.round(dureeMoyenne[0].min),
            max: Math.round(dureeMoyenne[0].max),
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/analytics/flotte ─────────────────────────────────────────────────
router.get("/flotte", protect, async (req, res) => {
  try {
    const [vehicles, statsParType] = await Promise.all([
      Vehicle.find({ deletedAt: null }).select(
        "nom type statut carburant kilometrage",
      ),
      Vehicle.aggregate([
        { $match: { deletedAt: null } },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            disponibles: {
              $sum: { $cond: [{ $eq: ["$statut", "disponible"] }, 1, 0] },
            },
            kmMoyen: { $avg: "$kilometrage" },
            carburantMoyen: { $avg: "$carburant" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const alertesCarburant = vehicles
      .filter((v) => v.carburant <= 25)
      .map((v) => ({
        id: v._id,
        nom: v.nom,
        type: v.type,
        carburant: v.carburant,
        niveau: v.carburant <= 10 ? "CRITIQUE" : "BAS",
      }));

    res.json({
      parType: statsParType,
      alertesCarburant,
      nbAlertes: alertesCarburant.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/analytics/historique ────────────────────────────────────────────
router.get("/historique", protect, async (req, res) => {
  try {
    const jours = Math.min(parseInt(req.query.jours) || 7, 90);
    const depuis = plage(jours);

    const historique = await Transport.aggregate([
      { $match: { deletedAt: null, createdAt: { $gte: depuis } } },
      {
        $group: {
          _id: {
            annee: { $year: "$createdAt" },
            mois: { $month: "$createdAt" },
            jour: { $dayOfMonth: "$createdAt" },
          },
          total: { $sum: 1 },
          completes: {
            $sum: { $cond: [{ $eq: ["$statut", "COMPLETED"] }, 1, 0] },
          },
          noShows: { $sum: { $cond: [{ $eq: ["$statut", "NO_SHOW"] }, 1, 0] } },
          dialyse: { $sum: { $cond: [{ $eq: ["$motif", "Dialyse"] }, 1, 0] } },
          chimio: {
            $sum: { $cond: [{ $eq: ["$motif", "Chimiothérapie"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.annee": 1, "_id.mois": 1, "_id.jour": 1 } },
    ]);

    const data = historique.map((h) => ({
      date: `${h._id.annee}-${String(h._id.mois).padStart(2, "0")}-${String(h._id.jour).padStart(2, "0")}`,
      total: h.total,
      completes: h.completes,
      noShows: h.noShows,
      dialyse: h.dialyse,
      chimio: h.chimio,
    }));

    res.json({ jours, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/analytics/prediction-flotte ─────────────────────────────────────
router.get(
  "/prediction-flotte",
  protect,
  authorize("superviseur", "admin"),
  async (req, res) => {
    try {
      const nbJours = Math.min(parseInt(req.query.jours) || 7, 14);
      const result = await predictionService.predireBesoinsFlotte(nbJours);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;
