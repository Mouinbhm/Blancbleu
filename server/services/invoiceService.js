/**
 * BlancBleu — Service Facturation v3.0
 *
 * Centralise toute la logique facture.
 * Réutilise factureService.js (rétrocompatibilité) + tarifService.js.
 */

const Facture = require("../models/Facture");
const Transport = require("../models/Transport");
const Patient = require("../models/Patient");
const tarifService = require("./tarifService");
const logger = require("../utils/logger");
const { ConflictError } = require("../utils/errors");

// Statuts qui autorisent la génération de facture (transport terminé / en cours
// de clôture financière). Sortie de cette liste = refus du lock. Cohérent avec
// la sémantique métier : on ne facture pas un transport en cours.
const FACTURABLE_STATES = ["COMPLETED", "BILLING_PENDING", "BILLED", "PAID", "INVOICED"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ajoute une entrée dans l'historique d'une facture.
 * Ne sauvegarde pas — appeler facture.save() ensuite.
 */
function addInvoiceHistory(facture, action, from, to, user, reason = "", metadata = null) {
  facture.history.push({
    action,
    from: from || facture.statut,
    to: to || facture.statut,
    by: user?._id || user?.id || null,
    byEmail: user?.email || "système",
    at: new Date(),
    reason,
    metadata,
  });
}

/**
 * Calcule les montants d'une facture à partir du transport.
 * Retourne { montantBase, majoration, montantTotal, montantCPAM, montantPatient, tauxPriseEnCharge, distanceKm, detailsCalcul }
 */
async function calculateInvoiceAmount(transport) {
  try {
    const tarif = await tarifService.calculerTarif(transport);
    return {
      montantBase: parseFloat((tarif.montantTotal - (tarif.supplements || 0)).toFixed(2)),
      majoration: parseFloat((tarif.supplements || 0).toFixed(2)),
      montantTotal: parseFloat(tarif.montantTotal.toFixed(2)),
      tauxPriseEnCharge: tarif.tauxPriseEnCharge || transport.tauxPriseEnCharge || 65,
      montantCPAM: parseFloat(tarif.montantCPAM.toFixed(2)),
      montantPatient: parseFloat(tarif.montantPatient.toFixed(2)),
      distanceKm: tarif.distanceKm || 0,
      detailsCalcul: tarif,
    };
  } catch (err) {
    logger.warn("[invoiceService] calcul tarifaire échoué", { err: err.message });
    const taux = transport.tauxPriseEnCharge || 65;
    return {
      montantBase: 0,
      majoration: 0,
      montantTotal: 0,
      tauxPriseEnCharge: taux,
      montantCPAM: 0,
      montantPatient: 0,
      distanceKm: 0,
      detailsCalcul: null,
    };
  }
}

// ─── Création ─────────────────────────────────────────────────────────────────

/**
 * Crée une facture à partir d'un transport terminé.
 *
 * Idempotente ET atomique :
 *  1. LOCK atomique sur Transport via findOneAndUpdate avec garde stricte
 *     (statut facturable + factureGenerated != true). Si null retourné →
 *     soit une facture existe déjà (retour idempotent), soit le statut ne
 *     permet pas la facturation (refus).
 *  2. Calcul tarifaire (pur — cf. tarifService.calculerTarif).
 *  3. Création de la facture. L'index unique partial sur Facture.transportId
 *     (cf. models/Facture.js) reste la 2e ligne de défense contre les
 *     doublons même si le lock fuit (filtre $ne: "annulee").
 *  4. En cas d'échec après le lock : ROLLBACK — $unset factureGenerated/LockedAt
 *     et stockage de factureGenerationError pour debug + retry admin via
 *     POST /api/admin/factures/retry/:transportId.
 *
 * @param {string|ObjectId} transportId
 * @param {Object} user — acteur (utilisé pour audit history + bypass statut si admin)
 * @returns {Promise<{ facture: Document, created: boolean }>}
 */
async function createInvoiceFromTransport(transportId, user) {
  const isAdmin = user?.role === "admin";

  // ── Étape 1 : LOCK atomique sur le Transport ────────────────────────────────
  // Garde : statut facturable + pas déjà locké. Mongo garantit l'atomicité
  // au niveau document — un seul appelant peut transitionner false → true.
  // Admin peut bypasser la garde de statut (mais pas la garde de lock).
  const lockFilter = isAdmin
    ? { _id: transportId, factureGenerated: { $ne: true } }
    : { _id: transportId, statut: { $in: FACTURABLE_STATES }, factureGenerated: { $ne: true } };

  const transport = await Transport.findOneAndUpdate(
    lockFilter,
    { $set: { factureGenerated: true, factureLockedAt: new Date() } },
    { new: true },
  ).populate("patientId", "nom prenom numeroSecu");

  if (!transport) {
    // 3 raisons possibles :
    //   (a) facture déjà émise (lock pris ET save terminé) — retour idempotent
    //   (b) lock pris par un caller concurrent qui n'a pas encore fini son save
    //       (race window calcul tarif + save) — on POLL la facture quelques fois
    //   (c) transport introuvable ou statut non facturable — refus
    const existante = await Facture.findOne({
      transportId,
      statut: { $ne: "annulee" },
    });
    if (existante) {
      logger.info("[invoiceService] Facture déjà existante (idempotence)", {
        numero: existante.numero,
        transportId: String(transportId),
      });
      return { facture: existante, created: false };
    }

    // Discrimination (b) vs (c) : si le transport existe ET son lock est pris
    // (factureGenerated=true), alors un caller concurrent est en cours →
    // POLL la facture. Sinon : refus immédiat (statut interdit / 404).
    const raw = await Transport.findById(transportId).select(
      "statut factureGenerated factureLockedAt",
    );
    if (!raw) throw new Error(`Transport introuvable : ${transportId}`);

    if (raw.factureGenerated === true) {
      // Cas (b) : poll court — 10 tentatives × 50ms = 500ms max. Couvre la
      // race window typique (calcul tarif + save Mongo). En prod un calcul
      // qui dure > 500ms est anormal et l'admin doit retry manuellement.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const f = await Facture.findOne({ transportId, statut: { $ne: "annulee" } });
        if (f) {
          logger.info("[invoiceService] Facture trouvée après poll (race window résolue)", {
            numero: f.numero,
            transportId: String(transportId),
            pollIterations: i + 1,
          });
          return { facture: f, created: false };
        }
      }
      // Toujours pas de facture après 500ms : le caller qui a le lock a
      // probablement échoué ou est extrêmement lent → ConflictError pour
      // signaler "réessayer plus tard ou reset le lock".
      throw new ConflictError(
        "Facturation en cours par un autre processus — réessayer ou reset le lock via /api/admin/factures/retry/:id",
      );
    }

    // Cas (c) : pas de facture, lock pas pris, donc le statut est interdit.
    throw new ConflictError(
      `Facturation impossible — statut "${raw.statut}" hors de [${FACTURABLE_STATES.join(", ")}].`,
    );
  }

  // ── Étape 2-3 : calcul + création — encadrés par try/catch pour rollback ──
  try {
    const montants = await calculateInvoiceAmount(transport);

    const patient = transport.patientId;
    const patientNom = patient?.nom || transport.patient?.nom || "";
    const patientPrenom = patient?.prenom || transport.patient?.prenom || "";

    const facture = new Facture({
      transportId: transport._id,
      patientId: transport.patientId?._id || transport.patientId || null,
      patientNom,
      patientPrenom,
      patientNumeroSecu: patient?.numeroSecu || "",
      dateEmission: new Date(),
      typeVehicule: transport.typeTransport || "VSL",
      motif: transport.motif || "",
      allerRetour: transport.allerRetour || false,
      statut: "brouillon",
      paymentStatus: "UNPAID",
      notes: `Facture générée depuis transport ${transport.numero || transport._id}`,
      ...montants,
    });

    addInvoiceHistory(
      facture,
      "INVOICE_CREATED",
      null,
      "brouillon",
      user,
      "Facture créée depuis transport",
    );
    await facture.save();

    logger.info("[invoiceService] Facture créée", {
      numero: facture.numero,
      transportId: transport._id,
      montantTotal: facture.montantTotal,
    });

    return { facture, created: true };
  } catch (err) {
    // ── Étape 4 : ROLLBACK du lock pour permettre le retry ───────────────────
    // L'index unique partial sur Facture.transportId peut lever un E11000 si
    // une facture a été créée entre le lock et le save (race extrêmement rare,
    // typiquement lecture stale). Dans ce cas la facture existe déjà —
    // retour idempotent au lieu d'échec.
    if (err.code === 11000) {
      const existante = await Facture.findOne({
        transportId: transport._id,
        statut: { $ne: "annulee" },
      });
      if (existante) {
        logger.warn("[invoiceService] E11000 sur insert — récupération idempotente", {
          transportId: String(transport._id),
        });
        // Le lock reste posé, c'est cohérent (facture existe bien)
        return { facture: existante, created: false };
      }
    }

    // Échec réel : libérer le lock et tracer l'erreur pour retry admin.
    await Transport.updateOne(
      { _id: transport._id },
      {
        $unset: { factureGenerated: "", factureLockedAt: "" },
        $set: { factureGenerationError: err.message?.slice(0, 500) || "Erreur inconnue" },
      },
    ).catch((rollbackErr) =>
      logger.error("[invoiceService] Rollback du lock échoué", {
        transportId: String(transport._id),
        err: rollbackErr.message,
      }),
    );
    logger.error("[invoiceService] Création facture échouée — lock libéré", {
      transportId: String(transport._id),
      err: err.message,
    });
    throw err;
  }
}

/**
 * Reset le lock de génération facture sur un transport. Réservé admin
 * (caller doit avoir vérifié l'autorisation côté contrôleur). Permet
 * de relancer une facturation après un échec (factureGenerationError
 * renseigné).
 *
 * @param {string|ObjectId} transportId
 * @returns {Promise<{ reset: boolean }>}
 */
async function resetInvoiceLock(transportId) {
  const res = await Transport.updateOne(
    { _id: transportId },
    {
      $unset: {
        factureGenerated: "",
        factureLockedAt: "",
        factureGenerationError: "",
      },
    },
  );
  return { reset: res.modifiedCount > 0 };
}

// ─── Transitions ──────────────────────────────────────────────────────────────

/**
 * Émet la facture (brouillon → emise).
 * Définit la date d'échéance à 30 jours si non renseignée.
 */
async function issueInvoice(invoiceId, user) {
  const f = await Facture.findById(invoiceId);
  if (!f) throw new Error("Facture introuvable");
  if (f.statut !== "brouillon")
    throw new Error(`Impossible d'émettre une facture au statut "${f.statut}"`);

  const from = f.statut;
  f.statut = "emise";
  if (!f.dateEcheance) {
    const echeance = new Date();
    echeance.setDate(echeance.getDate() + 30);
    f.dateEcheance = echeance;
  }

  addInvoiceHistory(f, "INVOICE_ISSUED", from, "emise", user, "Facture émise");
  await f.save();
  return f;
}

/**
 * Marque la facture comme payée (via webhook Stripe ou confirmation manuelle).
 * paymentData = { stripePaymentIntentId, stripeChargeId, stripeReceiptUrl, amount, paidAt }
 */
async function markInvoicePaid(invoiceId, paymentData = {}) {
  const f = await Facture.findById(invoiceId);
  if (!f) throw new Error("Facture introuvable");

  const from = f.statut;

  f.statut = "payee";
  f.paymentStatus = "SUCCEEDED";
  f.datePaiement = paymentData.paidAt || new Date();
  f.modePaiement = "stripe";

  // Mettre à jour le sous-document payment
  f.payment.paidAt = f.datePaiement;
  f.payment.stripePaymentIntentId =
    paymentData.stripePaymentIntentId || f.payment.stripePaymentIntentId;
  f.payment.stripeChargeId = paymentData.stripeChargeId || f.payment.stripeChargeId;
  f.payment.stripeReceiptUrl = paymentData.stripeReceiptUrl || f.payment.stripeReceiptUrl;
  f.payment.failedAt = null;
  f.payment.failureReason = null;

  // Rétrocompatibilité
  f.referenceExterne = f.payment.stripePaymentIntentId;

  addInvoiceHistory(f, "PAYMENT_SUCCEEDED", from, "payee", null, "Paiement confirmé via Stripe", {
    stripePaymentIntentId: f.payment.stripePaymentIntentId,
    stripeChargeId: f.payment.stripeChargeId,
  });

  await f.save();
  logger.info("[invoiceService] Facture marquée payée", { numero: f.numero });
  return f;
}

/**
 * Marque la facture en échec de paiement.
 * failureData = { stripePaymentIntentId, failureReason, failedAt }
 */
async function markInvoiceFailed(invoiceId, failureData = {}) {
  const f = await Facture.findById(invoiceId);
  if (!f) throw new Error("Facture introuvable");

  const from = f.statut;

  f.statut = "payment_failed";
  f.paymentStatus = "FAILED";

  f.payment.failedAt = failureData.failedAt || new Date();
  f.payment.failureReason = failureData.failureReason || "Paiement refusé";
  f.payment.stripePaymentIntentId =
    failureData.stripePaymentIntentId || f.payment.stripePaymentIntentId;
  f.payment.attempts = (f.payment.attempts || 0) + 1;

  addInvoiceHistory(
    f,
    "PAYMENT_FAILED",
    from,
    "payment_failed",
    null,
    failureData.failureReason || "Paiement échoué",
    {
      stripePaymentIntentId: f.payment.stripePaymentIntentId,
    },
  );

  await f.save();
  logger.warn("[invoiceService] Facture marquée en échec", {
    numero: f.numero,
    reason: failureData.failureReason,
  });
  return f;
}

/**
 * Rembourse partiellement ou totalement une facture.
 * refundData = { amount, reason, stripeRefundId, user }
 */
async function markInvoiceRefunded(invoiceId, refundData = {}) {
  const f = await Facture.findById(invoiceId);
  if (!f) throw new Error("Facture introuvable");
  if (f.paymentStatus !== "SUCCEEDED")
    throw new Error("Seules les factures payées peuvent être remboursées");

  if (!refundData.reason) throw new Error("La raison du remboursement est obligatoire");

  const from = f.statut;
  const montantRembourse = parseFloat(refundData.amount || 0);
  const montantPaye = f.montantPatient || f.montantTotal;

  const isTotal = Math.abs(montantRembourse - montantPaye) < 0.01;

  f.statut = isTotal ? "remboursee" : "partiellement_remboursee";
  f.paymentStatus = isTotal ? "REFUNDED" : "PARTIALLY_REFUNDED";

  f.payment.refundedAt = new Date();
  f.payment.refundAmount = montantRembourse;
  f.payment.refundReason = refundData.reason;
  f.payment.stripeRefundId = refundData.stripeRefundId || null;

  addInvoiceHistory(
    f,
    isTotal ? "REFUND_SUCCEEDED" : "REFUND_CREATED",
    from,
    f.statut,
    refundData.user,
    refundData.reason,
    {
      amount: montantRembourse,
      stripeRefundId: refundData.stripeRefundId,
    },
  );

  await f.save();
  logger.info("[invoiceService] Facture remboursée", {
    numero: f.numero,
    amount: montantRembourse,
    total: isTotal,
  });
  return f;
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

async function getInvoiceByTransport(transportId) {
  return Facture.findOne({ transportId, statut: { $ne: "annulee" } })
    .populate(
      "transportId",
      "numero motif dateTransport adresseDestination patient typeTransport allerRetour",
    )
    .populate("patientId", "nom prenom telephone numeroSecu caisse");
}

async function getPatientInvoices(patientId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [factures, total] = await Promise.all([
    Facture.find({ patientId })
      .populate("transportId", "numero motif dateTransport typeTransport")
      .sort({ dateEmission: -1 })
      .skip(skip)
      .limit(limit),
    Facture.countDocuments({ patientId }),
  ]);
  return { factures, total, page, pages: Math.ceil(total / limit) };
}

// ─── Vérification retard ──────────────────────────────────────────────────────

/**
 * Passe les factures non payées dont l'échéance est dépassée en "en_retard".
 * À appeler via un cron ou manuellement.
 */
async function checkOverdueInvoices() {
  const now = new Date();
  const result = await Facture.updateMany(
    {
      statut: { $in: ["emise", "en_attente"] },
      paymentStatus: { $in: ["UNPAID", "PENDING"] },
      dateEcheance: { $lt: now },
    },
    {
      $set: { statut: "en_retard" },
      $push: {
        history: {
          action: "INVOICE_OVERDUE",
          from: "en_attente",
          to: "en_retard",
          byEmail: "système",
          at: now,
          reason: "Échéance dépassée",
        },
      },
    },
  );
  logger.info("[invoiceService] Factures en retard mises à jour", { count: result.modifiedCount });
  return result.modifiedCount;
}

module.exports = {
  createInvoiceFromTransport,
  resetInvoiceLock,
  calculateInvoiceAmount,
  issueInvoice,
  markInvoicePaid,
  markInvoiceFailed,
  markInvoiceRefunded,
  getInvoiceByTransport,
  getPatientInvoices,
  addInvoiceHistory,
  checkOverdueInvoices,
};
