/**
 * BlancBleu — Patient Controller v1.0
 * CRUD + stats pour l'entité Patient.
 */
const Patient = require("../models/Patient");
const Transport = require("../models/Transport");
const logger = require("../utils/logger");

const _err = (res, err, status = 500) => {
  logger.error("patientController", { err: err.message });
  res.status(status).json({ message: err.message || "Erreur interne" });
};

// ── GET /api/patients/stats ───────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [total, actifs, mobilite] = await Promise.all([
      Patient.countDocuments({ deletedAt: null }),
      Patient.countDocuments({ deletedAt: null, actif: true }),
      Patient.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$mobilite", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    res.json({ total, actifs, inactifs: total - actifs, parMobilite: mobilite });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/patients ─────────────────────────────────────────────────────────
exports.getPatients = async (req, res) => {
  try {
    const { recherche, mobilite, actif, page = 1, limit = 50 } = req.query;
    const filtre = { deletedAt: null };
    if (actif !== undefined) filtre.actif = actif === "true";
    if (mobilite) filtre.mobilite = mobilite;
    if (recherche) {
      const re = new RegExp(recherche.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filtre.$or = [{ nom: re }, { prenom: re }, { telephone: re }, { numeroSecu: re }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [patients, total] = await Promise.all([
      Patient.find(filtre).sort({ nom: 1, prenom: 1 }).skip(skip).limit(parseInt(limit)),
      Patient.countDocuments(filtre),
    ]);

    res.json({ patients, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/patients/:id ─────────────────────────────────────────────────────
exports.getPatient = async (req, res) => {
  try {
    const patient = await Patient.findOne({ _id: req.params.id, deletedAt: null });
    if (!patient) return res.status(404).json({ message: "Patient introuvable" });

    // Historique transports
    const transports = await Transport.find({ patientId: patient._id, deletedAt: null })
      .select("numero motif statut dateTransport heureRDV typeTransport adresseDestination recurrence")
      .sort({ dateTransport: -1 })
      .limit(20);

    res.json({ ...patient.toJSON(), transports });
  } catch (err) {
    _err(res, err);
  }
};

// ── POST /api/patients ────────────────────────────────────────────────────────
exports.createPatient = async (req, res) => {
  try {
    const patient = await Patient.create(req.body);
    res.status(201).json(patient);
  } catch (err) {
    _err(res, err, err.name === "ValidationError" ? 400 : 500);
  }
};

// ── PATCH /api/patients/:id ───────────────────────────────────────────────────
exports.updatePatient = async (req, res) => {
  try {
    const { deletedAt, numeroPatient, ...updates } = req.body; // champs immuables ignorés
    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      updates,
      { new: true, runValidators: true },
    );
    if (!patient) return res.status(404).json({ message: "Patient introuvable" });
    res.json(patient);
  } catch (err) {
    _err(res, err, err.name === "ValidationError" ? 400 : 500);
  }
};

// ── DELETE /api/patients/:id — soft delete ────────────────────────────────────
exports.deletePatient = async (req, res) => {
  try {
    // Vérifier qu'il n'y a pas de transport actif
    const transportsActifs = await Transport.countDocuments({
      patientId: req.params.id,
      statut: { $nin: ["COMPLETED", "BILLED", "CANCELLED", "NO_SHOW"] },
      deletedAt: null,
    });
    if (transportsActifs > 0) {
      return res.status(400).json({
        message: `Ce patient a ${transportsActifs} transport(s) actif(s) — suppression impossible`,
      });
    }
    await Patient.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), actif: false });
    res.json({ message: "Patient archivé avec succès" });
  } catch (err) {
    _err(res, err);
  }
};
