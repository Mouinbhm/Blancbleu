/**
 * BlancBleu — Contrôleur Chauffeur
 * Toutes les transitions d'état passent par transportLifecycle pour garantir
 * la cohérence : audit log, libération véhicule, Socket.IO, notifications.
 */
const Transport   = require("../models/Transport");
const DriverShift = require("../models/DriverShift");
const Vehicle     = require("../models/Vehicle");
const User        = require("../models/User");
const multer      = require("multer");
const path        = require("path");
const fs          = require("fs");

const lifecycle   = require("../services/transportLifecycle");
const { notifyPatientByEmail } = require("../services/pushNotification");
const EVENTS = require("../sockets/events");

// ── Helper : vérifier que le transport appartient bien au chauffeur ───────────
async function _myTransport(transportId, personnelId) {
  const t = await Transport.findOne({ _id: transportId, chauffeur: personnelId });
  if (!t) throw Object.assign(new Error("Transport introuvable ou non assigné à ce chauffeur"), { status: 404 });
  return t;
}

// ── Helper : construire un pseudo-utilisateur depuis req.personnel ────────────
function _asUser(personnel) {
  return {
    _id:   personnel._id,
    email: personnel.email || `${personnel.prenom}.${personnel.nom}@driver`,
    role:  personnel.role  || "Chauffeur",
  };
}

// ── Helper : émettre une notification patient via Socket.IO ───────────────────
async function _notifyPatient(io, transport, payload) {
  if (!io || !transport.patient?.email) return;
  const patientUser = await User
    .findOne({ email: transport.patient.email, role: "patient" })
    .select("_id")
    .lean();
  if (patientUser) {
    io.to(`patient:${patientUser._id}`).emit(EVENTS.TRANSPORT_STATUS, payload);
  }
}

// ── Wrapper générique pour les actions de transition ─────────────────────────
async function _handleTransition(req, res, lifeCycleFn, extraArgs = []) {
  try {
    const utilisateur = _asUser(req.personnel);
    // Verify ownership before calling lifecycle (gives a 404 instead of 422 for wrong driver)
    await _myTransport(req.params.id, req.personnel._id);
    const { transport } = await lifeCycleFn(req.params.id, ...extraArgs, utilisateur);

    const io = req.app.get("io");
    if (io) {
      const payload = {
        transportId: transport._id,
        numero:      transport.numero,
        newStatus:   transport.statut,
        status:      transport.statut, // alias rétrocompat
        driverId:    req.personnel._id,
        driverNom:   `${req.personnel.prenom} ${req.personnel.nom}`,
        timestamp:   new Date(),
      };
      io.to("role:dispatcher").to("role:admin").to("role:superviseur")
        .to(`transport:${transport._id}`)
        .emit(EVENTS.TRANSPORT_STATUS, payload);
      await _notifyPatient(io, transport, payload);
    }

    return res.json({ message: "Statut mis à jour", statut: transport.statut, transport });
  } catch (err) {
    const status = err.status || (err.message.includes("introuvable") ? 404 : 422);
    return res.status(status).json({ message: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/v1/driver/tournee?date=YYYY-MM-DD
// ════════════════════════════════════════════════════════════════════════════
const getTournee = async (req, res) => {
  try {
    const personnel = req.personnel;
    const dateStr   = req.query.date || new Date().toISOString().split("T")[0];

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
      "notes", "statusLog",
      "driverSignedAt", "pmtPhotoUrl", "proofOfCare",
      "actualPickupTime", "actualDropoffTime", "estimatedArrival",
      "prescription",
    ].join(" ");

    let transports = await Transport.find({ shiftId: shift._id, deletedAt: null })
      .select(SELECT_FIELDS)
      .populate("vehicule", "immatriculation type")
      .sort({ heureRDV: 1 });

    // Fallback : si aucun transport lié au shift, chercher par véhicule
    if (transports.length === 0 && shift.vehicleId) {
      const legacy = await Transport.find({
        vehicule:  shift.vehicleId,
        shiftId:   null,
        deletedAt: null,
        statut:    { $nin: ["CANCELLED", "COMPLETED", "BILLED", "PAID", "NO_SHOW", "FAILED"] },
      })
        .select(SELECT_FIELDS)
        .populate("vehicule", "immatriculation type")
        .sort({ heureRDV: 1 });

      if (legacy.length > 0) {
        await Transport.updateMany(
          { vehicule: shift.vehicleId, shiftId: null, deletedAt: null },
          { $set: { shiftId: shift._id, chauffeur: shift.personnelId } },
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
// PATCH /api/v1/driver/transports/:id/accept — ASSIGNED → DRIVER_ACCEPTED
// ════════════════════════════════════════════════════════════════════════════
const acceptMission = (req, res) =>
  _handleTransition(req, res, lifecycle.accepterDriver);

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/reject — ASSIGNED → DRIVER_REJECTED
// ════════════════════════════════════════════════════════════════════════════
const rejectMission = async (req, res) => {
  const raison = req.body.raison || req.body.reason || "";
  return _handleTransition(req, res, lifecycle.refuserDriver, [raison]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/start — DRIVER_ACCEPTED → EN_ROUTE_TO_PICKUP
// ════════════════════════════════════════════════════════════════════════════
const startRoute = (req, res) =>
  _handleTransition(req, res, lifecycle.marquerEnRoute);

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/arrived-pickup — EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP
// ════════════════════════════════════════════════════════════════════════════
const arrivedPickup = async (req, res) => {
  const position = req.body.position || null;
  return _handleTransition(req, res, lifecycle.marquerArriveePatient, [position]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/patient-on-board — ARRIVED_AT_PICKUP → PATIENT_ON_BOARD
// ════════════════════════════════════════════════════════════════════════════
const patientOnBoard = (req, res) =>
  _handleTransition(req, res, lifecycle.marquerPatientABord);

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/arrived-destination — PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION
// ════════════════════════════════════════════════════════════════════════════
const arrivedDestination = async (req, res) => {
  const position = req.body.position || null;
  return _handleTransition(req, res, lifecycle.marquerArriveeDestination, [position]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/waiting — ARRIVED_AT_DESTINATION → WAITING_AT_DESTINATION
// ════════════════════════════════════════════════════════════════════════════
const startWaiting = async (req, res) => {
  const duree = req.body.dureeAttenteMinutes ? parseInt(req.body.dureeAttenteMinutes) : null;
  return _handleTransition(req, res, lifecycle.demarrerAttenteDestination, [duree]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/return-to-base — WAITING_AT_DESTINATION → RETURN_TO_BASE
// ════════════════════════════════════════════════════════════════════════════
const returnToBase = async (req, res) => {
  const position = req.body.position || null;
  return _handleTransition(req, res, lifecycle.demarrerRetourBase, [position]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/complete — → COMPLETED
// ════════════════════════════════════════════════════════════════════════════
const completeMission = (req, res) =>
  _handleTransition(req, res, lifecycle.completerTransport);

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/no-show — ARRIVED_AT_PICKUP → NO_SHOW
// ════════════════════════════════════════════════════════════════════════════
const noShow = async (req, res) => {
  const raison = req.body.raison || req.body.reason || "Patient absent à l'heure prévue";
  return _handleTransition(req, res, lifecycle.marquerNoShow, [raison]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/fail — → FAILED
// ════════════════════════════════════════════════════════════════════════════
const failMission = async (req, res) => {
  const raison = req.body.raison || req.body.reason || "Échec du transport";
  return _handleTransition(req, res, lifecycle.marquerFailed, [raison]);
};

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/driver/transports/:id/status — rétrocompat générique
// Accepte { status, note, timestamp } et route vers le bon handler lifecycle
// ════════════════════════════════════════════════════════════════════════════
const STATUS_TO_LIFECYCLE = {
  DRIVER_ACCEPTED:        (id, _body, user) => lifecycle.accepterDriver(id, user),
  DRIVER_REJECTED:        (id, body, user)  => lifecycle.refuserDriver(id, body.note || body.raison || "", user),
  EN_ROUTE_TO_PICKUP:     (id, _body, user) => lifecycle.marquerEnRoute(id, user),
  ARRIVED_AT_PICKUP:      (id, body, user)  => lifecycle.marquerArriveePatient(id, body.position || null, user),
  PATIENT_ON_BOARD:       (id, _body, user) => lifecycle.marquerPatientABord(id, user),
  ARRIVED_AT_DESTINATION: (id, body, user)  => lifecycle.marquerArriveeDestination(id, body.position || null, user),
  WAITING_AT_DESTINATION: (id, body, user)  => lifecycle.demarrerAttenteDestination(id, body.dureeAttenteMinutes ? parseInt(body.dureeAttenteMinutes) : null, user),
  RETURN_TO_BASE:         (id, body, user)  => lifecycle.demarrerRetourBase(id, body.position || null, user),
  COMPLETED:              (id, _body, user) => lifecycle.completerTransport(id, user),
  NO_SHOW:                (id, body, user)  => lifecycle.marquerNoShow(id, body.note || body.raison || "Patient absent", user),
  FAILED:                 (id, body, user)  => lifecycle.marquerFailed(id, body.note || body.raison || "Échec", user),
};

const updateStatus = async (req, res) => {
  try {
    const { status, note = "", position, raison, dureeAttenteMinutes, timestamp } = req.body;
    if (!status) return res.status(400).json({ message: "status requis" });

    const lifeCycleFn = STATUS_TO_LIFECYCLE[status];
    if (!lifeCycleFn) {
      return res.status(400).json({ message: `Statut inconnu : ${status}` });
    }

    // Verify ownership
    await _myTransport(req.params.id, req.personnel._id);

    const utilisateur = _asUser(req.personnel);
    const { transport } = await lifeCycleFn(
      req.params.id,
      { note, position, raison, dureeAttenteMinutes },
      utilisateur,
    );

    const io = req.app.get("io");
    if (io) {
      const payload = {
        transportId: transport._id,
        numero:      transport.numero,
        status:      transport.statut,
        driverId:    req.personnel._id,
        driverNom:   `${req.personnel.prenom} ${req.personnel.nom}`,
        timestamp:   timestamp ? new Date(timestamp) : new Date(),
      };
      io.to("role:dispatcher").to("role:admin").to("role:superviseur")
        .to(`transport:${transport._id}`)
        .emit(EVENTS.TRANSPORT_STATUS, payload);
      await _notifyPatient(io, transport, payload);
    }

    return res.json({ message: "Statut mis à jour", statut: transport.statut });
  } catch (err) {
    const status = err.status || (err.message.includes("introuvable") ? 404 : 422);
    return res.status(status).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/v1/driver/transports/:id/signature
// ════════════════════════════════════════════════════════════════════════════
const saveSignature = async (req, res) => {
  try {
    const { patientSignatureBase64, driverSignatureBase64, signedByName } = req.body;
    if (!patientSignatureBase64 && !driverSignatureBase64)
      return res.status(400).json({ message: "Au moins une signature requise" });

    await _myTransport(req.params.id, req.personnel._id);

    const utilisateur = _asUser(req.personnel);
    const { transport } = await lifecycle.addSignature(
      req.params.id,
      {
        signedByName:      signedByName || `${req.personnel.prenom} ${req.personnel.nom}`,
        signatureBase64:   patientSignatureBase64 || driverSignatureBase64,
        driverSignatureBase64,
      },
      utilisateur,
    );

    return res.json({ message: "Signatures enregistrées", transport });
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ message: err.message });
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

      await _myTransport(req.params.id, req.personnel._id);

      const url = `/uploads/pmt/${req.file.filename}`;
      const utilisateur = _asUser(req.personnel);
      const { transport } = await lifecycle.uploadPmtDocument(
        req.params.id,
        {
          fileUrl:    url,
          fileName:   req.file.originalname,
          uploadedBy: req.personnel._id,
          triggerOcr: false,
        },
        utilisateur,
      );
      return res.json({ message: "Photo PMT enregistrée", url, transport });
    } catch (err) {
      return res.status(err.status || 500).json({ message: err.message });
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
      personnelId: personnel._id,
      prenom:      personnel.prenom,
      nom:         personnel.nom,
      shiftId:     shiftId || null,
      transportId: transportId || null,
      lat:         lat || null,
      lng:         lng || null,
      timestamp:   new Date(),
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
// GET /api/v1/driver/vehicles
// ════════════════════════════════════════════════════════════════════════════
const getAvailableVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      statut:    "Disponible",
      deletedAt: null,
      actif:     { $ne: false },
    }).select("nom immatriculation type marque modele carburant");
    return res.json({ vehicles });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getTournee,
  updateStatus,
  acceptMission,
  rejectMission,
  startRoute,
  arrivedPickup,
  patientOnBoard,
  arrivedDestination,
  startWaiting,
  returnToBase,
  completeMission,
  noShow,
  failMission,
  saveSignature,
  uploadPmtPhoto,
  sosSend,
  getAvailableVehicles,
};
