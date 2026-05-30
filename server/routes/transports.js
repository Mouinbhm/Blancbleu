/**
 * BlancBleu — Routes Transport Sanitaire
 * Remplace routes/interventions.js
 */
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { uploadPmt, uploadSignature } = require("../middleware/upload");
const { createTransportSchema, updateTransportSchema } = require("../validators/schemas");
const ctrl = require("../controllers/transport");

// ── Wrapper multer → Express (gestion erreur type/taille) ────────────────────
function multerWrap(multerFn) {
  return (req, res, next) => {
    multerFn(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE")
        return res
          .status(413)
          .json({ success: false, message: "Fichier trop volumineux", code: "FILE_TOO_LARGE" });
      return res.status(400).json({ success: false, message: err.message, code: "UPLOAD_ERROR" });
    });
  };
}

// ── Stats et estimation (avant /:id) ─────────────────────────────────────────
router.get("/stats", protect, ctrl.getStats);
router.get("/estimation", protect, ctrl.estimerTarif);

// ── Notifications (avant /:id) ────────────────────────────────────────────────
router.get("/notifications", protect, ctrl.getNotifications);
router.patch("/notifications/read-all", protect, ctrl.markAllNotificationsRead);
router.patch("/notifications/:id/read", protect, ctrl.markNotificationRead);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/", protect, ctrl.getTransports);
router.post("/", protect, validate(createTransportSchema), ctrl.createTransport);
router.post("/recurrents", protect, ctrl.creerTransportsRecurrents);
router.get("/:id", protect, ctrl.getTransport);
router.patch("/:id", protect, validate(updateTransportSchema), ctrl.updateTransport);
router.delete("/:id", protect, ctrl.deleteTransport);

// ── Transitions lifecycle ─────────────────────────────────────────────────────
router.patch("/:id/confirm", protect, ctrl.confirmer);
router.patch("/:id/schedule", protect, ctrl.planifier);
router.patch("/:id/assign", protect, ctrl.assigner);
router.patch("/:id/accept-driver", protect, ctrl.accepterDriver);
router.patch("/:id/reject-driver", protect, ctrl.refuserDriver);
router.patch("/:id/en-route", protect, ctrl.enRoute);
router.patch("/:id/arrived", protect, ctrl.arriveePatient);
router.patch("/:id/on-board", protect, ctrl.patientABord);
router.patch("/:id/destination", protect, ctrl.arriveeDestination);
router.patch("/:id/complete", protect, ctrl.completer);
router.patch("/:id/wait", protect, ctrl.demarrerAttente);
router.patch("/:id/return-base", protect, ctrl.demarrerRetour);
router.patch("/:id/billing-pending", protect, ctrl.billingPending);
router.patch("/:id/bill", protect, ctrl.facturer);
router.patch("/:id/paid", protect, ctrl.paid);
router.patch("/:id/fail", protect, ctrl.fail);
router.patch("/:id/no-show", protect, ctrl.noShow);
router.patch("/:id/cancel", protect, ctrl.annuler);
router.patch("/:id/reschedule", protect, ctrl.reprogrammer);

// ── PART A : Timeline ─────────────────────────────────────────────────────────
router.get("/:id/timeline", protect, ctrl.getTimeline);

// ── PART B : Signature patient ────────────────────────────────────────────────
// Accepte soit un fichier image (champ "signature"), soit signatureBase64 dans le body
router.post("/:id/signature", protect, multerWrap(uploadSignature), ctrl.addSignature);

// ── PART C : Documents PMT ───────────────────────────────────────────────────
router.post("/:id/pmt", protect, multerWrap(uploadPmt), ctrl.uploadPmt);
router.get("/:id/pmt", protect, ctrl.getPmt);
router.delete(
  "/:id/pmt/:docId",
  protect,
  authorize("admin", "dispatcher", "superviseur"),
  ctrl.deletePmt,
);

// ── PART D : Export PDF ───────────────────────────────────────────────────────
router.get("/:id/pdf", protect, ctrl.exportPdf);

// ── IA Dispatch — accept / reject ────────────────────────────────────────────
const aiCtrl = require("../controllers/aiController");
router.patch(
  "/:id/ai-recommendation/accept",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  aiCtrl.accepterRecommandationIA,
);
router.patch(
  "/:id/ai-recommendation/reject",
  protect,
  authorize("dispatcher", "superviseur", "admin"),
  aiCtrl.refuserRecommandationIA,
);

module.exports = router;
