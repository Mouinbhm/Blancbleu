/**
 * BlancBleu — Facturation & clôture financière.
 *
 * PATCH /api/transports/:id/billing-pending — transition COMPLETED → BILLING_PENDING
 * PATCH /api/transports/:id/bill             — calcul tarif + création facture + BILLED
 * PATCH /api/transports/:id/paid             — réservé superviseur/admin
 */

const mongoose = require("mongoose");
const Transport = require("../../models/Transport");
const lifecycle = require("../../services/transportLifecycle");
const tarifService = require("../../services/tarifService");
const { _handleErr, logger } = require("./_shared");

const billingPending = async (req, res, next) => {
  try {
    const r = await lifecycle.marquerBillingPending(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const paid = async (req, res, next) => {
  if (!["superviseur", "admin"].includes(req.user?.role)) {
    return res
      .status(403)
      .json({ message: "Marquage payé réservé aux superviseurs et administrateurs" });
  }
  try {
    const r = await lifecycle.marquerPaid(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const facturer = async (req, res, next) => {
  if (!["superviseur", "admin"].includes(req.user?.role)) {
    return res
      .status(403)
      .json({ message: "Clôture CPAM réservée aux superviseurs et administrateurs" });
  }
  try {
    const {
      referenceFacture,
      factureId: factureIdBody,
      prescriptionId: prescriptionIdBody,
    } = req.body;
    const Facture = require("../../models/Facture");

    const transport = await Transport.findById(req.params.id);
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    // ── Calcul tarifaire CPAM 2024 (OSRM + barème) ───────────────────────────
    let tarif;
    try {
      tarif = await tarifService.calculerTarif(transport);
    } catch (tarifErr) {
      logger.warn("calculerTarif échoué, fallback 10 km", { err: tarifErr.message });
      tarif = await tarifService.calculerTarif({
        ...transport.toObject(),
        adresseDepart: { coordonnees: null },
        adresseDestination: { coordonnees: null },
      });
    }

    // montantBase = forfait + (prix/km × distance facturée)
    const montantBase =
      Math.round((tarif.bareme.forfait + tarif.bareme.prixKm * tarif.distanceFacturee) * 100) / 100;

    // ── Résoudre l'ObjectId facture ───────────────────────────────────────────
    let factureIdValide = transport.facture || null;
    if (factureIdBody && mongoose.Types.ObjectId.isValid(factureIdBody)) {
      factureIdValide = factureIdBody;
    }

    // ── Résoudre patientId si absent du transport ─────────────────────────────
    // Ordre de résolution :
    //   1. transport.patientId (lien ObjectId direct)
    //   2. Patient lié au créateur (transport créé depuis l'app patient)
    //   3. Patient trouvé par email dénormalisé (transport créé par le dispatcher)
    let resolvedPatientId = transport.patientId || null;
    if (!resolvedPatientId) {
      const PatientModel = require("../../models/Patient");
      if (transport.createdBy) {
        const p = await PatientModel.findOne({ userId: transport.createdBy, deletedAt: null })
          .select("_id")
          .lean();
        if (p) resolvedPatientId = p._id;
      }
      if (!resolvedPatientId && transport.patient?.email) {
        const p = await PatientModel.findOne({ email: transport.patient.email, deletedAt: null })
          .select("_id")
          .lean();
        if (p) resolvedPatientId = p._id;
      }
    }

    if (!factureIdValide) {
      // Créer la facture avec les vrais montants calculés
      const nouvelleFacture = await Facture.create({
        transportId: transport._id,
        patientId: resolvedPatientId,
        patientNom: transport.patient?.nom || "",
        patientPrenom: transport.patient?.prenom || "",
        motif: transport.motif || "",
        typeVehicule: transport.typeTransport || "VSL",
        allerRetour: transport.allerRetour || false,
        distanceKm: tarif.distanceFacturee,
        montantBase,
        majoration: tarif.supplements,
        tauxPriseEnCharge: tarif.tauxPriseEnCharge,
        // montantTotal, montantCPAM, montantPatient calculés par le hook pre-save
        statut: "emise",
        dateEmission: new Date(),
        referenceExterne: referenceFacture || null,
        detailsCalcul: {
          sourceDistance: tarif.sourceDistance,
          bareme: tarif.bareme,
          lignes: tarif.details,
        },
        notes: referenceFacture ? `Réf. CPAM : ${referenceFacture}` : "",
      });

      factureIdValide = nouvelleFacture._id;
      await Transport.findByIdAndUpdate(transport._id, { facture: factureIdValide });

      logger.info("Facture créée — clôture BILLED", {
        transport: transport.numero,
        facture: nouvelleFacture.numero,
        montantTotal: nouvelleFacture.montantTotal,
        distanceKm: tarif.distanceFacturee,
        source: tarif.sourceDistance,
      });
    } else {
      // Mettre à jour les montants de la facture existante
      // findByIdAndUpdate ne déclenche pas le hook pre-save → setter tous les champs
      const updateExistante = {
        distanceKm: tarif.distanceFacturee,
        montantBase,
        majoration: tarif.supplements,
        tauxPriseEnCharge: tarif.tauxPriseEnCharge,
        montantTotal: tarif.montantTotal,
        montantCPAM: tarif.montantCPAM,
        montantPatient: tarif.montantPatient,
        referenceExterne: referenceFacture || undefined,
        detailsCalcul: {
          sourceDistance: tarif.sourceDistance,
          bareme: tarif.bareme,
          lignes: tarif.details,
        },
      };
      // Compléter patientId si absent sur la facture existante
      if (resolvedPatientId) {
        const factureExistante = await Facture.findById(factureIdValide).select("patientId").lean();
        if (!factureExistante?.patientId) {
          updateExistante.patientId = resolvedPatientId;
        }
      }
      await Facture.findByIdAndUpdate(factureIdValide, updateExistante);

      logger.info("Facture existante mise à jour — clôture BILLED", {
        transport: transport.numero,
        factureId: factureIdValide,
        montantTotal: tarif.montantTotal,
      });
    }

    // ── Transition COMPLETED → BILLED ─────────────────────────────────────────
    const r = await lifecycle.cloturerFacturation(req.params.id, factureIdValide, req.user);

    // Stocker la référence texte CPAM (champ séparé, jamais casté en ObjectId)
    const updateCloture = {};
    if (referenceFacture) {
      updateCloture.referenceFactureCPAM = String(referenceFacture).trim();
    }
    // Lier la prescription sélectionnée au transport
    if (prescriptionIdBody && mongoose.Types.ObjectId.isValid(prescriptionIdBody)) {
      updateCloture.prescriptionId = prescriptionIdBody;
    }
    if (Object.keys(updateCloture).length > 0) {
      await Transport.findByIdAndUpdate(req.params.id, updateCloture);
    }

    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

module.exports = { billingPending, paid, facturer };
