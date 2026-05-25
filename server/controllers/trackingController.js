const TrackingPoint = require("../models/TrackingPoint");
const DriverShift   = require("../models/DriverShift");
const Transport     = require("../models/Transport");
const Vehicle       = require("../models/Vehicle");
const EVENTS        = require("../sockets/events");
const vehiclePositionStore = require("../sockets/vehiclePositionStore");

// POST /api/v1/tracking/batch
// Body: { points: [{ lat, lng, speed, timestamp, accuracy, transportId? }] }
const batchInsert = async (req, res) => {
  try {
    const { points } = req.body;
    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ message: "points[] requis et non vide" });
    }

    const shift = await DriverShift.findOne({ personnelId: req.personnel._id, status: "ACTIVE" });
    if (!shift) {
      return res.status(409).json({ message: "Aucun shift actif — impossible d'enregistrer la position" });
    }

    // Verify driver is assigned to any declared transportId
    const declaredTransportIds = [...new Set(points.map((p) => p.transportId).filter(Boolean))];
    for (const tId of declaredTransportIds) {
      const t = await Transport.findOne({ _id: tId, chauffeur: req.personnel._id }).select("_id").lean();
      if (!t) {
        return res.status(403).json({ message: `Transport ${tId} non assigné à ce chauffeur` });
      }
    }

    const docs = points.map((p) => ({
      driverId:    req.personnel._id,
      shiftId:     shift._id,
      transportId: p.transportId || null,
      lat:         p.lat,
      lng:         p.lng,
      speed:       p.speed || 0,
      accuracy:    p.accuracy || null,
      timestamp:   p.timestamp ? new Date(p.timestamp) : new Date(),
    }));

    await TrackingPoint.insertMany(docs, { ordered: false });

    const last = docs[docs.length - 1];
    const io = req.app.get("io");
    if (io) {
      const vehicle = await Vehicle.findById(shift.vehicleId).select("immatriculation type").lean();
      const payload = {
        driverId:     req.personnel._id,
        driverNom:    `${req.personnel.prenom} ${req.personnel.nom}`,
        vehicleId:    shift.vehicleId,
        vehiclePlate: vehicle?.immatriculation ?? null,
        vehicleType:  vehicle?.type ?? null,
        shiftId:      shift._id,
        lat:          last.lat,
        lng:          last.lng,
        speed:        last.speed,
        updatedAt:    last.timestamp,
      };

      // Sprint M2 — event canonique VEHICLE_POSITION pour les staff.
      io.to("role:dispatcher").to("role:admin").to("role:superviseur")
        .emit(EVENTS.VEHICLE_POSITION, payload);

      // Snapshot Redis pour les staff fraichement connectes (M2).
      if (shift.vehicleId) {
        vehiclePositionStore.set(shift.vehicleId, payload).catch(() => {});
      }

      // Sprint M2 — event canonique TRANSPORT_GPS pour le suivi patient.
      for (const tId of declaredTransportIds) {
        io.to(`transport:${tId}`).emit(EVENTS.TRANSPORT_GPS, { ...payload, transportId: tId });
      }
    }

    return res.json({ inserted: docs.length });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/v1/tracking/live
const getLive = async (req, res) => {
  try {
    const activeShifts = await DriverShift.find({ status: "ACTIVE" })
      .populate("personnelId", "nom prenom")
      .populate("vehicleId",   "immatriculation type");

    const result = await Promise.all(
      activeShifts.map(async (s) => {
        const last = await TrackingPoint.findOne({ shiftId: s._id })
          .sort({ timestamp: -1 })
          .select("lat lng speed timestamp");
        return {
          driverId:     s.personnelId?._id,
          driverNom:    s.personnelId ? `${s.personnelId.prenom} ${s.personnelId.nom}` : "—",
          vehicleId:    s.vehicleId?._id,
          vehiclePlate: s.vehicleId?.immatriculation,
          vehicleType:  s.vehicleId?.type,
          shiftId:      s._id,
          lat:          last?.lat   ?? null,
          lng:          last?.lng   ?? null,
          speed:        last?.speed ?? null,
          updatedAt:    last?.timestamp ?? null,
        };
      }),
    );

    return res.json({ drivers: result });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/v1/tracking/history/:driverId?date=YYYY-MM-DD
const getHistory = async (req, res) => {
  try {
    const { driverId } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split("T")[0];
    const from = new Date(dateStr);
    const to   = new Date(dateStr);
    to.setDate(to.getDate() + 1);

    const points = await TrackingPoint.find({
      driverId,
      timestamp: { $gte: from, $lt: to },
    }).sort({ timestamp: 1 });

    return res.json({ driverId, date: dateStr, points });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { batchInsert, getLive, getHistory };
