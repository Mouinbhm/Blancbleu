/**
 * BlancBleu — Service analytics flotte
 *
 * Centralise tous les calculs de performance et disponibilité véhicules.
 * Utilise les modèles Vehicle, Transport et Maintenance.
 */
const mongoose = require("mongoose");
const Vehicle     = require("../models/Vehicle");
const Transport   = require("../models/Transport");
const Maintenance = require("../models/Maintenance");
const cfg         = require("../config/fleetConfig");

// ── Constantes statuts ────────────────────────────────────────────────────────
const STATUTS_COMPLETES = ["COMPLETED", "BILLED", "PAID"];
const STATUTS_ANNULES   = ["CANCELLED", "NO_SHOW", "FAILED"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toOid(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(String(id))
    : id;
}

/** Convertit "HH:MM" en minutes depuis minuit. */
function timeToMin(str) {
  if (!str) return 0;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Calcule le nombre de jours entre deux dates. */
function diffDays(a, b = new Date()) {
  return Math.ceil((new Date(a) - new Date(b)) / 86_400_000);
}

/** Retourne la sévérité d'alerte selon les jours restants. */
function severityFromDays(days) {
  if (days < 0) return "overdue";
  if (days <= cfg.alertThresholds.maintenanceDaysUrgent)  return "urgent";
  if (days <= cfg.alertThresholds.maintenanceDaysWarning) return "warning";
  return "ok";
}

/** Convertit period en plage de dates. */
function periodToRange(period = "month") {
  const end   = new Date();
  const start = new Date();
  switch (period) {
    case "today":  start.setHours(0, 0, 0, 0); break;
    case "week":   start.setDate(start.getDate() - 7);   break;
    case "year":   start.setDate(start.getDate() - 365); break;
    default:       start.setDate(start.getDate() - 30);  // month
  }
  return { start, end };
}

// ── 1. Taux d'utilisation ────────────────────────────────────────────────────

async function getVehicleUtilizationRate(vehicleId, period = "month") {
  const { start, end } = periodToRange(period);
  const periodDays = Math.max(1, Math.round((end - start) / 86_400_000));

  const completed = await Transport.countDocuments({
    vehicule:      toOid(vehicleId),
    dateTransport: { $gte: start, $lte: end },
    statut:        { $in: STATUTS_COMPLETES },
  });

  return Math.min(100, Math.round((completed / (periodDays * cfg.maxMissionsPerDay)) * 100));
}

// ── 2. Kilomètres parcourus ──────────────────────────────────────────────────

async function getVehicleKilometers(vehicleId, period = "month") {
  const { start, end } = periodToRange(period);

  const [row] = await Transport.aggregate([
    {
      $match: {
        vehicule:      toOid(vehicleId),
        dateTransport: { $gte: start, $lte: end },
        statut:        { $in: STATUTS_COMPLETES },
      },
    },
    { $group: { _id: null, km: { $sum: { $ifNull: ["$distanceKm", 0] } } } },
  ]);

  return Math.round((row?.km || 0) * 10) / 10;
}

// ── 3. Coût estimé ───────────────────────────────────────────────────────────

async function getVehicleEstimatedCost(vehicleId, period = "month") {
  const { start, end } = periodToRange(period);

  const [kmRow] = await Transport.aggregate([
    {
      $match: {
        vehicule:      toOid(vehicleId),
        dateTransport: { $gte: start, $lte: end },
        statut:        { $in: STATUTS_COMPLETES },
      },
    },
    { $group: { _id: null, km: { $sum: { $ifNull: ["$distanceKm", 0] } } } },
  ]);

  const [maintRow] = await Maintenance.aggregate([
    {
      $match: {
        unite:    toOid(vehicleId),
        dateDebut: { $gte: start, $lte: end },
        statut:   { $in: ["terminé", "en-cours"] },
      },
    },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$cout", 0] } } } },
  ]);

  const km         = kmRow?.km      || 0;
  const maintCost  = maintRow?.total || 0;
  const kmCost     = km * cfg.costPerKm;
  const total      = kmCost + maintCost;

  return {
    km:             Math.round(km * 10) / 10,
    kmCost:         Math.round(kmCost   * 100) / 100,
    maintenanceCost:Math.round(maintCost * 100) / 100,
    total:          Math.round(total    * 100) / 100,
  };
}

// ── 4. Prochaines maintenances ───────────────────────────────────────────────

async function getUpcomingMaintenances(daysAhead = 30) {
  const now   = new Date();
  const limit = new Date(now.getTime() + daysAhead * 86_400_000);

  // Maintenances planifiées en base
  const planned = await Maintenance.find({
    statut:   { $in: ["planifié", "en-cours"] },
    dateDebut: { $lte: limit },
  })
    .populate("unite", "nom immatriculation type kilometrage maintenanceInfo")
    .sort({ dateDebut: 1 })
    .lean();

  const results = planned.map((m) => {
    const days = m.dateDebut ? diffDays(m.dateDebut, now) : null;
    return {
      _id:             m._id,
      vehicleId:       m.unite?._id,
      vehicleName:     m.unite?.nom          || "—",
      immatriculation: m.unite?.immatriculation || "—",
      vehicleType:     m.unite?.type,
      type:            m.type,
      dateDebut:       m.dateDebut,
      statut:          m.statut,
      garage:          m.garage,
      cout:            m.cout,
      daysUntil:       days,
      priority:        severityFromDays(days ?? 0),
      source:          "planned",
    };
  });

  // Véhicules avec alerte km (hors ceux déjà planifiés)
  const plannedIds = new Set(planned.map((m) => String(m.unite?._id)));

  const allVehicles = await Vehicle.find({ deletedAt: null })
    .select("nom immatriculation type kilometrage maintenanceInfo controleTechnique assurance")
    .lean();

  for (const v of allVehicles) {
    if (plannedIds.has(String(v._id))) continue;

    const kmActuel       = v.kilometrage?.actuel        || 0;
    const prochainVidange = v.kilometrage?.prochainVidange;
    const nextMaintDate   = v.maintenanceInfo?.nextMaintenanceDate;

    // Alerte kilomètres
    if (prochainVidange != null) {
      const kmLeft = prochainVidange - kmActuel;
      if (kmLeft <= cfg.alertThresholds.kmBeforeMaintenanceWarn) {
        results.push({
          vehicleId:       v._id,
          vehicleName:     v.nom,
          immatriculation: v.immatriculation,
          vehicleType:     v.type,
          type:            "Vidange + filtres",
          dateDebut:       null,
          statut:          "À planifier",
          kmLeft,
          priority:        kmLeft <= 0 ? "overdue" : kmLeft <= 500 ? "urgent" : "warning",
          source:          "km",
        });
      }
    }

    // Alerte date maintenance suivante
    if (nextMaintDate && new Date(nextMaintDate) <= limit) {
      const days = diffDays(nextMaintDate, now);
      results.push({
        vehicleId:       v._id,
        vehicleName:     v.nom,
        immatriculation: v.immatriculation,
        vehicleType:     v.type,
        type:            "Révision complète",
        dateDebut:       nextMaintDate,
        statut:          "À planifier",
        daysUntil:       days,
        priority:        severityFromDays(days),
        source:          "schedule",
      });
    }
  }

  // Trier par priorité puis par date
  const pOrder = { overdue: 0, urgent: 1, warning: 2, ok: 3 };
  return results.sort((a, b) => {
    const pa = pOrder[a.priority] ?? 4;
    const pb = pOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    if (a.dateDebut && b.dateDebut) return new Date(a.dateDebut) - new Date(b.dateDebut);
    return 0;
  });
}

// ── 5. Disponibilité par créneau (un véhicule) ──────────────────────────────

async function getVehicleAvailabilitySlots(vehicleId, date) {
  const day    = new Date(date); day.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);  dayEnd.setHours(23, 59, 59, 999);

  const [vehicle, transports, maintenances] = await Promise.all([
    Vehicle.findById(vehicleId).select("statut").lean(),
    Transport.find({
      vehicule:      vehicleId,
      dateTransport: { $gte: day, $lte: dayEnd },
      statut:        { $nin: ["CANCELLED", "NO_SHOW", "FAILED"] },
    }).select("heureRDV distanceKm statut numero").lean(),
    Maintenance.find({
      unite:    vehicleId,
      statut:   { $in: ["planifié", "en-cours"] },
      dateDebut: { $lte: dayEnd },
      $or: [{ dateFin: { $gte: day } }, { dateFin: null }],
    }).lean(),
  ]);

  return cfg.timeSlots.map((slot) => {
    if (!vehicle || vehicle.statut === "Hors service") {
      return { ...slot, status: "out_of_service", transport: null };
    }
    if (maintenances.length > 0 || vehicle.statut === "Maintenance") {
      return { ...slot, status: "maintenance", transport: null };
    }

    const slotStart = slot.start * 60;
    const slotEnd   = slot.end <= slot.start ? (slot.end + 24) * 60 : slot.end * 60;

    const occupied = transports.find((t) => {
      const tStart = timeToMin(t.heureRDV);
      const tEnd   = tStart + Math.max(60, (t.distanceKm || 0) * 3);
      return tStart < slotEnd && tEnd > slotStart;
    });

    return {
      ...slot,
      status:    occupied ? "in_mission" : "available",
      transport: occupied ? { numero: occupied.numero, statut: occupied.statut } : null,
    };
  });
}

// ── 6. Disponibilité flotte par créneau (date donnée) ───────────────────────

async function getFleetAvailabilityByTimeSlot(date) {
  const day    = new Date(date); day.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);  dayEnd.setHours(23, 59, 59, 999);

  const [vehicles, transports, maintenances] = await Promise.all([
    Vehicle.find({ deletedAt: null })
      .select("_id nom immatriculation type statut")
      .lean(),
    Transport.find({
      dateTransport: { $gte: day, $lte: dayEnd },
      vehicule:      { $ne: null },
      statut:        { $nin: ["CANCELLED", "NO_SHOW", "FAILED"] },
    }).select("vehicule heureRDV distanceKm statut numero").lean(),
    Maintenance.find({
      statut:    { $in: ["planifié", "en-cours"] },
      dateDebut:  { $lte: dayEnd },
      $or: [{ dateFin: { $gte: day } }, { dateFin: null }],
    }).select("unite").lean(),
  ]);

  const maintenanceVids = new Set(maintenances.map((m) => String(m.unite)));
  const transportsByVid  = {};
  for (const t of transports) {
    const k = String(t.vehicule);
    if (!transportsByVid[k]) transportsByVid[k] = [];
    transportsByVid[k].push(t);
  }

  return cfg.timeSlots.map((slot) => {
    const slotStart = slot.start * 60;
    const slotEnd   = slot.end <= slot.start ? (slot.end + 24) * 60 : slot.end * 60;

    let available = 0, inMission = 0, inMaintenance = 0, outOfService = 0;
    const vehicleDetails = [];

    for (const v of vehicles) {
      const vid = String(v._id);

      if (v.statut === "Hors service") {
        outOfService++;
        vehicleDetails.push({ id: vid, nom: v.nom, immatriculation: v.immatriculation, type: v.type, status: "out_of_service" });
        continue;
      }
      if (maintenanceVids.has(vid) || v.statut === "Maintenance") {
        inMaintenance++;
        vehicleDetails.push({ id: vid, nom: v.nom, immatriculation: v.immatriculation, type: v.type, status: "maintenance" });
        continue;
      }

      const vTransports = transportsByVid[vid] || [];
      const occupied    = vTransports.find((t) => {
        const tStart = timeToMin(t.heureRDV);
        const tEnd   = tStart + Math.max(60, (t.distanceKm || 0) * 3);
        return tStart < slotEnd && tEnd > slotStart;
      });

      if (occupied) {
        inMission++;
        vehicleDetails.push({ id: vid, nom: v.nom, immatriculation: v.immatriculation, type: v.type, status: "in_mission", transportNumero: occupied.numero });
      } else {
        available++;
        vehicleDetails.push({ id: vid, nom: v.nom, immatriculation: v.immatriculation, type: v.type, status: "available" });
      }
    }

    return {
      ...slot,
      summary: { available, inMission, inMaintenance, outOfService, total: vehicles.length },
      vehicles: vehicleDetails,
    };
  });
}

// ── 7. Historique missions d'un véhicule ────────────────────────────────────

async function getVehicleMissionHistory(vehicleId, filters = {}) {
  const { startDate, endDate, status, page = 1, limit = 20 } = filters;
  const query = { vehicule: toOid(vehicleId) };

  if (startDate || endDate) {
    query.dateTransport = {};
    if (startDate) query.dateTransport.$gte = new Date(startDate);
    if (endDate)   query.dateTransport.$lte = new Date(endDate);
  }
  if (status) query.statut = status;

  const [missions, total] = await Promise.all([
    Transport.find(query)
      .select("numero statut dateTransport heureRDV distanceKm motif patient adresseDepart adresseDestination chauffeur")
      .populate("chauffeur", "nom prenom")
      .sort({ dateTransport: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean(),
    Transport.countDocuments(query),
  ]);

  return {
    missions,
    pagination: {
      page:  Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  };
}

// ── 8. Alertes maintenance ───────────────────────────────────────────────────

async function detectMaintenanceAlerts() {
  const now      = new Date();
  const vehicles = await Vehicle.find({ deletedAt: null })
    .select("nom immatriculation type kilometrage maintenanceInfo controleTechnique assurance")
    .lean();

  const alerts = [];

  for (const v of vehicles) {
    const kmActuel        = v.kilometrage?.actuel          || 0;
    const prochainVidange  = v.kilometrage?.prochainVidange;
    const prochainControle = v.kilometrage?.prochainControle;
    const ctExpiry         = v.controleTechnique?.dateExpiration;
    const assuranceExpiry  = v.assurance?.dateExpiration;
    const nextMaintDate    = v.maintenanceInfo?.nextMaintenanceDate;

    const pushAlert = (type, message, severity, extra = {}) =>
      alerts.push({ vehicleId: v._id, vehicleName: v.nom, immatriculation: v.immatriculation, vehicleType: v.type, type, message, severity, ...extra });

    // CT
    if (ctExpiry) {
      const days = diffDays(ctExpiry, now);
      if (days <= cfg.alertThresholds.maintenanceDaysWarning) {
        pushAlert("CT_EXPIRY",
          days < 0 ? "Contrôle technique expiré" : `CT expire dans ${days} j`,
          severityFromDays(days), { daysUntil: days });
      }
    }

    // Assurance
    if (assuranceExpiry) {
      const days = diffDays(assuranceExpiry, now);
      if (days <= cfg.alertThresholds.maintenanceDaysWarning) {
        pushAlert("INSURANCE_EXPIRY",
          days < 0 ? "Assurance expirée" : `Assurance expire dans ${days} j`,
          severityFromDays(days), { daysUntil: days });
      }
    }

    // Km vidange
    if (prochainVidange != null) {
      const kmLeft = prochainVidange - kmActuel;
      if (kmLeft <= cfg.alertThresholds.kmBeforeMaintenanceWarn) {
        pushAlert("KM_VIDANGE",
          kmLeft <= 0 ? `Vidange dépassée de ${Math.abs(kmLeft)} km` : `Vidange dans ${kmLeft} km`,
          kmLeft <= 0 ? "overdue" : kmLeft <= 500 ? "urgent" : "warning",
          { kmLeft });
      }
    }

    // Km contrôle
    if (prochainControle != null) {
      const kmLeft = prochainControle - kmActuel;
      if (kmLeft <= cfg.alertThresholds.kmBeforeMaintenanceWarn) {
        pushAlert("KM_CONTROLE",
          kmLeft <= 0 ? `Contrôle dépassé de ${Math.abs(kmLeft)} km` : `Contrôle dans ${kmLeft} km`,
          kmLeft <= 0 ? "overdue" : kmLeft <= 500 ? "urgent" : "warning",
          { kmLeft });
      }
    }

    // Date maintenance
    if (nextMaintDate) {
      const days = diffDays(nextMaintDate, now);
      if (days <= cfg.alertThresholds.maintenanceDaysWarning) {
        pushAlert("MAINTENANCE_DATE",
          days < 0 ? "Maintenance en retard" : `Maintenance dans ${days} j`,
          severityFromDays(days), { daysUntil: days });
      }
    }
  }

  const sOrder = { overdue: 0, urgent: 1, warning: 2, ok: 3 };
  return alerts.sort((a, b) => (sOrder[a.severity] ?? 4) - (sOrder[b.severity] ?? 4));
}

// ── 9. Dashboard flotte complet ──────────────────────────────────────────────

async function getFleetDashboardStats(period = "month") {
  const { start, end }  = periodToRange(period);
  const periodDays       = Math.max(1, Math.round((end - start) / 86_400_000));

  const [
    total, available, inMission, inMaintenance, outOfService,
    transportAgg,
    upcomingMaintenances,
    alerts,
    vehicleList,
  ] = await Promise.all([
    Vehicle.countDocuments({ deletedAt: null }),
    Vehicle.countDocuments({ deletedAt: null, statut: "Disponible" }),
    Vehicle.countDocuments({ deletedAt: null, statut: "En service" }),
    Vehicle.countDocuments({ deletedAt: null, statut: "Maintenance" }),
    Vehicle.countDocuments({ deletedAt: null, statut: "Hors service" }),
    Transport.aggregate([
      {
        $match: {
          dateTransport: { $gte: start, $lte: end },
          vehicule:      { $ne: null },
        },
      },
      {
        $group: {
          _id:                null,
          totalKm:            { $sum: { $ifNull: ["$distanceKm", 0] } },
          totalMissions:      { $sum: 1 },
          completedMissions:  { $sum: { $cond: [{ $in: ["$statut", STATUTS_COMPLETES] }, 1, 0] } },
          cancelledMissions:  { $sum: { $cond: [{ $in: ["$statut", STATUTS_ANNULES] }, 1, 0] } },
          uniqueVehicles:     { $addToSet: "$vehicule" },
        },
      },
    ]),
    getUpcomingMaintenances(30),
    detectMaintenanceAlerts(),
    Vehicle.find({ deletedAt: null })
      .select("_id nom immatriculation type statut carburant kilometrage maintenanceInfo transportEnCours")
      .lean(),
  ]);

  const tStats          = transportAgg[0] || {};
  const completedCount  = tStats.completedMissions || 0;
  const totalKm         = tStats.totalKm           || 0;
  const averageUtil     = total > 0
    ? Math.min(100, Math.round((completedCount / (total * periodDays * cfg.maxMissionsPerDay)) * 100))
    : 0;

  // Missions par véhicule (pour le tableau)
  const missionsByVehicle = await Transport.aggregate([
    {
      $match: {
        dateTransport: { $gte: start, $lte: end },
        vehicule:      { $ne: null },
      },
    },
    {
      $group: {
        _id:               "$vehicule",
        missions:          { $sum: 1 },
        completedMissions: { $sum: { $cond: [{ $in: ["$statut", STATUTS_COMPLETES] }, 1, 0] } },
        monthlyKm:         { $sum: { $ifNull: ["$distanceKm", 0] } },
      },
    },
  ]);

  const missionMap = {};
  for (const m of missionsByVehicle) missionMap[String(m._id)] = m;

  // Alertes par véhicule
  const alertsByVehicle = {};
  for (const a of alerts) {
    const k = String(a.vehicleId);
    if (!alertsByVehicle[k]) alertsByVehicle[k] = [];
    alertsByVehicle[k].push(a);
  }

  const vehicleSummaries = vehicleList.map((v) => {
    const vid   = String(v._id);
    const m     = missionMap[vid]    || { missions: 0, completedMissions: 0, monthlyKm: 0 };
    const vAlerts = alertsByVehicle[vid] || [];

    const utilRate      = Math.min(100, Math.round((m.completedMissions / (periodDays * cfg.maxMissionsPerDay)) * 100));
    const topAlert      = vAlerts[0];
    const maintPriority = topAlert?.severity || v.maintenanceInfo?.maintenanceStatus || "ok";

    return {
      vehicleId:          v._id,
      nom:                v.nom,
      immatriculation:    v.immatriculation,
      type:               v.type,
      statut:             v.statut,
      carburant:          v.carburant,
      kmActuel:           v.kilometrage?.actuel || 0,
      monthlyMissions:    m.missions,
      completedMissions:  m.completedMissions,
      monthlyKm:          Math.round((m.monthlyKm || 0) * 10) / 10,
      utilizationRate:    utilRate,
      maintenancePriority: maintPriority,
      alertCount:         vAlerts.length,
      topAlertMessage:    topAlert?.message || null,
      prochaineMaintenance:
        v.maintenanceInfo?.nextMaintenanceDate ||
        v.kilometrage?.prochainVidange
          ? `${(v.kilometrage?.prochainVidange || 0) - (v.kilometrage?.actuel || 0)} km`
          : null,
      transportEnCours:   v.transportEnCours,
    };
  });

  return {
    period,
    dateRange:       { start, end },
    vehicles:        { total, available, inMission, inMaintenance, outOfService },
    missions:        {
      total:     tStats.totalMissions    || 0,
      completed: tStats.completedMissions || 0,
      cancelled: tStats.cancelledMissions || 0,
      totalKm:   Math.round(totalKm * 10) / 10,
    },
    financial:       { estimatedTotalCost: Math.round(totalKm * cfg.costPerKm * 100) / 100 },
    performance:     { averageUtilizationRate: averageUtil },
    upcomingMaintenances: upcomingMaintenances.slice(0, 10),
    maintenanceAlerts:    alerts.slice(0, 10),
    vehicleSummaries,
  };
}

// ── 10. Recalculer et persister les métriques d'un véhicule ─────────────────

async function recalculateVehicleMetrics(vehicleId) {
  const now        = new Date();
  const monthStart = new Date(now.getTime() - 30 * 86_400_000);

  const [allTime, monthly] = await Promise.all([
    Transport.aggregate([
      { $match: { vehicule: toOid(vehicleId) } },
      {
        $group: {
          _id:               null,
          totalMissions:     { $sum: 1 },
          completedMissions: { $sum: { $cond: [{ $in: ["$statut", STATUTS_COMPLETES] }, 1, 0] } },
          cancelledMissions: { $sum: { $cond: [{ $in: ["$statut", STATUTS_ANNULES] }, 1, 0] } },
          totalKm:           { $sum: { $ifNull: ["$distanceKm", 0] } },
        },
      },
    ]),
    Transport.aggregate([
      {
        $match: {
          vehicule:      toOid(vehicleId),
          dateTransport: { $gte: monthStart },
          statut:        { $in: STATUTS_COMPLETES },
        },
      },
      { $group: { _id: null, km: { $sum: { $ifNull: ["$distanceKm", 0] } } } },
    ]),
  ]);

  const at       = allTime[0] || { totalMissions: 0, completedMissions: 0, cancelledMissions: 0, totalKm: 0 };
  const monthlyKm = Math.round((monthly[0]?.km || 0) * 10) / 10;
  const totalKm   = Math.round((at.totalKm || 0) * 10) / 10;

  const update = {
    "vehicleMetrics.totalKm":            totalKm,
    "vehicleMetrics.monthlyKm":          monthlyKm,
    "vehicleMetrics.totalMissions":      at.totalMissions,
    "vehicleMetrics.completedMissions":  at.completedMissions,
    "vehicleMetrics.cancelledMissions":  at.cancelledMissions,
    "vehicleMetrics.estimatedCost":      Math.round(totalKm * cfg.costPerKm * 100) / 100,
    "vehicleMetrics.lastMetricUpdate":   now,
  };

  await Vehicle.findByIdAndUpdate(vehicleId, { $set: update });
  return update;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getFleetDashboardStats,
  getVehicleUtilizationRate,
  getVehicleKilometers,
  getVehicleEstimatedCost,
  getUpcomingMaintenances,
  getVehicleAvailabilitySlots,
  getFleetAvailabilityByTimeSlot,
  getVehicleMissionHistory,
  detectMaintenanceAlerts,
  recalculateVehicleMetrics,
};
