const Transport   = require("../models/Transport");
const DriverShift = require("../models/DriverShift");
const User        = require("../models/User");
const multer      = require("multer");
const path       = require("path");
const fs         = require("fs");

// ════════════════════════════════════════════════════════════════════════════
// GET /api/v1/driver/tournee?date=YYYY-MM-DD
// ════════════════════════════════════════════════════════════════════════════
const getTournee = async (req, res) => {
  try {
    const personnel = req.personnel;
    const dateStr   = req.query.date || new Date().toISOString().split("T")[0];

    // Find the active (or last completed today) shift for this driver
    const today = new Date(dateStr);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const shift = await DriverShift.findOne({
      personnelId: personnel._id,
      date: { $gte: today, $lt: tomorrow },
    }).sort({ startTime: -1 });

    if (!shift) return res.json({ date: dateStr, transports: [], shift: null });

    const SELECT_FIELDS = [
      "numero", "statut", "typeTransport", "motif",
      "dateTransport", "heureRDV", "heureDepart",
      "patient", "adresseDepart", "adresseDestination",
      "notes", "statusHistory",
      "driverSignedAt", "pmtPhotoUrl",
      "actualPickupTime", "actualDropoffTime", "estimatedArrival",
      "prescription",
    ].join(" ");

    let transports = await Transport.find({ shiftId: shift._id, deletedAt: null })
      .select(SELECT_FIELDS)
      .populate("vehicule", "immatriculation type")
      .sort({ heureRDV: 1 });

    // Fallback: if no transports found by shiftId, search by vehicle and auto-link
    if (transports.length === 0 && shift.vehicleId) {
      const legacy = await Transport.find({
        vehicule:  shift.vehicleId,
        shiftId:   null,
        deletedAt: null,
        statut:    { $nin: ["CANCELLED", "COMPLETED", "BILLED", "NO_SHOW"] },
      })
        .select(SELECT_FIELDS)
        .populate("vehicule", "immatriculation type")
        .sort({ heureRDV: 1 });

      if (legacy.length > 0) {
        await Transport.updateMany(
          { vehicule: shift.vehicleId, shiftId: null, deletedAt: null },
          { $set: { shiftId: shift._id, chauffeur: shift.personnelId } }
        );
        transports = legacy;
      }
    }

    const shiftObj = shift.toObject ? shift.toObject() : shift;
    shiftObj.transportCount = transports.length;
    return res.json({ date: dateStr, transports, shift: shiftObj });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/status
// ════════════════════════════════════════════════════════════════════════════
const VALID_TRANSITIONS = {
  ASSIGNED:               ["EN_ROUTE_TO_PICKUP"],
  EN_ROUTE_TO_PICKUP:     ["ARRIVED_AT_PICKUP"],
  ARRIVED_AT_PICKUP:      ["PATIENT_ON_BOARD", "NO_SHOW"],
  PATIENT_ON_BOARD:       ["ARRIVED_AT_DESTINATION"],
  ARRIVED_AT_DESTINATION: ["COMPLETED"],
};

const updateStatus = async (req, res) => {
  try {
    const { status, note = "", timestamp } = req.body;
    if (!status) return res.status(400).json({ message: "status requis" });

    const personnel = req.personnel;

    const transport = await Transport.findOne({
      _id:      req.params.id,
      chauffeur: personnel._id,
    });
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    const allowed = VALID_TRANSITIONS[transport.statut] || [];
    if (!allowed.includes(status)) {
      return res.status(422).json({
        message: `Transition invalide : ${transport.statut} → ${status}`,
        allowed,
      });
    }

    const ts = timestamp ? new Date(timestamp) : new Date();
    const update = { statut: status };
    if (status === "EN_ROUTE_TO_PICKUP")      update.heureEnRoute = ts;
    if (status === "ARRIVED_AT_PICKUP")       update.heurePriseEnCharge = ts;
    if (status === "PATIENT_ON_BOARD")        update.actualPickupTime = ts;
    if (status === "ARRIVED_AT_DESTINATION")  update.heureArriveeDestination = ts;
    if (status === "COMPLETED")               update.heureTerminee = ts;

    update.$push = {
      statusHistory: { status, timestamp: ts, driverId: personnel._id, note },
    };

    const updated = await Transport.findByIdAndUpdate(req.params.id, update, { new: true });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        transportId: transport._id,
        numero:      transport.numero,
        status,
        driverId:    personnel._id,
        driverNom:   `${personnel.prenom} ${personnel.nom}`,
        timestamp:   ts,
      };
      io.to("role:dispatcher").to("role:admin").to("role:superviseur").emit("transport:status_updated", payload);

      // Notify patient in real time via WebSocket
      if (transport.patient?.email) {
        const patientUser = await User.findOne({ email: transport.patient.email, role: "patient" }).select("_id").lean();
        if (patientUser) {
          io.to(`patient:${patientUser._id}`).emit("transport:status_updated", payload);
        }
      }
    }

    // Push notification to patient (no-op if FCM not configured)
    if (transport.patient?.email) {
      const STATUS_LABELS = {
        EN_ROUTE_TO_PICKUP:     "Votre chauffeur est en route",
        ARRIVED_AT_PICKUP:      "Votre chauffeur est arrivé",
        PATIENT_ON_BOARD:       "Transport en cours",
        ARRIVED_AT_DESTINATION: "Vous êtes arrivé à destination",
        COMPLETED:              "Transport terminé",
      };
      const label = STATUS_LABELS[status];
      if (label) {
        notifyPatientByEmail({
          email: transport.patient.email,
          title: "BlancBleu Transport",
          body:  label,
          data:  { transportId: String(transport._id), status },
        }).catch(() => {});
      }
    }

    return res.json({ message: "Statut mis à jour", statut: updated.statut });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/v1/driver/transports/:id/signature
// ════════════════════════════════════════════════════════════════════════════
const saveSignature = async (req, res) => {
  try {
    const { patientSignatureBase64, driverSignatureBase64 } = req.body;
    if (!patientSignatureBase64 && !driverSignatureBase64)
      return res.status(400).json({ message: "Au moins une signature requise" });

    const transport = await Transport.findOne({
      _id:      req.params.id,
      chauffeur: req.personnel._id,
    });
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    const upd = { driverSignedAt: new Date() };
    if (patientSignatureBase64) upd.patientSignatureBase64 = patientSignatureBase64;
    if (driverSignatureBase64)  upd.driverSignatureBase64  = driverSignatureBase64;

    await Transport.findByIdAndUpdate(req.params.id, upd);
    return res.json({ message: "Signatures enregistrées" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/v1/driver/transports/:id/pmt-photo
// ════════════════════════════════════════════════════════════════════════════
const uploadDir = path.join(__dirname, "../uploads/pmt");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) =>
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const uploadPmtPhoto = [
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Fichier photo requis (champ 'photo')" });

      const transport = await Transport.findOne({
        _id:      req.params.id,
        chauffeur: req.personnel._id,
      });
      if (!transport) return res.status(404).json({ message: "Transport introuvable" });

      const url = `/uploads/pmt/${req.file.filename}`;
      await Transport.findByIdAndUpdate(req.params.id, { pmtPhotoUrl: url });
      return res.json({ message: "Photo PMT enregistrée", url });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  },
];

// ════════════════════════════════════════════════════════════════════════════
// POST /api/v1/driver/sos
// ════════════════════════════════════════════════════════════════════════════
const sosSend = async (req, res) => {
  try {
    const { lat, lng, shiftId, transportId } = req.body;
    const personnel = req.personnel;

    const alert = {
      personnelId:  personnel._id,
      prenom:       personnel.prenom,
      nom:          personnel.nom,
      shiftId:      shiftId || null,
      transportId:  transportId || null,
      lat:          lat || null,
      lng:          lng || null,
      timestamp:    new Date(),
    };

    const io = req.app.get("io");
    if (io) {
      io.to("role:dispatcher").to("role:admin").emit("sos:received", alert);
    }

    return res.status(201).json({ message: "Alerte SOS envoyée", alert });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /api/v1/driver/vehicles  — véhicules disponibles pour démarrer un shift
// ════════════════════════════════════════════════════════════════════════════
const { notifyPatientByEmail } = require("../services/pushNotification");
const Vehicle = require("../models/Vehicle");

const getAvailableVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      statut:    "Disponible",
      deletedAt: null,
    }).select("nom immatriculation type marque modele carburant");
    return res.json({ vehicles });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { getTournee, updateStatus, saveSignature, uploadPmtPhoto, sosSend, getAvailableVehicles };
