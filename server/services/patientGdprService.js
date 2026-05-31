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

// ── Sentinel values pour l'anonymisation RGPD effective (Art. 17) ─────────────
// Format aligné sur docs/rgpd.md §6.2. La valeur `[ANONYMISÉ]` est lisible
// dans les UI sans casser les composants qui supposent une string non-vide.
const ANON_NAME = "[ANONYMISÉ]";
const ANON_PHONE = "0000000000";
const anonEmailV2 = (userId) => `anon-${userId}@anonymise.local`;

// Statuts depuis lesquels un transport est considéré comme terminé (donc
// anonymisable). Anonymiser un transport en cours casserait le suivi métier
// (chauffeur en route, facturation en attente, etc.) — refus explicite.
const TERMINAL_TRANSPORT_STATES = new Set(["COMPLETED", "BILLED", "PAID", "CANCELLED"]);

/**
 * Vérifie qu'aucun transport actif (= hors TERMINAL_TRANSPORT_STATES) n'est
 * encore lié au patient. Lance une erreur 409 si bloqué.
 */
async function _assertNoActiveTransports(patientId) {
  const blocking = await Transport.find({
    patientId,
    statut: { $nin: Array.from(TERMINAL_TRANSPORT_STATES) },
    deletedAt: null,
  })
    .select("numero statut")
    .lean();
  if (blocking.length > 0) {
    const err = new Error(
      `Anonymisation impossible — ${blocking.length} transport(s) actif(s) : ` +
        blocking.map((t) => `${t.numero} (${t.statut})`).join(", "),
    );
    err.statusCode = 409;
    err.code = "ACTIVE_TRANSPORTS";
    throw err;
  }
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
  // RGPD Art. 17 — droit à l'oubli. IRRÉVERSIBLE : les valeurs PII sont
  // écrasées en base, pas archivées. Le caller doit déjà avoir confirmé
  // l'intention (cf. confirmReason obligatoire côté API).

  const patient = await Patient.findById(patientId).select(
    "+antecedents +allergies +numeroSecuHash",
  );
  if (!patient) {
    const e = new Error("Patient introuvable");
    e.statusCode = 404;
    throw e;
  }
  if (patient.gdpr?.anonymized) {
    const e = new Error("Ce patient est déjà anonymisé");
    e.statusCode = 409;
    e.code = "ALREADY_ANONYMIZED";
    throw e;
  }

  // Blocage tant qu'il reste des transports non-terminés : éviter d'anonymiser
  // un patient pendant qu'une mission est en cours ou en facturation.
  await _assertNoActiveTransports(patient._id);

  const userId = user?._id || user?.id;
  const now = new Date();

  // ── 1. Sub-docs Transport.patient (denormalisé, survit même après anon Patient)
  // On purge AUSSI antecedents/allergies sur le subdoc — c'est la donnée
  // médicale embarquée qui pose le risque RGPD le plus direct.
  await Transport.updateMany(
    { patientId: patient._id },
    {
      $set: {
        "patient.nom": ANON_NAME,
        "patient.prenom": ANON_NAME,
        "patient.telephone": ANON_PHONE,
        "patient.email": "",
        "patient.numeroSecu": "",
        "patient.antecedents": "",
        "patient.allergies": "",
        "patient.notes": "",
      },
      $unset: { "patient.dateNaissance": "" },
    },
  );

  // ── 2. Factures (champs dénormalisés du patient). On conserve le numéro,
  // les montants et les liens — obligations légales 10 ans (Art. L123-22).
  const Facture = require("../models/Facture");
  await Facture.updateMany(
    { patientId: patient._id },
    {
      $set: {
        patientNom: ANON_NAME,
        patientPrenom: ANON_NAME,
        patientNumeroSecu: "",
      },
    },
  );

  // ── 3. Patient lui-même. Mongoose attendu : assignation directe par
  // path (PAS Object.assign avec clés "gdpr.foo" qui crée des top-level
  // bizarres). On utilise patient.set() pour les paths imbriqués.
  patient.nom = ANON_NAME;
  patient.prenom = ANON_NAME;
  patient.email = anonEmailV2(patient._id);
  patient.telephone = ANON_PHONE;
  patient.dateNaissance = null;
  patient.adresse = { rue: "", ville: "", codePostal: "" };
  patient.numeroSecu = "";
  patient.numeroSecuHash = null;
  patient.contactUrgence = { nom: "", telephone: "", lien: "" };
  patient.actif = false;
  patient.antecedents = "";
  patient.allergies = "";
  patient.notes = "";
  patient.preferences = "";
  patient.mutuelle = "";

  patient.set("gdpr.anonymized", true);
  patient.set("gdpr.anonymizedAt", now);
  patient.set("gdpr.anonymizedBy", userId);
  patient.set("gdpr.anonymizationReason", reason || "");
  patient.set("gdpr.deletionRequested", false);

  await patient.save({ validateBeforeSave: false });

  // ── 4. Audit log. Action déjà dans l'enum (cf. models/AuditLog.js).
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
