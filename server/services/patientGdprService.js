/**
 * BlancBleu — Service RGPD Patient
 *
 * Centralise toutes les opérations RGPD liées aux patients :
 * consentements, export, anonymisation, suppression, audit accès.
 *
 * Références légales :
 * - Art. 15 RGPD : droit d'accès
 * - Art. 16 RGPD : droit de rectification
 * - Art. 17 RGPD : droit à l'effacement
 * - Art. 20 RGPD : droit à la portabilité
 * - Art. L123-22 Code commerce : conservation 10 ans
 */
const Patient = require("../models/Patient");
const Transport = require("../models/Transport");
const auditService = require("./auditService");

// ── Helpers ────────────────────────────────────────────────────────────────────

function anonEmail(patientId) {
  return `anonymized_${patientId}@deleted.local`;
}

function userCtx(user, req) {
  return {
    id: user?._id || user?.id,
    email: user?.email || "système",
    role: user?.role || "système",
    ip: req?.ip || req?.connection?.remoteAddress || "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Enregistrer un consentement patient
// ─────────────────────────────────────────────────────────────────────────────
async function recordPatientConsent(patientId, consentData, user, req) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error("Patient introuvable");

  const { consentType, accepted, version = "", source = "" } = consentData;
  const now = new Date();

  // Ajouter à l'historique
  patient.consentHistory.push({
    consentType,
    accepted,
    version,
    source,
    ipAddress: req?.ip || "",
    userAgent: req?.headers?.["user-agent"] || "",
    changedAt: now,
    changedBy: user?._id || user?.id || null,
  });

  // Mettre à jour le sous-document gdpr
  if (!patient.gdpr) patient.gdpr = {};

  if (consentType === "data_processing") {
    patient.gdpr.consentGiven = accepted;
    patient.gdpr.consentDate = accepted ? now : patient.gdpr.consentDate;
    patient.gdpr.consentVersion = version;
    patient.gdpr.consentSource = source;
  }
  if (consentType === "medical") {
    patient.gdpr.medicalDataConsent = accepted;
  }
  if (consentType === "marketing") {
    patient.gdpr.marketingConsent = accepted;
  }

  await patient.save();

  await auditService.log({
    action: "PATIENT_CONSENT_UPDATED",
    utilisateur: userCtx(user, req),
    ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
    details: {
      metadata: { consentType, accepted, version },
      message: `Consentement "${consentType}" mis à jour`,
    },
  });

  return patient;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mettre à jour un consentement (alias sémantique)
// ─────────────────────────────────────────────────────────────────────────────
async function updateConsent(patientId, consentType, accepted, user, req) {
  return recordPatientConsent(patientId, { consentType, accepted }, user, req);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Obtenir l'historique des consentements
// ─────────────────────────────────────────────────────────────────────────────
async function getConsentHistory(patientId) {
  const patient = await Patient.findById(patientId)
    .select("consentHistory gdpr numeroPatient nom prenom")
    .populate("consentHistory.changedBy", "nom prenom email role");
  if (!patient) throw new Error("Patient introuvable");
  return {
    patientId,
    numeroPatient: patient.numeroPatient,
    nomComplet: `${patient.nom} ${patient.prenom}`.trim(),
    gdpr: patient.gdpr,
    consentHistory: (patient.consentHistory || []).slice().reverse(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Enregistrer un accès au dossier patient
// ─────────────────────────────────────────────────────────────────────────────
async function recordPatientAccess(patientId, user, reason = "consultation") {
  await Patient.findByIdAndUpdate(patientId, {
    $push: {
      accessHistory: {
        $each: [
          { accessedBy: user?._id || user?.id, role: user?.role, accessedAt: new Date(), reason },
        ],
        $slice: -200, // limite à 200 entrées
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Export complet des données d'un patient (RGPD Art. 20)
// ─────────────────────────────────────────────────────────────────────────────
async function getPatientDataExport(patientId, user, req) {
  const Prescription = require("../models/Prescription");
  const Facture = require("../models/Facture");

  const [patient, transports, prescriptions, factures] = await Promise.all([
    // RGPD Art. 20 — export complet. Pas de .lean() pour bénéficier de
    // post('init') (déchiffrement transparent antecedents/allergies).
    Patient.findById(patientId).select("+antecedents +allergies"),
    Transport.find({ patientId, deletedAt: null })
      .select(
        "numero statut dateTransport heureRDV adresseDepart adresseDestination motif typeTransport distanceKm createdAt",
      )
      .lean(),
    Prescription.find({ patientId })
      .select("numero statut motif dateEmission medecin fichier createdAt")
      .lean(),
    Facture.find({ patientId })
      .select("numero montantTotal montantCPAM statut dateEmission datePaiement createdAt")
      .lean(),
  ]);

  if (!patient) throw new Error("Patient introuvable");

  const payload = {
    exportedAt: new Date().toISOString(),
    notice: "Export de données patient — Ambulances Blanc Bleu (RGPD Art. 20)",
    patient: {
      id: patient._id,
      numeroPatient: patient.numeroPatient,
      nom: patient.nom,
      prenom: patient.prenom,
      dateNaissance: patient.dateNaissance,
      genre: patient.genre,
      telephone: patient.telephone,
      email: patient.email,
      adresse: patient.adresse,
      numeroSecu: patient.numeroSecu ? "*** (chiffré)" : null,
      caisse: patient.caisse,
      mutuelle: patient.mutuelle,
      mobilite: patient.mobilite,
      antecedents: patient.antecedents,
      allergies: patient.allergies,
      createdAt: patient.createdAt,
    },
    consentements: patient.gdpr || {},
    historique_consentements: (patient.consentHistory || []).map((c) => ({
      consentType: c.consentType,
      accepted: c.accepted,
      version: c.version,
      source: c.source,
      changedAt: c.changedAt,
    })),
    transports,
    prescriptions,
    factures,
    note_legale:
      "Les données médicales et comptables sont conservées 10 ans (Art. L123-22 Code de commerce).",
  };

  await auditService.log({
    action: "PATIENT_EXPORTED",
    utilisateur: userCtx(user, req),
    ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
    details: {
      metadata: {
        transports: transports.length,
        prescriptions: prescriptions.length,
        factures: factures.length,
      },
      message: `Export données patient ${patient.numeroPatient}`,
    },
  });

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Anonymiser un patient (RGPD Art. 17)
// ─────────────────────────────────────────────────────────────────────────────
async function anonymizePatient(patientId, user, reason, req) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error("Patient introuvable");
  if (patient.gdpr?.anonymized) throw new Error("Ce patient est déjà anonymisé");

  const userId = user?._id || user?.id;
  const now = new Date();

  // Anonymiser les champs identifiants dans les transports
  await Transport.updateMany(
    { patientId: patient._id },
    {
      $set: {
        "patient.nom": "[ANONYMISÉ]",
        "patient.prenom": "[ANONYMISÉ]",
        "patient.telephone": "",
        "patient.email": "",
      },
    },
  );

  // Anonymiser les champs dénormalisés dans les factures
  const Facture = require("../models/Facture");
  await Facture.updateMany(
    { patientId: patient._id },
    { $set: { patientNom: "[ANONYMISÉ]", patientPrenom: "[ANONYMISÉ]", patientNumeroSecu: "" } },
  );

  // Anonymiser le dossier patient — conserver l'ID, les données de santé anonymisées
  Object.assign(patient, {
    nom: "ANONYMIZED",
    prenom: "PATIENT",
    email: anonEmail(patient._id),
    telephone: null,
    adresse: { rue: "", ville: "", codePostal: "" },
    numeroSecu: "",
    contactUrgence: { nom: "", telephone: "", lien: "" },
    actif: false,
    antecedents: "",
    allergies: "",
    notes: "",
    preferences: "",
    "gdpr.anonymized": true,
    "gdpr.anonymizedAt": now,
    "gdpr.anonymizedBy": userId,
    "gdpr.deletionRequested": false,
  });

  await patient.save({ validateBeforeSave: false });

  await auditService.log({
    action: "PATIENT_ANONYMIZED",
    utilisateur: userCtx(user, req),
    ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
    details: {
      metadata: { reason },
      message: `Patient anonymisé — raison : ${reason || "non précisée"}`,
    },
  });

  return patient;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Demander la suppression/anonymisation d'un patient
// ─────────────────────────────────────────────────────────────────────────────
async function requestPatientDeletion(patientId, user, reason, req) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error("Patient introuvable");
  if (patient.gdpr?.anonymized) throw new Error("Patient déjà anonymisé");

  const userId = user?._id || user?.id;

  patient.gdpr = patient.gdpr || {};
  patient.gdpr.deletionRequested = true;
  patient.gdpr.deletionRequestedAt = new Date();
  patient.gdpr.deletionRequestedBy = userId;
  patient.gdpr.deletionReason = reason || "";

  await patient.save();

  await auditService.log({
    action: "PATIENT_DELETION_REQUESTED",
    utilisateur: userCtx(user, req),
    ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
    details: {
      metadata: { reason },
      message: `Demande suppression enregistrée — ${reason || "raison non précisée"}`,
    },
  });

  return patient;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Annuler une demande de suppression
// ─────────────────────────────────────────────────────────────────────────────
async function cancelDeletionRequest(patientId, user, req) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error("Patient introuvable");

  patient.gdpr = patient.gdpr || {};
  patient.gdpr.deletionRequested = false;
  patient.gdpr.deletionRequestedAt = null;
  patient.gdpr.deletionReason = "";

  await patient.save();

  await auditService.log({
    action: "PATIENT_DELETION_CANCELLED",
    utilisateur: userCtx(user, req),
    ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
    details: { message: `Demande de suppression annulée` },
  });

  return patient;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Résumé audit d'un patient
// ─────────────────────────────────────────────────────────────────────────────
async function getPatientAuditSummary(patientId) {
  const AuditLog = require("../models/AuditLog");

  const logs = await AuditLog.find({ "ressource.id": patientId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const stats = {};
  for (const l of logs) {
    stats[l.action] = (stats[l.action] || 0) + 1;
  }

  return { logs, stats, total: logs.length };
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  recordPatientConsent,
  updateConsent,
  getConsentHistory,
  recordPatientAccess,
  getPatientDataExport,
  anonymizePatient,
  requestPatientDeletion,
  cancelDeletionRequest,
  getPatientAuditSummary,
};
