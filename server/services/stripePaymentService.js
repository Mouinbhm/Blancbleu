/**
 * BlancBleu — Service Paiement Stripe v3.0
 *
 * Centralise toutes les interactions avec l'API Stripe.
 * NE JAMAIS stocker de données carte bancaire.
 * Le statut "payé" est TOUJOURS confirmé par le webhook Stripe.
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Facture = require("../models/Facture");
const invoiceService = require("./invoiceService");
const logger = require("../utils/logger");

const CURRENCY = (process.env.STRIPE_CURRENCY || "eur").toLowerCase();

// ─── PaymentIntent ────────────────────────────────────────────────────────────

/**
 * Crée un PaymentIntent Stripe pour une facture.
 * Retourne { clientSecret, paymentIntentId, amount, currency }
 */
async function createPaymentIntent(invoiceId, patientInfo = {}) {
  const facture = await Facture.findById(invoiceId).populate("transportId", "numero");

  if (!facture) throw new Error("Facture introuvable");

  if (["payee", "remboursee"].includes(facture.statut))
    throw new Error("Cette facture est déjà payée");

  if (facture.statut === "annulee") throw new Error("Cette facture est annulée");

  // Montant patient (ticket modérateur), minimum 50 centimes pour Stripe
  const montant = facture.montantPatient > 0 ? facture.montantPatient : facture.montantTotal;
  if (!montant || montant < 0.5) throw new Error("Montant invalide (minimum 0.50 €)");

  const amountCents = Math.round(montant * 100);

  const metadata = {
    factureId: facture._id.toString(),
    factureNumero: facture.numero,
    transportId: (facture.transportId?._id || facture.transportId || "").toString(),
    patientEmail: patientInfo.email || "",
    patientNom: patientInfo.nom || facture.patientNom || "",
  };

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: CURRENCY,
    automatic_payment_methods: { enabled: true },
    metadata,
    description: `BlancBleu — Facture ${facture.numero}`,
  });

  // Enregistrer le PaymentIntent en attente
  facture.payment.stripePaymentIntentId = pi.id;
  facture.paymentStatus = "PENDING";
  if (facture.statut === "emise" || facture.statut === "brouillon") {
    facture.statut = "en_attente";
  }
  invoiceService.addInvoiceHistory(
    facture,
    "PAYMENT_INTENT_CREATED",
    facture.statut,
    "en_attente",
    null,
    `PaymentIntent créé — ${pi.id}`,
  );
  await facture.save();

  logger.info("[stripe] PaymentIntent créé", {
    factureId: invoiceId,
    piId: pi.id,
    amount: montant,
  });

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    amount: montant,
    currency: CURRENCY.toUpperCase(),
  };
}

/**
 * Récupère le statut d'un PaymentIntent Stripe (vérification côté serveur).
 */
async function confirmPaymentIntent(paymentIntentId) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return pi;
}

// ─── Remboursement ────────────────────────────────────────────────────────────

/**
 * Crée un remboursement Stripe et met à jour la facture.
 * amount : montant en euros (pas en centimes)
 */
async function createRefund(invoiceId, amount, reason, user) {
  const facture = await Facture.findById(invoiceId);
  if (!facture) throw new Error("Facture introuvable");

  if (facture.paymentStatus !== "SUCCEEDED")
    throw new Error("Seules les factures payées peuvent être remboursées");

  if (!facture.payment.stripePaymentIntentId)
    throw new Error("Aucun PaymentIntent Stripe associé à cette facture");

  if (!reason || reason.trim().length < 3)
    throw new Error("La raison du remboursement est obligatoire (min. 3 caractères)");

  const montantPaye = facture.montantPatient || facture.montantTotal;
  const montantDemande = parseFloat(amount) || 0;

  if (montantDemande <= 0 || montantDemande > montantPaye + 0.01)
    throw new Error(`Montant remboursement invalide (max : ${montantPaye} €)`);

  const amountCents = Math.round(montantDemande * 100);

  // Récupérer le charge ID depuis le PaymentIntent
  const pi = await stripe.paymentIntents.retrieve(facture.payment.stripePaymentIntentId);
  const chargeId = pi.latest_charge || facture.payment.stripeChargeId;

  if (!chargeId) throw new Error("Aucune charge Stripe associée — remboursement impossible");

  const refund = await stripe.refunds.create({
    charge: chargeId,
    amount: amountCents,
    reason: "requested_by_customer",
    metadata: {
      factureId: facture._id.toString(),
      factureNumero: facture.numero,
      adminEmail: user?.email || "",
      raisonMetier: reason,
    },
  });

  // Mise à jour de la facture
  await invoiceService.markInvoiceRefunded(invoiceId, {
    amount: montantDemande,
    reason,
    stripeRefundId: refund.id,
    user,
  });

  logger.info("[stripe] Remboursement créé", {
    factureId: invoiceId,
    refundId: refund.id,
    amount: montantDemande,
  });

  return refund;
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

/**
 * Vérifie la signature Stripe et retourne l'event parsé.
 * rawBody doit être le Buffer brut (express.raw()).
 */
function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("[stripe/webhook] STRIPE_WEBHOOK_SECRET non configuré — signature ignorée");
    return JSON.parse(rawBody.toString());
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Dispatch principal du webhook.
 * Retourne { handled: boolean, event: string }
 */
async function handleStripeWebhook(event) {
  logger.info("[stripe/webhook] Event reçu", { type: event.type, id: event.id });

  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentSucceeded(event.data.object);
      return { handled: true, event: event.type };

    case "payment_intent.payment_failed":
      await handlePaymentFailed(event.data.object);
      return { handled: true, event: event.type };

    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      return { handled: true, event: event.type };

    case "refund.created":
    case "refund.updated":
      await handleRefundSucceeded(event.data.object);
      return { handled: true, event: event.type };

    default:
      logger.info("[stripe/webhook] Event non géré", { type: event.type });
      return { handled: false, event: event.type };
  }
}

/**
 * payment_intent.succeeded → marque la facture payée.
 */
async function handlePaymentSucceeded(paymentIntent) {
  const factureId = paymentIntent.metadata?.factureId;
  if (!factureId) {
    logger.warn("[stripe/webhook] paymentIntent.succeeded sans factureId dans metadata", {
      pi: paymentIntent.id,
    });
    return;
  }

  // Récupérer les infos du charge
  let chargeId = null;
  let stripeReceiptUrl = null;
  if (paymentIntent.latest_charge) {
    try {
      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
      chargeId = charge.id;
      stripeReceiptUrl = charge.receipt_url;
    } catch (err) {
      logger.warn("[stripe/webhook] Impossible de récupérer le charge", { err: err.message });
    }
  }

  await invoiceService.markInvoicePaid(factureId, {
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: chargeId,
    stripeReceiptUrl,
    paidAt: new Date(paymentIntent.created * 1000),
  });

  // Notification Socket.IO si disponible — best-effort, ne doit pas bloquer
  // le marquage de la facture comme payée (le webhook Stripe doit répondre
  // 200 même si on n'arrive pas à notifier les clients socket).
  try {
    const { emitFactureUpdated } = require("./socketService");
    const facture = await Facture.findById(factureId);
    if (facture) emitFactureUpdated(facture);
  } catch (e) {
    logger.warn("[stripe/webhook] emit facture payée échoué", { factureId, err: e.message });
  }

  logger.info("[stripe/webhook] Facture marquée payée", { factureId, piId: paymentIntent.id });
}

/**
 * payment_intent.payment_failed → marque la facture en échec.
 */
async function handlePaymentFailed(paymentIntent) {
  const factureId = paymentIntent.metadata?.factureId;
  if (!factureId) return;

  const lastError = paymentIntent.last_payment_error;
  const reason = lastError?.message || lastError?.code || "Paiement refusé";

  await invoiceService.markInvoiceFailed(factureId, {
    stripePaymentIntentId: paymentIntent.id,
    failureReason: reason,
    failedAt: new Date(),
  });

  // Notification — best-effort (cf. handlePaymentSucceeded).
  try {
    const { emitFactureUpdated } = require("./socketService");
    const facture = await Facture.findById(factureId);
    if (facture) emitFactureUpdated(facture);
  } catch (e) {
    logger.warn("[stripe/webhook] emit facture échouée échoué", { factureId, err: e.message });
  }

  logger.warn("[stripe/webhook] Paiement échoué", { factureId, reason });
}

/**
 * charge.refunded → met à jour le statut de la facture.
 */
async function handleChargeRefunded(charge) {
  // Retrouver la facture via le stripeChargeId ou le PaymentIntent
  let facture = await Facture.findOne({ "payment.stripeChargeId": charge.id });
  if (!facture && charge.payment_intent) {
    facture = await Facture.findOne({ "payment.stripePaymentIntentId": charge.payment_intent });
  }
  if (!facture) {
    logger.warn("[stripe/webhook] charge.refunded — facture non trouvée", { chargeId: charge.id });
    return;
  }

  const refundTotal = charge.amount_refunded / 100;
  const montantPaye = facture.montantPatient || facture.montantTotal;
  const isTotal = Math.abs(refundTotal - montantPaye) < 0.01;

  if (facture.paymentStatus === "SUCCEEDED") {
    await invoiceService.markInvoiceRefunded(facture._id.toString(), {
      amount: refundTotal,
      reason: "Remboursement Stripe",
      stripeRefundId: null,
      user: null,
    });
    logger.info("[stripe/webhook] charge.refunded traité", {
      factureId: facture._id,
      amount: refundTotal,
      total: isTotal,
    });
  }
}

/**
 * refund.created / refund.updated → log uniquement.
 */
async function handleRefundSucceeded(refund) {
  logger.info("[stripe/webhook] refund event", { refundId: refund.id, status: refund.status });
}

module.exports = {
  createPaymentIntent,
  confirmPaymentIntent,
  createRefund,
  constructWebhookEvent,
  handleStripeWebhook,
  handlePaymentSucceeded,
  handlePaymentFailed,
};
