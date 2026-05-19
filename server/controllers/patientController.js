/**
 * BlancBleu — Patient Controller v2.0
 * CRUD + stats + RGPD complet (consentements, export, anonymisation, audit).
 */
const Patient      = require("../models/Patient");
const Transport    = require("../models/Transport");
const logger       = require("../utils/logger");
const gdprSvc      = require("../services/patientGdprService");
const privacySvc   = require("../services/patientPrivacyService");
const { audit }    = require("../services/auditService");

const safeMsg = (err) =>
  process.env.NODE_ENV === "production"
    ? "Erreur interne du serveur"
    : err.message;

const errStd = (res, err, status = 500) => {
  logger.error("patientController", { err: err.message });
  res.status(status).json({
    success: false,
    message: status === 500 ? safeMsg(err) : (err.message || "Erreur interne"),
    code:    status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : "SERVER_ERROR",
  });
};

// rétro-compat
const _err = errStd;

function userCtx(req) {
  return {
    id:    req.user?._id,
    email: req.user?.email || "système",
    role:  req.user?.role  || "système",
    ip:    req.ip || "",
  };
}

// ── GET /api/patients/stats ───────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [total, actifs, appMobile, mobilite] = await Promise.all([
      Patient.countDocuments({ deletedAt: null }),
      Patient.countDocuments({ deletedAt: null, actif: true }),
      Patient.countDocuments({ deletedAt: null, source: "app_mobile" }),
      Patient.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$mobilite", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    res.json({ total, actifs, inactifs: total - actifs, appMobile, parMobilite: mobilite });
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

    // Enregistrer l'accès (non-bloquant)
    gdprSvc.recordPatientAccess(patient._id, req.user, "consultation").catch(() => {});
    audit.patientVu(patient, userCtx(req));

    // Historique transports
    const transports = await Transport.find({ patientId: patient._id, deletedAt: null })
      .select("numero motif statut dateTransport heureRDV typeTransport adresseDestination recurrence")
      .sort({ dateTransport: -1 })
      .limit(20);

    const data = privacySvc.sanitizePatientForRole(patient, req.user?.role, "consultation");
    res.json({ ...data, transports });
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

// ── GET /api/patients/:id/full-profile ───────────────────────────────────────
exports.getFullProfile = async (req, res) => {
  try {
    const Prescription = require("../models/Prescription");
    const Facture      = require("../models/Facture");

    const patient = await Patient.findOne({ _id: req.params.id, deletedAt: null });
    if (!patient) return res.status(404).json({ success: false, message: "Patient introuvable", code: "NOT_FOUND" });

    gdprSvc.recordPatientAccess(patient._id, req.user, "full-profile").catch(() => {});
    audit.patientVu(patient, userCtx(req));

    const [transports, prescriptions, factures, consentData, auditSummary] = await Promise.all([
      Transport.find({ patientId: patient._id, deletedAt: null })
        .select("numero motif statut dateTransport heureRDV typeTransport adresseDepart adresseDestination vehicule distanceKm createdAt")
        .sort({ dateTransport: -1 })
        .limit(50),
      Prescription.find({ patientId: patient._id })
        .select("numero statut motif dateEmission medecin fichier createdAt")
        .sort({ dateEmission: -1 })
        .limit(50),
      Facture.find({ patientId: patient._id })
        .select("numero montantTotal montantCPAM montantPatient statut dateEmission datePaiement createdAt")
        .sort({ dateEmission: -1 })
        .limit(50),
      gdprSvc.getConsentHistory(patient._id),
      gdprSvc.getPatientAuditSummary(patient._id),
    ]);

    const sanitized = privacySvc.sanitizePatientForRole(patient, req.user?.role, "consultation");

    res.json({
      success: true,
      patient: sanitized,
      transports,
      prescriptions,
      factures,
      consentements: consentData,
      auditSummary,
    });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/patients/:id/data-export (RGPD Art. 20) ─────────────────────────
exports.exportPatientData = async (req, res) => {
  try {
    if (!["admin", "superviseur"].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Export réservé aux administrateurs et superviseurs", code: "FORBIDDEN" });
    }

    const payload = await gdprSvc.getPatientDataExport(req.params.id, req.user, req);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="patient-data-${req.params.id}-${Date.now()}.json"`);
    res.json(payload);
  } catch (err) {
    _err(res, err, err.message === "Patient introuvable" ? 404 : 500);
  }
};

// ── POST /api/patients/:id/consent ───────────────────────────────────────────
exports.updateConsent = async (req, res) => {
  try {
    const { consentType, accepted, version, source } = req.body;
    if (!consentType || accepted === undefined) {
      return res.status(400).json({ success: false, message: "consentType et accepted sont requis", code: "VALIDATION_ERROR" });
    }
    const patient = await gdprSvc.recordPatientConsent(req.params.id, { consentType, accepted, version, source }, req.user, req);
    res.json({ success: true, message: "Consentement enregistré", gdpr: patient.gdpr });
  } catch (err) {
    _err(res, err, err.message === "Patient introuvable" ? 404 : 500);
  }
};

// ── GET /api/patients/:id/consent-history ────────────────────────────────────
exports.getConsentHistory = async (req, res) => {
  try {
    const data = await gdprSvc.getConsentHistory(req.params.id);
    res.json({ success: true, ...data });
  } catch (err) {
    _err(res, err, err.message === "Patient introuvable" ? 404 : 500);
  }
};

// ── POST /api/patients/:id/anonymize ─────────────────────────────────────────
exports.anonymizePatient = async (req, res) => {
  try {
    if (!["admin", "superviseur"].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Anonymisation réservée aux administrateurs et superviseurs", code: "FORBIDDEN" });
    }
    const { reason } = req.body;
    await gdprSvc.anonymizePatient(req.params.id, req.user, reason, req);
    res.json({ success: true, message: "Patient anonymisé avec succès. Les données de transport et de facturation ont été conservées pour raisons légales." });
  } catch (err) {
    _err(res, err, err.message.includes("introuvable") ? 404 : 400);
  }
};

// ── POST /api/patients/:id/request-deletion ──────────────────────────────────
exports.requestDeletion = async (req, res) => {
  try {
    const { reason } = req.body;
    const patient = await gdprSvc.requestPatientDeletion(req.params.id, req.user, reason, req);
    res.json({ success: true, message: "Demande de suppression enregistrée", gdpr: patient.gdpr });
  } catch (err) {
    _err(res, err, err.message === "Patient introuvable" ? 404 : 400);
  }
};

// ── POST /api/patients/:id/cancel-deletion-request ───────────────────────────
exports.cancelDeletion = async (req, res) => {
  try {
    const patient = await gdprSvc.cancelDeletionRequest(req.params.id, req.user, req);
    res.json({ success: true, message: "Demande de suppression annulée", gdpr: patient.gdpr });
  } catch (err) {
    _err(res, err, err.message === "Patient introuvable" ? 404 : 500);
  }
};

// ── GET /api/patients/:id/audit-summary ──────────────────────────────────────
exports.getAuditSummary = async (req, res) => {
  try {
    if (!["admin", "superviseur"].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Accès réservé aux administrateurs et superviseurs", code: "FORBIDDEN" });
    }
    const summary = await gdprSvc.getPatientAuditSummary(req.params.id);
    res.json({ success: true, ...summary });
  } catch (err) {
    _err(res, err);
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
