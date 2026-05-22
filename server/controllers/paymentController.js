/**
 * BlancBleu — Contrôleur Paiement Stripe v3.0
 *
 * Endpoints :
 * POST /api/payments/stripe/create-payment-intent  — crée un PaymentIntent
 * POST /api/payments/stripe/webhook                — webhook Stripe (express.raw)
 */

const stripeService = require("../services/stripePaymentService");
const { audit }     = require("../services/auditService");
const Facture       = require("../models/Facture");
const logger        = require("../utils/logger");

const safeMsg = (err) =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? err.message
    : "Erreur interne du serveur";

// ─── Créer un PaymentIntent ───────────────────────────────────────────────────

const createPaymentIntent = async (req, res) => {
  try {
    const { invoiceId, factureId } = req.body;
    const id = invoiceId || factureId;
    if (!id) return res.status(400).json({ message: "invoiceId requis" });

    const result = await stripeService.createPaymentIntent(id, {
      email: req.user?.email || "",
      nom:   req.user?.nom   || "",
    });

    await audit.paymentIntentCree(
      await Facture.findById(id).select("numero"),
      req.user,
      result.paymentIntentId,
    );

    res.json({ success: true, ...result });
  } catch (err) {
    logger.error("[paymentController/createPaymentIntent]", { err: err.message });
    res.status(400).json({ message: err.message });
  }
};

// ─── Webhook Stripe ───────────────────────────────────────────────────────────

/**
 * Cette route DOIT recevoir le body brut (Buffer) via express.raw().
 * Ne pas passer express.json() avant ce handler.
 */
const stripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, signature);
  } catch (err) {
    logger.warn("[stripe/webhook] Signature invalide", { err: err.message });
    return res.status(400).json({ message: `Webhook signature invalide : ${err.message}` });
  }

  try {
    await audit.stripeWebhookRecu(event.type, event.id);
    const result = await stripeService.handleStripeWebhook(event);
    res.json({ received: true, ...result });
  } catch (err) {
    logger.error("[stripe/webhook] Erreur traitement", { type: event?.type, err: err.message });
    // Renvoyer 200 à Stripe pour éviter les retry intempestifs sur des erreurs métier
    res.json({ received: true, error: safeMsg(err) });
  }
};

// ─── Confirmer paiement (endpoint mobile — vérifie auprès de Stripe) ──────────

const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, factureId } = req.body;
    if (!paymentIntentId || !factureId)
      return res.status(400).json({ message: "paymentIntentId et factureId requis" });

    // Source de vérité : Stripe
    const pi = await stripeService.confirmPaymentIntent(paymentIntentId);

    if (pi.metadata?.factureId !== factureId) {
      return res.status(400).json({ message: "PaymentIntent ne correspond pas à cette facture" });
    }

    const facture = await Facture.findById(factureId);
    if (!facture) return res.status(404).json({ message: "Facture introuvable" });

    if (pi.status === "succeeded") {
      // Le webhook aura normalement déjà mis à jour la facture.
      // Si ce n'est pas encore le cas, on le fait ici en fallback.
      if (facture.paymentStatus !== "SUCCEEDED") {
        const { markInvoicePaid } = require("../services/invoiceService");
        await markInvoicePaid(factureId, {
          stripePaymentIntentId: pi.id,
          paidAt: new Date(),
        });
      }
      const updated = await Facture.findById(factureId);
      return res.json({
        message: "Paiement confirmé",
        statut: "SUCCEEDED",
        facture: updated,
      });
    }

    res.json({
      message: `Paiement en attente de confirmation (statut Stripe : ${pi.status})`,
      statut: pi.status,
    });
  } catch (err) {
    logger.error("[paymentController/confirmPayment]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
};

module.exports = { createPaymentIntent, stripeWebhook, confirmPayment };
