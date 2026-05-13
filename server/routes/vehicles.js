/**
 * BlancBleu — Routes Véhicules Transport Sanitaire
 * Remplace routes/units.js
 */
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { createVehicleSchema, updateVehicleSchema } = require("../validators/schemas");
const Vehicle        = require("../models/Vehicle");
const Transport      = require("../models/Transport");
const socketService  = require("../services/socketService");
const { audit }      = require("../services/auditService");
const fleetAnalytics = require("../services/fleetAnalyticsService");

// Statuts indiquant qu'un transport est terminé (véhicule devrait être libre)
const STATUTS_TERMINES = ["COMPLETED", "CANCELLED", "NO_SHOW", "BILLED"];

// ── GET /api/vehicles ─────────────────────────────────────────────────────────
router.get("/", protect, async (req, res, next) => {
  try {
    const { statut, type, disponible } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const filtre = { deletedAt: null };
    if (statut) filtre.statut = statut;
    if (type) filtre.type = type;
    if (disponible === "true") filtre.statut = "disponible";

    const [data, total] = await Promise.all([
      Vehicle.find(filtre)
        .populate("chauffeurAssigne", "nom prenom email")
        .populate("transportEnCours", "numero motif statut patient")
        .sort({ statut: 1, nom: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Vehicle.countDocuments(filtre),
    ]);

    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/stats ───────────────────────────────────────────────────
router.get("/stats", protect, async (req, res, next) => {
  try {
    const [total, disponibles, enMission, maintenance] = await Promise.all([
      Vehicle.countDocuments({ deletedAt: null }),
      Vehicle.countDocuments({ deletedAt: null, statut: "Disponible" }),
      Vehicle.countDocuments({ deletedAt: null, statut: "En service" }),
      Vehicle.countDocuments({ deletedAt: null, statut: "Maintenance" }),
    ]);

    const parType = await Vehicle.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          disponibles: {
            $sum: { $cond: [{ $eq: ["$statut", "Disponible"] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({ total, disponibles, enMission, maintenance, parType });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/diagnostic ─────────────────────────────────────────────
// Rapport d'incohérence entre le statut des véhicules et l'état de leurs transports.
// Lecture seule — ne modifie rien en base.
router.get(
  "/diagnostic",
  protect,
  authorize("admin", "superviseur"),
  async (req, res, next) => {
    try {
      const vehiculesEnMission = await Vehicle.find({
        statut: "En service",
        deletedAt: null,
      })
        .populate("transportEnCours", "numero statut dateTransport")
        .lean();

      const vehiculesBloqués = [];

      for (const v of vehiculesEnMission) {
        let probleme = null;

        if (!v.transportEnCours) {
          probleme = "Aucun transport lié";
        } else if (STATUTS_TERMINES.includes(v.transportEnCours.statut)) {
          probleme = "Transport terminé mais véhicule non libéré";
        }

        if (probleme) {
          vehiculesBloqués.push({
            vehiculeId: v._id,
            immatriculation: v.immatriculation,
            nom: v.nom,
            type: v.type,
            statutVehicule: v.statut,
            transportEnCours: v.transportEnCours
              ? {
                  numero: v.transportEnCours.numero,
                  statut: v.transportEnCours.statut,
                  dateTransport: v.transportEnCours.dateTransport,
                }
              : null,
            probleme,
          });
        }
      }

      res.json({
        vehiculesBloqués,
        totalEnMission: vehiculesEnMission.length,
        totalBloqués: vehiculesBloqués.length,
        totalSains: vehiculesEnMission.length - vehiculesBloqués.length,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// ── GET /api/vehicles/dashboard ──────────────────────────────────────────────
// Tableau de bord flotte : KPI, véhicules, missions, alertes
router.get("/dashboard", protect, async (req, res, next) => {
  try {
    const { period = "month" } = req.query;
    const data = await fleetAnalytics.getFleetDashboardStats(period);
    res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/availability?date=YYYY-MM-DD ────────────────────────────
// Disponibilité flotte par créneau horaire pour une date donnée
router.get("/availability", protect, async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const slots = await fleetAnalytics.getFleetAvailabilityByTimeSlot(date);
    res.json({ success: true, date, slots });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/maintenance/upcoming?days=30 ────────────────────────────
// Maintenances à venir dans les X prochains jours
router.get("/maintenance/upcoming", protect, async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const maintenances = await fleetAnalytics.getUpcomingMaintenances(days);
    res.json({ success: true, daysAhead: days, count: maintenances.length, maintenances });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/:id/stats ──────────────────────────────────────────────
router.get("/:id/stats", protect, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).lean();
    if (!vehicle) return res.status(404).json({ message: "Introuvable" });

    const today = new Date();
    const diffDays = (date) =>
      date ? Math.ceil((new Date(date) - today) / 86_400_000) : null;

    const kmActuel =
      typeof vehicle.kilometrage === "object"
        ? (vehicle.kilometrage?.actuel ?? 0)
        : (vehicle.kilometrage ?? 0);

    const prochainVidange =
      typeof vehicle.kilometrage === "object"
        ? vehicle.kilometrage?.prochainVidange
        : null;

    const equipementsActifs = [];
    const eq = vehicle.equipements || {};
    if (eq.oxygene       || vehicle.equipeOxygene)   equipementsActifs.push("oxygene");
    if (eq.brancard      || vehicle.equipeBrancard)   equipementsActifs.push("brancard");
    if (eq.fauteuilRampe || vehicle.equipeFauteuil)   equipementsActifs.push("fauteuil");
    if (eq.dae)           equipementsActifs.push("dae");
    if (eq.aspirateur)    equipementsActifs.push("aspirateur");
    if (eq.climatisation) equipementsActifs.push("climatisation");

    const depuis30j = new Date(today - 30 * 86_400_000);
    const transports30j = await Transport.countDocuments({
      vehicule: vehicle._id,
      dateTransport: { $gte: depuis30j },
    });

    return res.json({
      kilometrage_actuel:       kmActuel,
      jours_avant_ct:           diffDays(vehicle.controleTechnique?.dateExpiration),
      jours_avant_assurance:    diffDays(vehicle.assurance?.dateExpiration),
      prochaine_vidange_dans_km:prochainVidange != null ? prochainVidange - kmActuel : null,
      equipements_actifs:       equipementsActifs,
      taux_utilisation_30j:     Math.min(100, Math.round((transports30j / 30) * 100)),
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/:id/analytics ─────────────────────────────────────────
// Métriques détaillées d'un véhicule (taux utilisation, km, coût, alertes…)
router.get("/:id/analytics", protect, async (req, res, next) => {
  try {
    const { period = "month" } = req.query;
    const vehicle = await Vehicle.findById(req.params.id).lean();
    if (!vehicle) return res.status(404).json({ success: false, message: "Véhicule introuvable" });

    const [utilizationRate, totalKm, estimatedCost, missionHistory, upcomingMaint, alerts] =
      await Promise.all([
        fleetAnalytics.getVehicleUtilizationRate(req.params.id, period),
        fleetAnalytics.getVehicleKilometers(req.params.id, period),
        fleetAnalytics.getVehicleEstimatedCost(req.params.id, period),
        fleetAnalytics.getVehicleMissionHistory(req.params.id, { page: 1, limit: 10 }),
        fleetAnalytics.getUpcomingMaintenances(60),
        fleetAnalytics.detectMaintenanceAlerts(),
      ]);

    const vehicleAlerts = alerts.filter((a) => String(a.vehicleId) === String(req.params.id));
    const vehicleMaint  = upcomingMaint.filter((m) => String(m.vehicleId) === String(req.params.id));

    return res.json({
      success: true,
      vehicle,
      period,
      utilizationRate,
      totalKm,
      monthlyKm:         totalKm,
      estimatedCost,
      totalMissions:     vehicle.vehicleMetrics?.totalMissions     || 0,
      completedMissions: vehicle.vehicleMetrics?.completedMissions || 0,
      cancelledMissions: vehicle.vehicleMetrics?.cancelledMissions || 0,
      missionHistory:    missionHistory.missions,
      maintenanceInfo:   vehicle.maintenanceInfo,
      upcomingMaintenances: vehicleMaint,
      alerts:            vehicleAlerts,
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/:id/missions ──────────────────────────────────────────
// Historique paginé des missions d'un véhicule
router.get("/:id/missions", protect, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).select("_id nom").lean();
    if (!vehicle) return res.status(404).json({ success: false, message: "Véhicule introuvable" });

    const { startDate, endDate, status, page = 1, limit = 20 } = req.query;
    const result = await fleetAnalytics.getVehicleMissionHistory(req.params.id, {
      startDate, endDate, status, page, limit,
    });

    res.json({ success: true, vehicleId: req.params.id, vehicleName: vehicle.nom, ...result });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/vehicles/:id ─────────────────────────────────────────────────────
router.get("/:id", protect, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate("chauffeurAssigne", "nom prenom email")
      .populate(
        "transportEnCours",
        "numero motif statut patient dateTransport",
      );
    if (!vehicle)
      return res.status(404).json({ message: "Véhicule introuvable" });
    res.json(vehicle);
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/vehicles ────────────────────────────────────────────────────────
router.post(
  "/",
  protect,
  authorize("admin", "superviseur"),
  validate(createVehicleSchema),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.create(req.body);
      res.status(201).json(vehicle);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// ── PUT /api/vehicles/:id ─────────────────────────────────────────────────────
router.put(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  validate(updateVehicleSchema),
  async (req, res, next) => {
    try {
      const ancien = await Vehicle.findById(req.params.id);
      if (!ancien) return res.status(404).json({ message: "Introuvable" });

      const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });

      if (ancien.statut !== vehicle.statut) {
        socketService.emitUnitStatusChanged?.({
          unite: vehicle,
          ancienStatut: ancien.statut,
          nouveauStatut: vehicle.statut,
        });
      }

      res.json(vehicle);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// ── DELETE /api/vehicles/:id — Soft delete ────────────────────────────────────
router.delete("/:id", protect, authorize("admin"), async (req, res, next) => {
  try {
    await Vehicle.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ message: "Véhicule supprimé" });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/vehicles/:id/recalculate-metrics ───────────────────────────────
// Réservé admin — recalcule et persiste les métriques du véhicule
router.post(
  "/:id/recalculate-metrics",
  protect,
  authorize("admin", "superviseur"),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.findById(req.params.id).select("_id nom").lean();
      if (!vehicle) return res.status(404).json({ success: false, message: "Véhicule introuvable" });

      const metrics = await fleetAnalytics.recalculateVehicleMetrics(req.params.id);
      res.json({ success: true, vehicleId: req.params.id, vehicleName: vehicle.nom, metrics });
    } catch (err) {
      return next(err);
    }
  }
);

// ── PATCH /api/vehicles/:id/statut ────────────────────────────────────────────
router.patch("/:id/statut", protect, async (req, res, next) => {
  try {
    const { statut } = req.body;
    const valides = ["disponible", "en_mission", "maintenance", "hors_service"];
    if (!valides.includes(statut)) {
      return res
        .status(400)
        .json({ message: `Statut invalide. Valides : ${valides.join(", ")}` });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Introuvable" });

    const ancien = vehicle.statut;
    vehicle.statut = statut;
    await vehicle.save();

    socketService.emitUnitStatusChanged?.({
      unite: vehicle,
      ancienStatut: ancien,
      nouveauStatut: statut,
    });

    res.json(vehicle);
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/vehicles/:id/location — Mise à jour GPS ───────────────────────
router.patch("/:id/location", protect, async (req, res, next) => {
  try {
    const { lat, lng, adresse } = req.body;
    if (!lat || !lng)
      return res.status(400).json({ message: "lat et lng requis" });
    if (lat < -90 || lat > 90)
      return res.status(400).json({ message: "lat invalide" });
    if (lng < -180 || lng > 180)
      return res.status(400).json({ message: "lng invalide" });

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      {
        position: {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          adresse: adresse || "",
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!vehicle) return res.status(404).json({ message: "Introuvable" });

    socketService.emitLocationUpdated?.({
      unitId: vehicle._id,
      nom: vehicle.nom,
      type: vehicle.type,
      statut: vehicle.statut,
      position: vehicle.position,
      carburant: vehicle.carburant,
      kilometrage: vehicle.kilometrage,
      transportEnCours: vehicle.transportEnCours,
    });

    res.json({ message: "Position mise à jour", position: vehicle.position });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
