/**
 * BlancBleu — Contrôleur Factures v3.0
 * Compatible avec le modèle Facture v3 (paymentStatus, payment, pdf, accounting, history)
 * Rétrocompatible avec le modèle v2 (statut, montantTotal, etc.)
 */
const Facture        = require("../models/Facture");
const Transport      = require("../models/Transport");
const tarifService   = require("../services/tarifService");
const invoiceService = require("../services/invoiceService");
const pdfService     = require("../services/invoicePdfService");
const { audit }      = require("../services/auditService");
const logger         = require("../utils/logger");

const STATUTS_VALIDES = [
  "brouillon","emise","en_attente","payee","annulee",
  "payment_failed","remboursee","partiellement_remboursee","en_retard",
];

const safeMsg = (err) =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? err.message
    : "Erreur interne du serveur";

// ─── Liste factures ────────────────────────────────────────────────────────────

const getFactures = async (req, res) => {
  try {
    const { statut, paymentStatus, patientId, exported, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (statut)        filter.statut        = statut;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (patientId)     filter.patientId     = patientId;
    if (exported === "true")  filter["accounting.exported"] = true;
    if (exported === "false") filter["accounting.exported"] = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [factures, total] = await Promise.all([
      Facture.find(filter)
        .populate("transportId", "numero motif dateTransport typeTransport")
        .populate("patientId",   "nom prenom numeroPatient")
        .sort({ dateEmission: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Facture.countDocuments(filter),
    ]);
    res.json({ factures, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Détail facture ────────────────────────────────────────────────────────────

const getFacture = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id)
      .populate("transportId", "numero motif dateTransport adresseDestination adresseDepart patient typeTransport allerRetour")
      .populate("patientId",   "nom prenom telephone numeroSecu caisse numeroPatient");
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    await audit.factureVue(f, req.user);
    res.json(f);
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Création ─────────────────────────────────────────────────────────────────

const createFacture = async (req, res) => {
  try {
    if (req.body.transportId) {
      const existante = await Facture.findOne({
        transportId: req.body.transportId,
        statut: { $ne: "annulee" },
      });
      if (existante) {
        return res.status(400).json({
          message: `Une facture (${existante.numero}) existe déjà pour ce transport`,
        });
      }
    }
    const f = await Facture.create(req.body);
    await audit.factureCreee(f, null);
    res.status(201).json({ message: "Facture créée", facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Génère automatiquement une facture depuis un transport terminé.
 * POST /api/factures/from-transport/:transportId
 */
const createFromTransport = async (req, res) => {
  try {
    const { transportId } = req.params;
    const { facture, created } = await invoiceService.createInvoiceFromTransport(
      transportId, req.user,
    );
    if (!created) {
      return res.json({ message: "Facture déjà existante", facture, created: false });
    }
    await audit.factureCreee(facture, req.user);
    res.status(201).json({ message: "Facture générée avec succès", facture, created: true });
  } catch (err) {
    const code = err.message.includes("doit être terminé") ? 422 : 400;
    res.status(code).json({ message: err.message });
  }
};

// ─── Mise à jour ──────────────────────────────────────────────────────────────

const updateFacture = async (req, res) => {
  try {
    const { numero, transportId, ...updates } = req.body;

    if (updates.montantTotal !== undefined || updates.tauxPriseEnCharge !== undefined) {
      const existing = await Facture.findById(req.params.id).select("montantTotal tauxPriseEnCharge");
      if (!existing) return res.status(404).json({ message: "Facture introuvable" });
      const montant = parseFloat(updates.montantTotal ?? existing.montantTotal) || 0;
      const taux    = parseFloat(updates.tauxPriseEnCharge ?? existing.tauxPriseEnCharge) || 65;
      updates.montantTotal       = montant;
      updates.tauxPriseEnCharge  = taux;
      updates.montantCPAM        = parseFloat((montant * taux / 100).toFixed(2));
      updates.montantPatient     = parseFloat((montant - updates.montantCPAM).toFixed(2));
    }

    const f = await Facture.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ message: "Facture mise à jour", facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── Statut (rétrocompatible) ─────────────────────────────────────────────────

const updateStatut = async (req, res) => {
  try {
    const { statut } = req.body;
    if (!STATUTS_VALIDES.includes(statut))
      return res.status(400).json({ message: `Statut invalide. Valides : ${STATUTS_VALIDES.join(", ")}` });

    const f = await Facture.findById(req.params.id);
    if (!f) return res.status(404).json({ message: "Facture introuvable" });

    const from = f.statut;
    f.statut = statut;

    // Synchronisation paymentStatus ↔ statut
    if (statut === "payee") {
      f.datePaiement  = new Date();
      f.paymentStatus = "SUCCEEDED";
      f.payment.paidAt = f.datePaiement;
    }
    if (statut === "payment_failed")           f.paymentStatus = "FAILED";
    if (statut === "remboursee")               f.paymentStatus = "REFUNDED";
    if (statut === "partiellement_remboursee") f.paymentStatus = "PARTIALLY_REFUNDED";
    if (statut === "annulee")                  f.paymentStatus = "UNPAID";
    if (statut === "emise") {
      f.paymentStatus = "UNPAID";
      if (!f.dateEcheance) {
        const e = new Date(); e.setDate(e.getDate() + 30); f.dateEcheance = e;
      }
    }
    if (statut === "en_attente") f.paymentStatus = "PENDING";
    if (statut === "brouillon")  f.paymentStatus = "UNPAID";
    invoiceService.addInvoiceHistory(f, "STATUT_CHANGED", from, statut, req.user);
    await f.save();
    res.json({ message: "Statut mis à jour", facture: f });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Émettre facture ──────────────────────────────────────────────────────────

const issueFacture = async (req, res) => {
  try {
    const f = await invoiceService.issueInvoice(req.params.id, req.user);
    res.json({ message: "Facture émise", facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── Remboursement ────────────────────────────────────────────────────────────

const refundFacture = async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!reason || String(reason).trim().length < 3)
      return res.status(400).json({ message: "La raison du remboursement est obligatoire" });

    const stripeService = require("../services/stripePaymentService");
    const refund = await stripeService.createRefund(
      req.params.id,
      parseFloat(amount),
      String(reason).trim(),
      req.user,
    );

    const f = await Facture.findById(req.params.id);
    await audit.remboursementCree(f, req.user, parseFloat(amount), reason);

    res.json({ message: "Remboursement effectué", refund, facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── PDF facture ──────────────────────────────────────────────────────────────

const downloadInvoicePdf = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id)
      .populate("transportId")
      .populate("patientId", "nom prenom numeroSecu caisse numeroPatient");
    if (!f) return res.status(404).json({ message: "Facture introuvable" });

    await audit.invoicePdfDownloaded(f, req.user);
    pdfService.generateInvoicePdf(f, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── PDF reçu ─────────────────────────────────────────────────────────────────

const downloadReceiptPdf = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id)
      .populate("patientId", "nom prenom numeroSecu numeroPatient");
    if (!f) return res.status(404).json({ message: "Facture introuvable" });

    if (f.paymentStatus !== "SUCCEEDED")
      return res.status(400).json({ message: "Reçu disponible uniquement pour les factures payées" });

    await audit.receiptDownloaded(f, req.user);
    pdfService.generateReceiptPdf(f, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Historique ───────────────────────────────────────────────────────────────

const getHistory = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id).select("numero history");
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ numero: f.numero, history: f.history || [] });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Annulation facture (soft delete) ────────────────────────────────────────

const deleteFacture = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id);
    if (!f) return res.status(404).json({ message: "Facture introuvable" });

    if (f.statut === "annulee") {
      return res.status(400).json({ message: "Cette facture est déjà annulée" });
    }
    if (f.statut === "payee" || f.paymentStatus === "SUCCEEDED") {
      return res.status(400).json({ message: "Impossible d'annuler une facture déjà payée" });
    }

    const from = f.statut;
    f.statut        = "annulee";
    f.paymentStatus = "UNPAID";

    // Ajouter une entrée dans l'historique des transitions
    invoiceService.addInvoiceHistory(
      f, "ANNULEE", from, "annulee", req.user,
      `Annulation manuelle par ${req.user?.email || "?"}`,
    );

    await f.save();
    res.json({ message: "Facture annulée", facture: f });
  } catch (err) {
    logger.error("[factureController] deleteFacture:", err);
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Stats ────────────────────────────────────────────────────────────────────

const getStats = async (req, res) => {
  try {
    const [total, payees, enAttente, brouillons, annulees, echecs, remboursees, chiffre, chiffrePatient] =
      await Promise.all([
        Facture.countDocuments(),
        Facture.countDocuments({ statut: "payee" }),
        Facture.countDocuments({ statut: { $in: ["en_attente", "emise"] } }),
        Facture.countDocuments({ statut: "brouillon" }),
        Facture.countDocuments({ statut: "annulee" }),
        Facture.countDocuments({ paymentStatus: "FAILED" }),
        Facture.countDocuments({ statut: { $in: ["remboursee", "partiellement_remboursee"] } }),
        Facture.aggregate([
          { $match: { $or: [{ paymentStatus: "SUCCEEDED" }, { statut: "payee" }] } },
          { $group: { _id: null, total: { $sum: "$montantTotal" } } },
        ]),
        Facture.aggregate([
          { $match: { $or: [{ paymentStatus: "SUCCEEDED" }, { statut: "payee" }] } },
          { $group: { _id: null, total: { $sum: "$montantPatient" } } },
        ]),
      ]);

    res.json({
      total,
      parStatut: { payees, enAttente, brouillons, annulees, echecs, remboursees },
      chiffreAffaires:     chiffre[0]?.total        || 0,
      encaissementPatient: chiffrePatient[0]?.total  || 0,
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─── Recalcul des montants à zéro ────────────────────────────────────────────

const recalculateAmounts = async (req, res) => {
  try {
    const factures = await Facture.find({ montantTotal: { $lte: 0 } }).lean();
    if (factures.length === 0) return res.json({ message: "Aucune facture à corriger", fixed: 0, errors: 0 });

    let fixed = 0;
    let errors = 0;
    const details = [];

    for (const f of factures) {
      const transport = await Transport.findById(f.transportId).lean();
      if (!transport) { errors++; details.push({ id: f._id, numero: f.numero, error: "Transport introuvable" }); continue; }

      let tarif;
      try {
        tarif = await tarifService.calculerTarif(transport);
      } catch (_) {
        try {
          tarif = await tarifService.calculerTarif({
            ...transport,
            adresseDepart: { coordonnees: null },
            adresseDestination: { coordonnees: null },
          });
        } catch (err2) { errors++; details.push({ id: f._id, numero: f.numero, error: err2.message }); continue; }
      }

      const taux         = tarif.tauxPriseEnCharge ?? f.tauxPriseEnCharge ?? 65;
      const montantBase  = Math.round((tarif.bareme.forfait + tarif.bareme.prixKm * tarif.distanceFacturee) * 100) / 100;
      const majoration   = tarif.supplements ?? 0;
      const montantTotal = Math.round((montantBase + majoration) * 100) / 100;
      const montantCPAM  = Math.round(montantTotal * taux) / 100;
      const montantPatient = Math.round((montantTotal - montantCPAM) * 100) / 100;

      await Facture.findByIdAndUpdate(f._id, {
        montantBase, majoration, montantTotal, tauxPriseEnCharge: taux,
        montantCPAM, montantPatient,
        distanceKm: tarif.distanceFacturee,
        detailsCalcul: { sourceDistance: tarif.sourceDistance, bareme: tarif.bareme, lignes: tarif.details },
      });

      fixed++;
      details.push({ id: f._id, numero: f.numero, montantTotal, sourceDistance: tarif.sourceDistance });
    }

    res.json({ message: `${fixed} facture(s) recalculée(s)`, fixed, errors, details });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

module.exports = {
  getFactures,
  getFacture,
  createFacture,
  createFromTransport,
  updateFacture,
  updateStatut,
  issueFacture,
  refundFacture,
  downloadInvoicePdf,
  downloadReceiptPdf,
  getHistory,
  deleteFacture,
  getStats,
  recalculateAmounts,
};
