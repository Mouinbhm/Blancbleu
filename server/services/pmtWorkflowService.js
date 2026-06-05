/**
 * BlancBleu — PMT Workflow Service
 * Orchestre le cycle Upload → OCR → Correction → Validation → Liaison
 *
 * Règles métier invariantes :
 *  - L'OCR ne valide JAMAIS automatiquement une prescription
 *  - La validation humaine est OBLIGATOIRE
 *  - Le texte OCR brut n'est JAMAIS persisté (RGPD, données médicales)
 */
const path = require("path");
const Prescription = require("../models/Prescription");
const { audit } = require("./auditService");
const aiClient = require("./aiClient");

const UPLOAD_BASE = process.env.BASE_URL || "http://localhost:5000";

// ── Helpers ────────────────────────────────────────────────────────────────────

function _userCtx(user) {
  return { id: user._id, email: user.email, role: user.role };
}

function _appendHistory(prescription, action, user, notes = "", donnees = null) {
  prescription.validationHistory.push({ action, par: user._id, notes, donnees });
}

// ── Upload document PMT ────────────────────────────────────────────────────────

/**
 * Enregistre le fichier uploadé dans prescription.document
 * et déclenche l'extraction OCR de façon asynchrone.
 */
async function uploadPmtDocument(prescriptionId, file, user) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, deletedAt: null });
  if (!prescription) throw new Error("Prescription introuvable");

  const relPath = `pmt/${path.basename(file.path)}`;
  const publicUrl = `${UPLOAD_BASE}/uploads/${relPath}`;

  prescription.document = {
    fileUrl: publicUrl,
    fileName: file.originalname || path.basename(file.path),
    mimeType: file.mimetype,
    uploadedAt: new Date(),
    uploadedBy: user._id,
  };
  // Conserver rétrocompatibilité avec les anciens champs
  prescription.fichierUrl = publicUrl;
  prescription.fichierNom = file.originalname || path.basename(file.path);

  prescription.ocr.statut = "pending";
  _appendHistory(prescription, "DOCUMENT_UPLOADED", user, "Document PMT téléversé");
  await prescription.save();

  // Audit sans blocage
  audit.pmtUploaded(
    { _id: prescriptionId, numero: prescription.numero },
    _userCtx(user),
    file.originalname,
  );

  // Démarrage extraction asynchrone (non bloquant)
  startOcrExtraction(prescriptionId, file.path, file.mimetype, user).catch(() => {});

  return prescription;
}

// ── Lancement extraction OCR ───────────────────────────────────────────────────

async function startOcrExtraction(prescriptionId, filePath, mimeType, user) {
  await Prescription.findByIdAndUpdate(prescriptionId, {
    "ocr.statut": "processing",
  });

  try {
    // Délègue à aiClient (URL bien câblée via AI_API_URL + token service-to-service
    // ajouté par l'intercepteur). Évite un second chemin HTTP divergent.
    const data = await aiClient.extrairePMT(filePath, mimeType, path.basename(filePath));

    await saveOcrResult(prescriptionId, data, user);
  } catch (err) {
    await Prescription.findByIdAndUpdate(prescriptionId, {
      "ocr.statut": "failed",
      "ocr.erreurs": [err.message],
      "ocr.traiteAt": new Date(),
    });
  }
}

// ── Enregistrement résultat OCR ────────────────────────────────────────────────

async function saveOcrResult(prescriptionId, aiResponse, user) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, deletedAt: null });
  if (!prescription) return;

  const {
    extraction = {},
    confiance = 0,
    champsManquants = [],
    champsIncertains = [],
    validationRequise = true,
    // texteOCR volontairement ignoré — ne jamais persister le texte brut
  } = aiResponse;

  // Mise à jour champs OCR
  prescription.ocr.statut = "processed";
  prescription.ocr.confiance = confiance;
  prescription.ocr.donneesExtraites = extraction;
  prescription.ocr.champsIncertains = champsIncertains;
  prescription.ocr.traiteAt = new Date();

  // Rétrocompatibilité legacy
  prescription.extractionIA = extraction;
  prescription.confiance = confiance;
  prescription.champsManquants = champsManquants;

  // Statut prescription : toujours en attente de validation humaine
  prescription.statut = "en_attente_validation";
  prescription.validation.statut = "en_attente";
  prescription.validation.donneesOriginales = extraction;

  _appendHistory(
    prescription,
    "OCR_PROCESSED",
    user || { _id: null },
    `Confiance ${Math.round(confiance * 100)}% — ${champsManquants.length} champ(s) manquant(s)`,
    { confiance, champsManquants },
  );

  await prescription.save();

  // Audit IA (sans données médicales brutes — confiance + champs manquants seulement)
  audit.pmtExtraite(
    { _id: prescriptionId, numero: prescription.numero },
    { champsManquants, champsIncertains },
    confiance,
  );

  return prescription;
}

// ── Récupérer prescription pour validation ─────────────────────────────────────

async function getPrescriptionForValidation(prescriptionId) {
  return Prescription.findOne({ _id: prescriptionId, deletedAt: null })
    .populate("patientId", "nom prenom telephone numeroPatient mobilite")
    .populate("validation.validePar", "nom prenom email")
    .populate("validePar", "nom prenom email");
}

// ── Corriger les champs extraits ───────────────────────────────────────────────

async function correctExtractedFields(prescriptionId, donneesCorrigees, user, notes = "") {
  const prescription = await Prescription.findOne({ _id: prescriptionId, deletedAt: null });
  if (!prescription) throw new Error("Prescription introuvable");

  prescription.validation.statut = "corrige";
  prescription.validation.donneesCorrigees = donneesCorrigees;
  prescription.validation.notesCorrection = notes;

  // Propager les corrections dans contenuExtrait
  prescription.contenuExtrait = donneesCorrigees;

  _appendHistory(prescription, "FIELDS_CORRECTED", user, notes, donneesCorrigees);
  await prescription.save();

  return prescription;
}

// ── Valider la prescription ────────────────────────────────────────────────────

async function validatePrescription(prescriptionId, user, contenuFinal = null) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, deletedAt: null });
  if (!prescription) throw new Error("Prescription introuvable");
  if (prescription.validation.statut === "valide") throw new Error("Prescription déjà validée");

  const donneesFin =
    contenuFinal ||
    prescription.validation.donneesCorrigees ||
    prescription.ocr.donneesExtraites ||
    prescription.extractionIA;

  // Champs legacy
  prescription.validee = true;
  prescription.validePar = user._id;
  prescription.valideAt = new Date();
  prescription.statut = "active";
  if (donneesFin) prescription.contenuExtrait = donneesFin;

  // Workflow
  prescription.validation.statut = "valide";
  prescription.validation.validePar = user._id;
  prescription.validation.valideAt = new Date();
  if (donneesFin) prescription.validation.donneesCorrigees = donneesFin;

  _appendHistory(prescription, "VALIDATED", user, "Prescription validée par un humain");
  await prescription.save();

  audit.pmtValidee({ _id: prescriptionId, numero: prescription.numero }, _userCtx(user));

  return prescription;
}

// ── Rejeter la prescription ────────────────────────────────────────────────────

async function rejectPrescription(prescriptionId, user, motif = "") {
  const prescription = await Prescription.findOne({ _id: prescriptionId, deletedAt: null });
  if (!prescription) throw new Error("Prescription introuvable");

  prescription.validation.statut = "rejete";
  prescription.validation.validePar = user._id;
  prescription.validation.valideAt = new Date();
  prescription.validation.motifRejet = motif;
  prescription.statut = "incomplet";
  prescription.commentaireDispatcher = motif;

  _appendHistory(prescription, "REJECTED", user, motif);
  await prescription.save();

  return prescription;
}

// ── Lier au patient ───────────────────────────────────────────────────────────

async function linkPrescriptionToPatient(prescriptionId, patientId, user) {
  const prescription = await Prescription.findOneAndUpdate(
    { _id: prescriptionId, deletedAt: null },
    { patientId },
    { new: true },
  );
  if (!prescription) throw new Error("Prescription introuvable");
  _appendHistory(prescription, "LINKED_PATIENT", user, `Lié au patient ${patientId}`);
  await prescription.save();
  return prescription;
}

// ── Lier au transport ─────────────────────────────────────────────────────────

async function linkPrescriptionToTransport(prescriptionId, transportId, user) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, deletedAt: null });
  if (!prescription) throw new Error("Prescription introuvable");
  prescription.linkedTransportId = transportId;
  _appendHistory(prescription, "LINKED_TRANSPORT", user, `Lié au transport ${transportId}`);
  await prescription.save();
  return prescription;
}

// ── Prescriptions en attente de validation ────────────────────────────────────

async function getPendingValidation({ page = 1, limit = 20 } = {}) {
  const filtre = {
    deletedAt: null,
    statut: "en_attente_validation",
    "ocr.statut": { $in: ["processed", "failed", "pending"] },
  };
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [items, total] = await Promise.all([
    Prescription.find(filtre)
      .populate("patientId", "nom prenom telephone numeroPatient")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Prescription.countDocuments(filtre),
  ]);
  return {
    prescriptions: items,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
  };
}

module.exports = {
  uploadPmtDocument,
  startOcrExtraction,
  saveOcrResult,
  getPrescriptionForValidation,
  correctExtractedFields,
  validatePrescription,
  rejectPrescription,
  linkPrescriptionToPatient,
  linkPrescriptionToTransport,
  getPendingValidation,
};
