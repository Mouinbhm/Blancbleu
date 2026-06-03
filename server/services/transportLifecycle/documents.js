/**
 * BlancBleu — Lifecycle Transport : preuve de prise en charge & documents PMT.
 *
 * Signature patient (proofOfCare) + upload / suppression de documents PMT
 * (avec déclenchement OCR best-effort).
 */

const { Transport, socketService, transportNotif, logger } = require("./_core");

// ══════════════════════════════════════════════════════════════════════════════
// PART B — SIGNATURE PATIENT / PREUVE DE PRISE EN CHARGE
// ══════════════════════════════════════════════════════════════════════════════
async function addSignature(
  transportId,
  { signedByName, signatureBase64, signatureImageUrl, consentText },
  utilisateur,
) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  const statutsValides = [
    "ARRIVED_AT_DESTINATION",
    "COMPLETED",
    "BILLING_PENDING",
    "BILLED",
    "PAID",
  ];
  if (!statutsValides.includes(transport.statut)) {
    throw new Error(
      `Signature impossible au statut ${transport.statut}. Statuts autorisés : ${statutsValides.join(", ")}`,
    );
  }

  if (transport.proofOfCare?.signed) {
    const isAdmin = utilisateur?.role === "admin";
    if (!isAdmin)
      throw new Error("Ce transport a déjà une signature. Seul un admin peut la remplacer.");
  }

  // Limite base64 : 2 MB
  if (signatureBase64 && Buffer.byteLength(signatureBase64, "utf8") > 2 * 1024 * 1024) {
    throw new Error("La signature dépasse la taille maximale autorisée (2 Mo)");
  }

  transport.proofOfCare = {
    signed: true,
    signedAt: new Date(),
    signedByName: signedByName || "",
    signatureImageUrl: signatureImageUrl || "",
    signatureBase64: signatureBase64 || "",
    driverId: transport.chauffeur || null,
    patientId: transport.patientId || null,
    consentText: consentText || "Je certifie avoir été transporté conformément à ma demande.",
  };
  await transport.save();

  // Émettre dans la room transport:{id} pour la mise à jour temps réel
  socketService.emitToTransportRoom?.(transport._id, "transport:signature_added", {
    transportId: transport._id,
    numero: transport.numero,
    signedByName: signedByName || "",
    signedAt: transport.proofOfCare.signedAt,
  });

  // Notification persistée admin + dispatcher
  setImmediate(() => {
    transportNotif
      .notifySignatureAdded(transport)
      .catch((err) => logger.warn("[lifecycle] notifySignatureAdded échoué", { err: err.message }));
  });

  logger.info("Signature patient ajoutée", { numero: transport.numero, signedByName });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// PART C — GESTION DOCUMENTS PMT
// ══════════════════════════════════════════════════════════════════════════════
async function uploadPmtDocument(
  transportId,
  { fileUrl, fileName, uploadedBy, triggerOcr = false },
) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  const doc = {
    fileUrl,
    fileName: fileName || fileUrl.split("/").pop(),
    uploadedAt: new Date(),
    uploadedBy: uploadedBy || null,
    ocrStatus: triggerOcr ? "pending" : "skipped",
    extractedData: {},
  };
  transport.pmtDocuments.push(doc);
  await transport.save();

  // Déclencher OCR si disponible (best-effort, non bloquant)
  if (triggerOcr) {
    const addedDoc = transport.pmtDocuments[transport.pmtDocuments.length - 1];
    setImmediate(async () => {
      try {
        const aiClient = require("../aiClient");
        await Transport.findByIdAndUpdate(transportId, {
          $set: { [`pmtDocuments.${transport.pmtDocuments.length - 1}.ocrStatus`]: "processing" },
        });
        const result = await aiClient.extractPmt(fileUrl);
        await Transport.findOneAndUpdate(
          { _id: transportId, "pmtDocuments._id": addedDoc._id },
          { $set: { "pmtDocuments.$.ocrStatus": "done", "pmtDocuments.$.extractedData": result } },
        );
        socketService.emitPmtExtraite?.({
          transportId,
          documentId: addedDoc._id,
          extractedData: result,
        });
        logger.info("OCR PMT terminé", { transportId, fileName });
      } catch (err) {
        await Transport.findOneAndUpdate(
          { _id: transportId, "pmtDocuments._id": addedDoc._id },
          { $set: { "pmtDocuments.$.ocrStatus": "error" } },
        );
        logger.warn("OCR PMT échoué", { transportId, err: err.message });
      }
    });
  }

  logger.info("Document PMT ajouté", { numero: transport.numero, fileName });
  return { transport };
}

async function deletePmtDocument(transportId, documentId, utilisateur) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  const doc = transport.pmtDocuments.id(documentId);
  if (!doc) throw new Error("Document PMT introuvable");

  doc.deleteOne();
  await transport.save();

  logger.info("Document PMT supprimé", { numero: transport.numero, documentId });
  return { transport };
}

module.exports = {
  addSignature,
  uploadPmtDocument,
  deletePmtDocument,
};
