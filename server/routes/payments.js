/**
 * BlancBleu — Routes Paiement Stripe v3.0
 *
 * IMPORTANT : La route webhook utilise express.raw() et doit être enregistrée
 * AVANT express.json() dans server.js pour que la vérification de signature Stripe
 * fonctionne correctement.
 */
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { log: auditLog } = require("../services/auditService");
const ctrl = require("../controllers/paymentController");

// Rôles facturation autorisés à manipuler les paiements côté staff. Aligné sur
// la triade COMPTABLE utilisée dans routes/factures.js et routes/comptabilite.js.
// `dispatcher` (opérationnel) et `patient` (qui paie via le chemin mobile dédié
// /api/patient/factures/:id/paiement-intent) sont volontairement exclus.
const BILLING_ROLES = ["admin", "comptable", "superviseur"];

// Variante de `authorize` qui journalise toute tentative refusée comme événement
// de sécurité (audit) avant de renvoyer 403. Même shape de réponse qu'authorize.
const authorizeBilling = async (req, res, next) => {
  if (BILLING_ROLES.includes(req.user.role)) return next();

  await auditLog({
    action: "PAYMENT_ACCESS_DENIED",
    origine: "HUMAIN",
    succes: false,
    utilisateur: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      ip: req.ip,
    },
    route: req.originalUrl,
    methode: req.method,
    details: {
      message: `Accès refusé route paiement staff — rôle '${req.user.role}' non autorisé`,
    },
  });

  return res.status(403).json({
    message: `Rôle '${req.user.role}' non autorisé pour cette action`,
  });
};

// ── Créer un PaymentIntent (staff facturation uniquement) ─────────────────────
// Body : { invoiceId }
router.post("/stripe/create-payment-intent", protect, authorizeBilling, ctrl.createPaymentIntent);

// ── Confirmer paiement après succès Stripe côté client ───────────────────────
// Body : { paymentIntentId, factureId }
// Fallback si le webhook n'a pas encore été traité.
router.post("/stripe/confirm", protect, authorizeBilling, ctrl.confirmPayment);

// NOTE : La route POST /stripe/webhook est enregistrée directement dans server.js
// avec express.raw() AVANT express.json() pour conserver le body Buffer brut.
// Ne pas l'ajouter ici.

module.exports = router;
