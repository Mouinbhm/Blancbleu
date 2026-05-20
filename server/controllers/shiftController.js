const DriverShift = require("../models/DriverShift");
const Vehicle     = require("../models/Vehicle");
const Personnel   = require("../models/Personnel");
const Transport   = require("../models/Transport");

// POST /api/v1/shifts/start
const startShift = async (req, res) => {
  try {
    const { vehicleId, checklist, notes } = req.body;
    if (!vehicleId) return res.status(400).json({ message: "vehicleId requis" });

    // 1. No active shift already
    const existing = await DriverShift.findOne({ personnelId: req.personnel._id, status: "ACTIVE" });
    if (existing) return res.status(409).json({ message: "Vous avez déjà un shift actif", shiftId: existing._id });

    // 2. Vehicle must be available
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ message: "Véhicule introuvable" });
    if (vehicle.statut !== "Disponible") return res.status(400).json({ message: `Véhicule non disponible (statut : ${vehicle.statut})` });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. Create shift
    const shift = await DriverShift.create({
      personnelId:    req.personnel._id,
      vehicleId,
      date:           today,
      startTime:      new Date(),
      status:         "ACTIVE",
      startChecklist: checklist || {},
      ...(notes ? { incidents: [{ time: new Date(), description: `Note démarrage : ${notes}` }] } : {}),
    });

    // 4. Update vehicle status
    await Vehicle.findByIdAndUpdate(vehicleId, {
      statut:             "En service",
      currentShiftId:     shift._id,
      currentPersonnelId: req.personnel._id,
    });

    // 5. Update personnel status
    await Personnel.findByIdAndUpdate(req.personnel._id, {
      statut:         "En shift",
      currentShiftId: shift._id,
    });

    // 6. Emit WebSocket
    const io = req.app.get("io");
    if (io) {
      io.to("role:dispatcher").to("role:admin").emit("shift:started", {
        shiftId:   shift._id,
        personnel: { id: req.personnel._id, firstName: req.personnel.prenom, lastName: req.personnel.nom },
        vehicle:   { id: vehicleId, plateNumber: vehicle.immatriculation, type: vehicle.type },
        startTime: shift.startTime,
      });
    }

    const populated = await DriverShift.findById(shift._id)
      .populate("vehicleId", "immatriculation type statut marque modele");
    return res.status(201).json({ message: "Shift démarré", shift: populated });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/v1/shifts/end
const endShift = async (req, res) => {
  try {
    const { totalKm = 0, notes = "" } = req.body;

    const shift = await DriverShift.findOne({ personnelId: req.personnel._id, status: "ACTIVE" });
    if (!shift) return res.status(404).json({ message: "Aucun shift actif" });

    // Compute stats from transports
    const transports = await Transport.find({ shiftId: shift._id });
    const completed  = transports.filter((t) => ["COMPLETED", "BILLED"].includes(t.statut)).length;

    shift.status             = "COMPLETED";
    shift.endTime            = new Date();
    shift.totalKm            = totalKm;
    shift.totalTransports    = transports.length;
    shift.completedTransports = completed;
    if (notes) shift.incidents.push({ time: new Date(), description: `Note fin de shift : ${notes}` });
    await shift.save();

    // Restore vehicle
    await Vehicle.findByIdAndUpdate(shift.vehicleId, {
      statut:             "Disponible",
      currentShiftId:     null,
      currentPersonnelId: null,
    });

    // Restore personnel
    await Personnel.findByIdAndUpdate(req.personnel._id, {
      statut:         "Disponible",
      currentShiftId: null,
    });

    const io = req.app.get("io");
    if (io) {
      io.to("role:dispatcher").to("role:admin").emit("shift:ended", {
        shiftId:              shift._id,
        personnelId:          req.personnel._id,
        vehicleId:            shift.vehicleId,
        totalKm,
        totalTransports:      shift.totalTransports,
        completedTransports:  shift.completedTransports,
        endTime:              shift.endTime,
      });
    }

    return res.json({ message: "Shift terminé", shift });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/v1/shifts/active  (driver — own active shift)
const getActiveShift = async (req, res) => {
  try {
    const shift = await DriverShift.findOne({ personnelId: req.personnel._id, status: "ACTIVE" })
      .populate("vehicleId", "immatriculation type statut marque modele");
    if (!shift) return res.json({ shift: null });
    const transportCount = await Transport.countDocuments({ shiftId: shift._id });
    const shiftObj = shift.toObject();
    shiftObj.transportCount = transportCount;
    return res.json({ shift: shiftObj });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/v1/shifts/incident
const addIncident = async (req, res) => {
  try {
    const { description, transportId } = req.body;
    if (!description) return res.status(400).json({ message: "description requise" });

    const shift = await DriverShift.findOne({ personnelId: req.personnel._id, status: "ACTIVE" });
    if (!shift) return res.status(404).json({ message: "Aucun shift actif" });

    shift.incidents.push({ time: new Date(), description, transportId: transportId || null });
    await shift.save();
    return res.json({ message: "Incident enregistré" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/v1/shifts/today  (dispatcher view — all active shifts)
const getTodayShifts = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const shifts = await DriverShift.find({
      status: "ACTIVE",
      date: { $gte: today, $lt: tomorrow },
    })
      .populate("personnelId", "nom prenom statut")
      .populate("vehicleId",  "immatriculation type statut marque modele")
      .sort({ startTime: 1 });

    const result = await Promise.all(
      shifts.map(async (s) => {
        const transportCount = await Transport.countDocuments({ shiftId: s._id });
        return { ...s.toObject(), transportCount };
      })
    );

    return res.json({ shifts: result });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/v1/shifts?date=YYYY-MM-DD&status=ACTIVE&page=1&limit=20
const listShifts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const filter = {};

    if (req.query.status && req.query.status !== "ALL") {
      filter.status = req.query.status;
    }

    if (req.query.date) {
      const from = new Date(req.query.date);
      const to   = new Date(req.query.date);
      to.setDate(to.getDate() + 1);
      filter.startTime = { $gte: from, $lt: to };
    }

    const [shifts, total] = await Promise.all([
      DriverShift.find(filter)
        .populate("personnelId", "nom prenom")
        .populate("vehicleId",  "immatriculation type")
        .sort({ startTime: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      DriverShift.countDocuments(filter),
    ]);

    return res.json({ shifts, total, page, limit });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/v1/shifts/:id/force-end  (admin / dispatcher)
const forceEndShift = async (req, res) => {
  try {
    const shift = await DriverShift.findById(req.params.id);
    if (!shift) return res.status(404).json({ message: "Shift introuvable" });
    if (shift.status !== "ACTIVE") return res.status(400).json({ message: "Ce shift n'est pas actif" });

    const { notes = "" } = req.body;

    const transports = await Transport.find({ shiftId: shift._id });
    const completed  = transports.filter((t) => ["COMPLETED", "BILLED"].includes(t.statut)).length;

    shift.status              = "ABANDONED";
    shift.endTime             = new Date();
    shift.totalTransports     = transports.length;
    shift.completedTransports = completed;
    if (notes) shift.incidents.push({ time: new Date(), description: `Clôture forcée par admin : ${notes}` });
    else shift.incidents.push({ time: new Date(), description: "Clôture forcée par administrateur" });
    await shift.save();

    await Vehicle.findByIdAndUpdate(shift.vehicleId, {
      statut:             "Disponible",
      currentShiftId:     null,
      currentPersonnelId: null,
    });

    await Personnel.findByIdAndUpdate(shift.personnelId, {
      statut:         "Disponible",
      currentShiftId: null,
    });

    const io = req.app.get("io");
    if (io) {
      io.to("role:dispatcher").to("role:admin").emit("shift:ended", {
        shiftId:     shift._id,
        personnelId: shift.personnelId,
        vehicleId:   shift.vehicleId,
        forced:      true,
        endTime:     shift.endTime,
      });
    }

    return res.json({ message: "Shift clôturé de force", shift });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { startShift, endShift, getActiveShift, addIncident, getTodayShifts, listShifts, forceEndShift };
