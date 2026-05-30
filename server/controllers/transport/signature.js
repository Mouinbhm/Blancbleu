/**
 * BlancBleu — Signature patient (preuve de prise en charge).
 *
 * POST /api/transports/:id/signature
 *  - Accepte signatureBase64 OU fichier image uploadé via multer.
 *  - Délégué à lifecycle.addSignature qui valide le statut + persiste.
 */

const lifecycle = require("../../services/transportLifecycle");
const { fileUrl: resolveFileUrl } = require("../../middleware/upload");
const { _handleErr } = require("./_shared");

const addSignature = async (req, res, next) => {
  try {
    const { signedByName, signatureBase64, consentText } = req.body;

    if (!signedByName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Le nom du signataire est requis",
        code: "MISSING_SIGNER_NAME",
      });
    }

    // Si un fichier a été uploadé via multer, l'utiliser en priorité
    let signatureImageUrl = "";
    if (req.file) {
      signatureImageUrl = resolveFileUrl(req, `signatures/${req.file.filename}`);
    }

    const { transport } = await lifecycle.addSignature(
      req.params.id,
      { signedByName, signatureBase64: signatureBase64 || "", signatureImageUrl, consentText },
      req.user,
    );

    res.json({
      success: true,
      message: "Signature enregistrée avec succès",
      proofOfCare: transport.proofOfCare,
    });
  } catch (e) {
    if (e.message?.includes("Signature impossible") || e.message?.includes("déjà une signature"))
      return res
        .status(422)
        .json({ success: false, message: e.message, code: "SIGNATURE_NOT_ALLOWED" });
    if (e.message?.includes("taille maximale"))
      return res.status(413).json({ success: false, message: e.message, code: "FILE_TOO_LARGE" });
    _handleErr(res, next, e);
  }
};

module.exports = { addSignature };
