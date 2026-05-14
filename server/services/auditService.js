/**
 * BlancBleu — Service d'Audit v4.0
 * Transport sanitaire NON urgent
 *
 * Journalise toutes les actions critiques de la plateforme.
 * Vocabulaire : Transport, Vehicule, PMT (Prescription Médicale de Transport).
 * Aucune notion d'urgence, d'escalade ou de priorité P1/P2/P3.
 */
const AuditLog = require("../models/AuditLog");

/**
 * Enregistre une entrée d'audit dans la base de données.
 * Ne fait jamais crasher l'application — silencieux en cas d'erreur.
 *
 * @param {Object} params
 */
async function log({
  action,
  origine = "HUMAIN",
  utilisateur = {},
  ressource = {},
  details = {},
  succes = true,
  erreur = "",
  route = "",
  methode = "",
  dureeMs = 0,
}) {
  try {
    await AuditLog.create({
      action,
      origine,
      succes,
      erreur,
      route,
      methode,
      dureeMs,
      utilisateur: {
        id: utilisateur.id || utilisateur._id || null,
        email: utilisateur.email || "système",
        role: utilisateur.role || "système",
        ip: utilisateur.ip || "",
      },
      ressource: {
        type: ressource.type || "",
        id: ressource.id || null,
        reference: ressource.reference || "",
      },
      details: {
        avant: details.avant || null,
        apres: details.apres || null,
        metadata: details.metadata || null,
        message: details.message || "",
      },
    });
  } catch (err) {
    console.error("[Audit] Erreur d'enregistrement:", err.message);
  }
}

// ── Raccourcis sémantiques ────────────────────────────────────────────────────
const audit = {

  // ─── Transport — Cycle de vie ─────────────────────────────────────────────

  transportCree: (transport, utilisateur) =>
    log({
      action: "TRANSPORT_CREATED",
      origine: "HUMAIN",
      utilisateur,
      ressource: {
        type: "Transport",
        id: transport._id,
        reference: transport.numero,
      },
      details: {
        apres: {
          motif: transport.motif,
          typeTransport: transport.typeTransport,
          patient: `${transport.patient?.nom} ${transport.patient?.prenom}`,
          adresseDepart: transport.adresseDepart,
          adresseDestination: transport.adresseDestination,
        },
        message: `Transport ${transport.numero} créé`,
      },
    }),

  transportConfirme: (transport, utilisateur) =>
    log({
      action: "TRANSPORT_CONFIRMED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: { message: `Transport ${transport.numero} confirmé` },
    }),

  transportPlanifie: (transport, utilisateur) =>
    log({
      action: "TRANSPORT_SCHEDULED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: { dateTransport: transport.dateTransport, heureDepart: transport.heureDepart },
        message: `Transport ${transport.numero} planifié`,
      },
    }),

  transportAnnule: (transport, utilisateur, motifAnnulation) =>
    log({
      action: "TRANSPORT_CANCELLED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: { motifAnnulation },
        message: `Transport ${transport.numero} annulé — ${motifAnnulation || "motif non précisé"}`,
      },
    }),

  transportNoShow: (transport, utilisateur) =>
    log({
      action: "TRANSPORT_NO_SHOW",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: { message: `Patient absent — ${transport.numero}` },
    }),

  transportReprogramme: (transport, utilisateur, nouvelleDateHeure) =>
    log({
      action: "TRANSPORT_RESCHEDULED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: nouvelleDateHeure,
        message: `Transport ${transport.numero} reprogrammé`,
      },
    }),

  statutChange: (transport, ancienStatut, nouveauStatut, utilisateur) =>
    log({
      action: "STATUT_CHANGED",
      origine: "HUMAIN",
      utilisateur,
      ressource: {
        type: "Transport",
        id: transport._id,
        reference: transport.numero,
      },
      details: {
        avant: { statut: ancienStatut },
        apres: { statut: nouveauStatut },
        message: `${transport.numero} : ${ancienStatut} → ${nouveauStatut}`,
      },
    }),

  // ─── Affectation véhicule ─────────────────────────────────────────────────

  vehiculeAssigne: (transport, vehicule, utilisateur, origine = "HUMAIN") =>
    log({
      action: "VEHICULE_ASSIGNED",
      origine,
      utilisateur,
      ressource: {
        type: "Transport",
        id: transport._id,
        reference: transport.numero,
      },
      details: {
        apres: {
          vehicule: vehicule.immatriculation,
          type: vehicule.type,
        },
        message: `Véhicule ${vehicule.immatriculation} assigné à ${transport.numero}`,
      },
    }),

  // ─── Dispatch automatique ─────────────────────────────────────────────────

  dispatchAuto: (transport, vehicule, score, eta) =>
    log({
      action: "DISPATCH_AUTO",
      origine: "SYSTÈME",
      utilisateur: { email: "dispatch@blancbleu.fr", role: "système" },
      ressource: {
        type: "Transport",
        id: transport._id,
        reference: transport.numero,
      },
      details: {
        apres: { vehicule: vehicule.immatriculation, score, eta },
        message: `Auto-dispatch : ${vehicule.immatriculation} (score ${score}/100)`,
      },
    }),

  // ─── PMT (Prescription Médicale de Transport) ─────────────────────────────

  pmtUploaded: (transport, utilisateur, fichier) =>
    log({
      action: "PMT_UPLOADED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: { fichier },
        message: `PMT téléversée pour ${transport.numero}`,
      },
    }),

  pmtExtraite: (transport, extraction, confiance) =>
    log({
      action: "PMT_EXTRACTED",
      origine: "IA",
      utilisateur: { email: "ia@blancbleu.fr", role: "ia" },
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: { extraction, confiance },
        message: `PMT extraite pour ${transport.numero} (confiance ${Math.round(confiance * 100)}%)`,
      },
    }),

  pmtValidee: (transport, utilisateur) =>
    log({
      action: "PMT_VALIDATED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: { message: `PMT validée pour ${transport.numero}` },
    }),

  pmtRejetee: (prescription, utilisateur, motif) =>
    log({
      action: "PMT_REJECTED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Prescription", id: prescription._id, reference: prescription.numero },
      details: { metadata: { motif }, message: `PMT rejetée — ${prescription.numero} : ${motif}` },
    }),

  pmtCorrigee: (prescription, utilisateur) =>
    log({
      action: "PMT_CORRECTED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Prescription", id: prescription._id, reference: prescription.numero },
      details: { message: `PMT corrigée manuellement — ${prescription.numero}` },
    }),

  // ─── IA ──────────────────────────────────────────────────────────────────

  iaDispatchSuggestion: (transport, suggestion, confiance) =>
    log({
      action: "IA_DISPATCH_SUGGESTION",
      origine: "IA",
      utilisateur: { email: "ia@blancbleu.fr", role: "ia" },
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: { suggestion, confiance },
        message: `IA suggère ${suggestion?.vehicule} pour ${transport.numero}`,
      },
    }),

  iaDispatchRequis: (transport, utilisateur) =>
    log({
      action: "IA_DISPATCH_REQUESTED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: { message: `Recommandation IA demandée pour ${transport.numero}` },
    }),

  iaDispatchRecommande: (transport, rec, source, fallbackUsed) =>
    log({
      action: "IA_DISPATCH_RECOMMENDED",
      origine: fallbackUsed ? "SYSTÈME" : "IA",
      utilisateur: { email: "ia@blancbleu.fr", role: "ia" },
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        apres: { vehicule: rec?.vehiculeName, score: rec?.finalScore, source, fallbackUsed },
        message: `Dispatch recommandé (score ${rec?.finalScore}/100) — source: ${source}`,
      },
    }),

  iaDispatchAccepte: (transport, utilisateur) =>
    log({
      action: "IA_DISPATCH_ACCEPTED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: { message: `Recommandation IA acceptée par dispatcher — ${transport.numero}` },
    }),

  iaDispatchRefuse: (transport, utilisateur, raison) =>
    log({
      action: "IA_DISPATCH_REJECTED",
      origine: "HUMAIN",
      utilisateur,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        metadata: { raison },
        message: `Recommandation IA refusée — ${transport.numero} : ${raison}`,
      },
    }),

  iaDispatchFallback: (transport, raison) =>
    log({
      action: "IA_DISPATCH_FALLBACK_USED",
      origine: "SYSTÈME",
      utilisateur: { email: "systeme@blancbleu.fr", role: "système" },
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        metadata: { raison },
        message: `Fallback métier utilisé pour ${transport.numero} — ${raison}`,
      },
    }),

  iaRouteOptimization: (tourneeId, nbTransports, distanceTotale) =>
    log({
      action: "IA_ROUTE_OPTIMIZATION",
      origine: "IA",
      utilisateur: { email: "ia@blancbleu.fr", role: "ia" },
      ressource: { type: "Tournee", id: null, reference: tourneeId },
      details: {
        apres: { nbTransports, distanceTotale },
        message: `Optimisation tournée ${tourneeId} — ${nbTransports} transports, ${distanceTotale} km`,
      },
    }),

  // ─── Véhicule ─────────────────────────────────────────────────────────────

  vehiculeStatusChange: (vehicule, ancienStatut, nouveauStatut, utilisateur) =>
    log({
      action: "VEHICULE_STATUS_CHANGED",
      origine: "HUMAIN",
      utilisateur,
      ressource: {
        type: "Vehicule",
        id: vehicule._id,
        reference: vehicule.immatriculation,
      },
      details: {
        avant: { statut: ancienStatut },
        apres: { statut: nouveauStatut },
        message: `${vehicule.immatriculation} : ${ancienStatut} → ${nouveauStatut}`,
      },
    }),

  // ─── Authentification ─────────────────────────────────────────────────────

  connexion: (utilisateur, ip, succes = true) =>
    log({
      action: succes ? "LOGIN" : "LOGIN_FAILED",
      origine: "HUMAIN",
      succes,
      utilisateur: {
        id: utilisateur._id,
        email: utilisateur.email,
        role: utilisateur.role,
        ip,
      },
      details: {
        message: succes
          ? `Connexion réussie — ${utilisateur.email}`
          : `Tentative échouée — ${utilisateur.email}`,
      },
    }),

  deconnexion: (utilisateur) =>
    log({
      action: "LOGOUT",
      origine: "HUMAIN",
      utilisateur: {
        id: utilisateur._id,
        email: utilisateur.email,
        role: utilisateur.role,
      },
      details: { message: `Déconnexion — ${utilisateur.email}` },
    }),

  // ─── Facturation ──────────────────────────────────────────────────────────

  factureCreee: (facture, transport) =>
    log({
      action: "FACTURE_CREATED",
      origine: "SYSTÈME",
      utilisateur: { email: "facturation@blancbleu.fr", role: "système" },
      ressource: {
        type: "Facture",
        id: facture._id,
        reference: facture.numero,
      },
      details: {
        apres: { montant: facture.montant, statut: facture.statut },
        message: `Facture ${facture.numero} générée — ${facture.montant}€`,
      },
    }),

  // ─── Patient — RGPD ───────────────────────────────────────────────────────

  patientVu: (patient, utilisateur) =>
    log({
      action: "PATIENT_VIEWED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: { message: `Dossier patient ${patient.numeroPatient} consulté` },
    }),

  patientCree: (patient, utilisateur) =>
    log({
      action: "PATIENT_CREATED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: {
        apres: { nom: patient.nom, prenom: patient.prenom, mobilite: patient.mobilite },
        message: `Patient ${patient.numeroPatient} créé`,
      },
    }),

  patientMisAJour: (patient, utilisateur, champs) =>
    log({
      action: "PATIENT_UPDATED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: { metadata: { champsModifies: champs }, message: `Patient ${patient.numeroPatient} mis à jour` },
    }),

  patientExporte: (patient, utilisateur) =>
    log({
      action: "PATIENT_EXPORTED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: { message: `Données du patient ${patient.numeroPatient} exportées (RGPD Art. 20)` },
    }),

  patientAnonyme: (patient, utilisateur, raison) =>
    log({
      action: "PATIENT_ANONYMIZED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: { metadata: { raison }, message: `Patient ${patient.numeroPatient} anonymisé` },
    }),

  patientSuppressionDemandee: (patient, utilisateur, raison) =>
    log({
      action: "PATIENT_DELETION_REQUESTED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: { metadata: { raison }, message: `Demande suppression patient ${patient.numeroPatient}` },
    }),

  patientSuppressionAnnulee: (patient, utilisateur) =>
    log({
      action: "PATIENT_DELETION_CANCELLED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: { message: `Demande suppression annulée — patient ${patient.numeroPatient}` },
    }),

  consentementPatientMaj: (patient, utilisateur, consentType, accepted) =>
    log({
      action: "PATIENT_CONSENT_UPDATED",
      utilisateur,
      ressource: { type: "Patient", id: patient._id, reference: patient.numeroPatient },
      details: {
        metadata: { consentType, accepted },
        message: `Consentement "${consentType}" → ${accepted ? "accepté" : "refusé"} — patient ${patient.numeroPatient}`,
      },
    }),

  prescriptionVue: (prescription, utilisateur) =>
    log({
      action: "PRESCRIPTION_VIEWED",
      utilisateur,
      ressource: { type: "Prescription", id: prescription._id, reference: prescription.numero },
      details: { message: `Prescription ${prescription.numero} consultée` },
    }),

  factureVue: (facture, utilisateur) =>
    log({
      action: "INVOICE_VIEWED",
      utilisateur,
      ressource: { type: "Facture", id: facture._id, reference: facture.numero },
      details: { message: `Facture ${facture.numero} consultée` },
    }),
};

module.exports = { log, audit };
