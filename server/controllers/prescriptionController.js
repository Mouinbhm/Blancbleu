/**
 * BlancBleu — Prescription Controller v1.0
 * CRUD pour les Prescriptions Médicales de Transport (PMT).
 */
const Prescription = require("../models/Prescription");
const Patient = require("../models/Patient");
const logger = require("../utils/logger");

const _err = (res, err, status = 500) => {
  logger.error("prescriptionController", { err: err.message });
  res.status(status).json({ message: err.message || "Erreur interne" });
};

// ── GET /api/prescriptions/stats ──────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [total, actives, expirees, enAttente] = await Promise.all([
      Prescription.countDocuments({ deletedAt: null }),
      Prescription.countDocuments({ deletedAt: null, statut: "active" }),
      Prescription.countDocuments({ deletedAt: null, statut: "expiree" }),
      Prescription.countDocuments({ deletedAt: null, statut: "en_attente_validation" }),
    ]);
    // Prescriptions expirant dans les 7 prochains jours
    const dans7j = new Date();
    dans7j.setDate(dans7j.getDate() + 7);
    const expirantBientot = await Prescription.countDocuments({
      deletedAt: null,
      statut: "active",
      dateExpiration: { $lte: dans7j, $gte: new Date() },
    });
    res.json({ total, actives, expirees, enAttente, expirantBientot });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/prescriptions ────────────────────────────────────────────────────
exports.getPrescriptions = async (req, res) => {
  try {
    const { patientId, statut, motif, page = 1, limit = 50 } = req.query;
    const filtre = { deletedAt: null };
    if (patientId) filtre.patientId = patientId;
    if (statut) filtre.statut = statut;
    if (motif) filtre.motif = motif;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [prescriptions, total] = await Promise.all([
      Prescription.find(filtre)
        .populate("patientId", "nom prenom telephone numeroPatient")
        .populate("validePar", "nom prenom email")
        .sort({ dateEmission: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Prescription.countDocuments(filtre),
    ]);

    res.json({ prescriptions, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/prescriptions/:id ────────────────────────────────────────────────
exports.getPrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findOne({ _id: req.params.id, deletedAt: null })
      .populate("patientId", "nom prenom telephone numeroSecu mobilite")
      .populate("validePar", "nom prenom email");
    if (!prescription) return res.status(404).json({ message: "Prescription introuvable" });
    res.json(prescription);
  } catch (err) {
    _err(res, err);
  }
};

// ── POST /api/prescriptions ───────────────────────────────────────────────────
exports.createPrescription = async (req, res) => {
  try {
    // Vérifier que le patient existe
    const patient = await Patient.findOne({ _id: req.body.patientId, deletedAt: null });
    if (!patient) return res.status(404).json({ message: "Patient introuvable" });

    const prescription = await Prescription.create(req.body);
    res.status(201).json(prescription);
  } catch (err) {
    _err(res, err, err.name === "ValidationError" ? 400 : 500);
  }
};

// ── PATCH /api/prescriptions/:id ──────────────────────────────────────────────
exports.updatePrescription = async (req, res) => {
  try {
    const { numero, ...updates } = req.body;
    const prescription = await Prescription.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      updates,
      { new: true, runValidators: true },
    ).populate("patientId", "nom prenom");
    if (!prescription) return res.status(404).json({ message: "Prescription introuvable" });
    res.json(prescription);
  } catch (err) {
    _err(res, err, err.name === "ValidationError" ? 400 : 500);
  }
};

// ── PATCH /api/prescriptions/:id/valider ──────────────────────────────────────
exports.validerPrescription = async (req, res) => {
  try {
    const { contenuExtrait } = req.body;
    const prescription = await Prescription.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      {
        validee: true,
        statut: "active",
        validePar: req.user._id,
        valideAt: new Date(),
        ...(contenuExtrait && { contenuExtrait }),
      },
      { new: true },
    ).populate("patientId", "nom prenom");
    if (!prescription) return res.status(404).json({ message: "Prescription introuvable" });
    res.json(prescription);
  } catch (err) {
    _err(res, err);
  }
};

// ── DELETE /api/prescriptions/:id — soft delete ───────────────────────────────
exports.deletePrescription = async (req, res) => {
  try {
    await Prescription.findByIdAndUpdate(req.params.id, {
      deletedAt: new Date(),
      statut: "annulee",
    });
    res.json({ message: "Prescription annulée" });
  } catch (err) {
    _err(res, err);
  }
};
