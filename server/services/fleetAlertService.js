/**
 * BlancBleu — Service alertes flotte
 *
 * Génère et diffuse les alertes liées aux véhicules :
 * maintenance due, véhicule bloqué, hors service, utilisation anormale.
 * Utilise Socket.IO si disponible. Persiste dans le modèle Notification.
 */
const logger       = require("../utils/logger");
const cfg          = require("../config/fleetConfig");

// ── Helper Socket ─────────────────────────────────────────────────────────────

function getIO() {
  try {
    return require("./socketService").getIO?.();
  } catch {
    return null;
  }
}

function emitFleetAlert(type, payload) {
  const io = getIO();
  if (io) {
    io.to("role:admin").to("role:dispatcher").emit("fleet:alert", { type, ...payload, timestamp: new Date() });
  }
}

// ── Helper persistance notification ──────────────────────────────────────────

async function persistNotification(vehicleId, type, title, message) {
  try {
    const Notification = require("../models/Notification");
    await Notification.create({
      recipientRole: "admin",
      type,
      title,
      message,
      metadata: { vehicleId },
    });
  } catch (err) {
    logger.warn("fleetAlertService: impossible de persister la notification", { err: err.message });
  }
}

// ── Fonctions d'alerte ────────────────────────────────────────────────────────

async function notifyMaintenanceDue(vehicle, details = {}) {
  const msg = `${vehicle.nom} (${vehicle.immatriculation}) — maintenance imminente`;
  logger.warn("Alerte maintenance", { vehicleId: vehicle._id, ...details });
  emitFleetAlert("MAINTENANCE_DUE", { vehicleId: vehicle._id, vehicleName: vehicle.nom, ...details });
  await persistNotification(vehicle._id, "MAINTENANCE_DUE", "Maintenance imminente", msg);
}

async function notifyMaintenanceOverdue(vehicle, details = {}) {
  const msg = `${vehicle.nom} (${vehicle.immatriculation}) — maintenance en retard`;
  logger.warn("Alerte maintenance en retard", { vehicleId: vehicle._id, ...details });
  emitFleetAlert("MAINTENANCE_OVERDUE", { vehicleId: vehicle._id, vehicleName: vehicle.nom, ...details });
  await persistNotification(vehicle._id, "MAINTENANCE_OVERDUE", "Maintenance en retard", msg);
}

async function notifyVehicleBlocked(vehicle, reason = "") {
  const msg = `${vehicle.nom} (${vehicle.immatriculation}) bloqué — ${reason}`;
  logger.warn("Alerte véhicule bloqué", { vehicleId: vehicle._id, reason });
  emitFleetAlert("VEHICLE_BLOCKED", { vehicleId: vehicle._id, vehicleName: vehicle.nom, reason });
  await persistNotification(vehicle._id, "VEHICLE_BLOCKED", "Véhicule bloqué", msg);
}

async function notifyVehicleOutOfService(vehicle, reason = "") {
  const msg = `${vehicle.nom} (${vehicle.immatriculation}) hors service — ${reason}`;
  logger.info("Alerte véhicule hors service", { vehicleId: vehicle._id, reason });
  emitFleetAlert("VEHICLE_OUT_OF_SERVICE", { vehicleId: vehicle._id, vehicleName: vehicle.nom, reason });
  await persistNotification(vehicle._id, "VEHICLE_OUT_OF_SERVICE", "Véhicule hors service", msg);
}

async function notifyHighUtilization(vehicle, rate) {
  const msg = `${vehicle.nom} (${vehicle.immatriculation}) — taux d'utilisation élevé : ${rate} %`;
  logger.info("Alerte utilisation élevée", { vehicleId: vehicle._id, rate });
  emitFleetAlert("HIGH_UTILIZATION", { vehicleId: vehicle._id, vehicleName: vehicle.nom, utilizationRate: rate });
  await persistNotification(vehicle._id, "HIGH_UTILIZATION", "Utilisation élevée", msg);
}

async function notifyLowUtilization(vehicle, rate) {
  const msg = `${vehicle.nom} (${vehicle.immatriculation}) — sous-utilisation : ${rate} %`;
  logger.info("Alerte sous-utilisation", { vehicleId: vehicle._id, rate });
  emitFleetAlert("LOW_UTILIZATION", { vehicleId: vehicle._id, vehicleName: vehicle.nom, utilizationRate: rate });
  await persistNotification(vehicle._id, "LOW_UTILIZATION", "Sous-utilisation", msg);
}

/**
 * Analyse la flotte et déclenche les alertes nécessaires.
 * À appeler périodiquement (ex : une fois par jour).
 */
async function runFleetAlertScan() {
  const Vehicle   = require("../models/Vehicle");
  const analytics = require("./fleetAnalyticsService");

  const vehicles = await Vehicle.find({ deletedAt: null }).lean();
  const alerts   = await analytics.detectMaintenanceAlerts();

  // Grouper les alertes par véhicule + sévérité
  const alertMap = {};
  for (const a of alerts) {
    const k = String(a.vehicleId);
    if (!alertMap[k]) alertMap[k] = [];
    alertMap[k].push(a);
  }

  for (const v of vehicles) {
    const vid      = String(v._id);
    const vAlerts  = alertMap[vid] || [];

    // Maintenance urgente ou en retard
    const overdueAlert = vAlerts.find((a) => a.severity === "overdue");
    const urgentAlert  = vAlerts.find((a) => a.severity === "urgent");
    if (overdueAlert) await notifyMaintenanceOverdue(v, overdueAlert);
    else if (urgentAlert) await notifyMaintenanceDue(v, urgentAlert);

    // Véhicule hors service
    if (v.statut === "Hors service") {
      await notifyVehicleOutOfService(v, "Statut Hors service");
    }

    // Utilisation
    const rate = await analytics.getVehicleUtilizationRate(v._id, "month").catch(() => null);
    if (rate !== null) {
      if (rate > cfg.alertThresholds.highUtilizationPct) await notifyHighUtilization(v, rate);
      else if (rate < cfg.alertThresholds.lowUtilizationPct) await notifyLowUtilization(v, rate);
    }
  }

  logger.info("Scan alertes flotte terminé", { vehiclesAnalysed: vehicles.length });
}

module.exports = {
  notifyMaintenanceDue,
  notifyMaintenanceOverdue,
  notifyVehicleBlocked,
  notifyVehicleOutOfService,
  notifyHighUtilization,
  notifyLowUtilization,
  runFleetAlertScan,
};
