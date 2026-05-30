/**
 * BlancBleu — Documents PMT (Prescription Médicale de Transport).
 *
 * POST   /api/transports/:id/pmt         — upload + déclenchement OCR optionnel
 * GET    /api/transports/:id/pmt         — liste des documents PMT attachés
 * DELETE /api/transports/:id/pmt/:docId  — suppression (admin/dispatcher)
 */

const Transport = require("../../models/Transport");
const lifecycle = require("../../services/transportLifecycle");
const transportNotif = require("../../services/transportNotificationService");
const { fileUrl: resolveFileUrl } = require("../../middleware/upload");
const { _handleErr } = require("./_shared");

const uploadPmt = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Fichier requis (champ 'file')", code: "MISSING_FILE" });
    }

    const relPath = `pmt/${req.file.filename}`;
    const url = resolveFileUrl(req, relPath);
    const triggerOcr = req.body.triggerOcr === "true" || req.body.triggerOcr === true;

    const { transport } = await lifecycle.uploadPmtDocument(req.params.id, {
      fileUrl: url,
      fileName: req.file.originalname,
      uploadedBy: req.user._id,
      triggerOcr,
    });

    transportNotif.notifyPmtUploaded(transport, req.file.originalname).catch(() => {});

    const addedDoc = transport.pmtDocuments[transport.pmtDocuments.length - 1];
    res.status(201).json({ success: true, message: "PMT ajoutée avec succès", document: addedDoc });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const getPmt = async (req, res, next) => {
  try {
    const transport = await Transport.findById(req.params.id).select("pmtDocuments numero");
    if (!transport)
      return res.status(404).json({ success: false, message: "Transport introuvable" });
    res.json({ success: true, documents: transport.pmtDocuments || [] });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const deletePmt = async (req, res, next) => {
  try {
    await lifecycle.deletePmtDocument(req.params.id, req.params.docId, req.user);
    res.json({ success: true, message: "Document PMT supprimé" });
  } catch (e) {
    if (e.message?.includes("introuvable"))
      return res.status(404).json({ success: false, message: e.message });
    _handleErr(res, next, e);
  }
};

module.exports = { uploadPmt, getPmt, deletePmt };
