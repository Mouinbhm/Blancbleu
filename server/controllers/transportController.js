/**
 * BlancBleu — Contrôleur Transport
 * Remplace interventionController.js
 */

const mongoose = require("mongoose");
const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const Patient = require("../models/Patient");
const lifecycle = require("../services/transportLifecycle");
const { audit } = require("../services/auditService");
const { TransportStateMachine } = require("../services/transportStateMachine");
const recurrenceService = require("../services/recurrenceService");
const tarifService = require("../services/tarifService");
const { geocodeTransport } = require("../utils/geocodeUtils");

const logger = (() => {
  try { return require("../utils/logger"); } catch { return console; }
})();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports/estimation — Estimation tarifaire CPAM (formulaire)
// Paramètres : typeTransport, lat1, lng1, lat2, lng2, allerRetour, heureRDV, dateTransport
// ─────────────────────────────────────────────────────────────────────────────
const estimerTarif = async (req, res) => {
  try {
    const {
      typeTransport,
      lat1,
      lng1,
      lat2,
      lng2,
      allerRetour,
      heureRDV,
      dateTransport,
      tauxPriseEnCharge,
    } = req.query;

    // Validation des paramètres obligatoires
    const typesValides = ["VSL", "TPMR", "AMBULANCE"];
    if (!typeTransport || !typesValides.includes(typeTransport)) {
      return res.status(400).json({
        message: `Paramètre typeTransport invalide. Valeurs : ${typesValides.join(", ")}`,
      });
    }
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return res.status(400).json({
        message:
          "Coordonnées GPS manquantes : lat1, lng1, lat2, lng2 sont obligatoires",
      });
    }

    const lat1f = parseFloat(lat1);
    const lng1f = parseFloat(lng1);
    const lat2f = parseFloat(lat2);
    const lng2f = parseFloat(lng2);

    if ([lat1f, lng1f, lat2f, lng2f].some(isNaN)) {
      return res
        .status(400)
        .json({ message: "Les coordonnées GPS doivent être des nombres valides" });
    }

    // Construction d'un objet transport fictif pour le service de tarification
    const transportFictif = {
      typeTransport,
      adresseDepart: { coordonnees: { lat: lat1f, lng: lng1f } },
      adresseDestination: { coordonnees: { lat: lat2f, lng: lng2f } },
      allerRetour: allerRetour === "true",
      heureRDV: heureRDV || null,
      dateTransport: dateTransport ? new Date(dateTransport) : new Date(),
      tauxPriseEnCharge: tauxPriseEnCharge
        ? parseInt(tauxPriseEnCharge, 10)
        : 65,
    };

    const estimation = await tarifService.calculerTarif(transportFictif);

    res.json({
      estimation,
      estEstimation: true, // Indique que c'est une valeur approximative
      avertissement:
        estimation.sourceDistance === "haversine"
          ? "Distance calculée à vol d'oiseau (OSRM indisponible) — estimation approximative"
          : null,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports — Liste avec filtres
// ─────────────────────────────────────────────────────────────────────────────
const getTransports = async (req, res) => {
  try {
    const {
      statut,
      typeTransport,
      motif,
      date,
      limit = 50,
      page = 1,
    } = req.query;
    const filter = { deletedAt: null };

    if (statut) {
      const statuts = String(statut).split(",").map((s) => s.trim()).filter(Boolean);
      filter.statut = statuts.length === 1 ? statuts[0] : { $in: statuts };
    }
    if (typeTransport) filter.typeTransport = typeTransport;
    if (motif) filter.motif = motif;
    if (date) {
      const d = new Date(date);
      const fin = new Date(date);
      fin.setDate(fin.getDate() + 1);
      filter.dateTransport = { $gte: d, $lt: fin };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transports, total] = await Promise.all([
      Transport.find(filter)
        .populate("vehicule", "nom type statut immatriculation")
        .populate("chauffeur", "nom prenom")
        .populate("createdBy", "nom prenom")
        .populate("patientId", "nom prenom telephone mobilite numeroPatient")
        .populate("prescriptionId", "numero statut motif dateExpiration")
        .sort({ dateTransport: 1, heureRDV: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transport.countDocuments(filter),
    ]);

    res.json({
      transports,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports/stats
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [
      total,
      enCours,
      planifies,
      completes,
      annules,
      noShows,
      parType,
      parMotif,
    ] = await Promise.all([
      Transport.countDocuments({ deletedAt: null }),
      Transport.countDocuments({
        deletedAt: null,
        statut: {
          $in: [
            "ASSIGNED",
            "EN_ROUTE_TO_PICKUP",
            "ARRIVED_AT_PICKUP",
            "PATIENT_ON_BOARD",
            "ARRIVED_AT_DESTINATION",
          ],
        },
      }),
      Transport.countDocuments({
        deletedAt: null,
        statut: { $in: ["REQUESTED", "CONFIRMED", "SCHEDULED"] },
      }),
      Transport.countDocuments({ deletedAt: null, statut: "COMPLETED" }),
      Transport.countDocuments({ deletedAt: null, statut: "CANCELLED" }),
      Transport.countDocuments({ deletedAt: null, statut: "NO_SHOW" }),
      Transport.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$typeTransport", count: { $sum: 1 } } },
      ]),
      Transport.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$motif", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    res.json({
      total,
      parStatut: { enCours, planifies, completes, annules, noShows },
      parType: parType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
      parMotif,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports/:id
// ─────────────────────────────────────────────────────────────────────────────
const getTransport = async (req, res) => {
  try {
    const transport = await Transport.findById(req.params.id)
      .populate("vehicule", "nom type statut immatriculation position carburant kilometrage")
      .populate("chauffeur", "nom prenom email telephone")
      .populate("createdBy", "nom prenom")
      .populate("patientId", "nom prenom telephone mobilite numeroPatient oxygene brancardage accompagnateur contactUrgence")
      .populate("prescriptionId", "numero statut motif dateEmission dateExpiration medecin validee");

    if (!transport)
      return res.status(404).json({ message: "Transport introuvable" });

    const transitions = TransportStateMachine.transitionsPossibles(
      transport.statut,
    );
    const progression = TransportStateMachine.progression(transport.statut);

    res.json({ ...transport.toJSON(), transitions, progression });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transports — Créer un transport
// Géocode automatiquement les adresses si les coordonnées GPS sont absentes.
// ─────────────────────────────────────────────────────────────────────────────
const createTransport = async (req, res) => {
  try {
    const body = { ...req.body };

    // ── Géocodage automatique (best-effort) ──────────────────────────────────
    // Si le formulaire a déjà envoyé des coordonnées (via autocomplétion BAN),
    // on ne refait pas d'appel réseau. Sinon, on tente de les obtenir côté serveur.
    const departSansGPS = !body.adresseDepart?.coordonnees?.lat;
    const destSansGPS   = !body.adresseDestination?.coordonnees?.lat;

    if (departSansGPS || destSansGPS) {
      try {
        const [geoDepart, geoDest] = await geocodeTransport(
          departSansGPS ? body.adresseDepart : null,
          destSansGPS   ? body.adresseDestination : null,
        );

        if (departSansGPS && geoDepart) {
          body.adresseDepart = {
            ...body.adresseDepart,
            coordonnees: { lat: geoDepart.lat, lng: geoDepart.lng },
          };
          logger.info("[Géocodage] Départ résolu", {
            label: geoDepart.label,
            score: geoDepart.score,
          });
        } else if (departSansGPS) {
          logger.warn("[Géocodage] Coordonnées départ indisponibles", {
            adresse: body.adresseDepart?.rue,
          });
        }

        if (destSansGPS && geoDest) {
          body.adresseDestination = {
            ...body.adresseDestination,
            coordonnees: { lat: geoDest.lat, lng: geoDest.lng },
          };
          logger.info("[Géocodage] Destination résolue", {
            label: geoDest.label,
            score: geoDest.score,
          });
        } else if (destSansGPS) {
          logger.warn("[Géocodage] Coordonnées destination indisponibles", {
            adresse: body.adresseDestination?.rue,
          });
        }
      } catch (geoErr) {
        // Géocodage non bloquant — le transport est créé même sans coordonnées
        logger.warn("[Géocodage] Erreur inattendue, coordonnées omises", {
          err: geoErr.message,
        });
      }
    }

    const transport = await Transport.create({
      ...body,
      createdBy: req.user._id,
    });

    // ── Auto-création du patient dans la collection Patient (best-effort) ─────
    const patientData = body.patient;
    if (patientData?.nom) {
      try {
        const conditions = [];
        if (patientData.numeroSecu?.trim()) {
          conditions.push({ numeroSecu: patientData.numeroSecu.trim() });
        }
        const nomEsc    = patientData.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const prenomEsc = (patientData.prenom || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        conditions.push({
          nom:    { $regex: new RegExp(`^${nomEsc}$`, "i") },
          prenom: { $regex: new RegExp(`^${prenomEsc}$`, "i") },
        });

        const existant = await Patient.findOne({ $or: conditions });

        if (existant) {
          // Lier silencieusement si la référence était absente
          if (!transport.patientId) {
            await Transport.findByIdAndUpdate(transport._id, { patientId: existant._id });
          }
        } else {
          const nouveauPatient = await Patient.create({
            nom:            patientData.nom,
            prenom:         patientData.prenom         || "",
            dateNaissance:  patientData.dateNaissance  || null,
            telephone:      patientData.telephone      || "",
            numeroSecu:     patientData.numeroSecu?.trim() || "",
            mobilite:       patientData.mobilite       || "ASSIS",
            oxygene:        patientData.oxygene        || false,
            brancardage:    patientData.brancardage    || false,
            accompagnateur: patientData.accompagnateur || false,
            antecedents:    patientData.antecedents    || "",
            notes:          patientData.notes          || "",
            actif:          true,
          });
          await Transport.findByIdAndUpdate(transport._id, { patientId: nouveauPatient._id });
          logger.info(`[Patient] Auto-créé : ${patientData.nom} ${patientData.prenom || ""}`, {
            patientId: nouveauPatient._id,
            transportId: transport._id,
          });
        }
      } catch (patientErr) {
        // Non bloquant — le transport est déjà créé
        logger.warn("[Patient] Auto-création échouée", {
          err: patientErr.message,
          transportId: transport._id,
        });
      }
    }

    await audit.transportCree(transport, req.user);

    res.status(201).json({ message: "Transport créé", transport });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transports/recurrents — Créer une série de transports récurrents
// ─────────────────────────────────────────────────────────────────────────────
const creerTransportsRecurrents = async (req, res) => {
  try {
    const { recurrence, ...baseData } = req.body;

    // Validation minimale avant de déléguer au service
    if (
      !recurrence ||
      !recurrence.joursSemaine ||
      !recurrence.dateFin
    ) {
      return res.status(400).json({
        message:
          "Les paramètres de récurrence sont obligatoires : joursSemaine et dateFin",
      });
    }

    const resultat = await recurrenceService.creerSerieRecurrente(
      baseData,
      recurrence,
      req.user,
    );

    res.status(201).json({
      message: `Série créée avec succès : ${resultat.nbOccurrences} transport(s) généré(s)${
        resultat.nbExclus > 0
          ? `, ${resultat.nbExclus} jour(s) férié(s) exclu(s)`
          : ""
      }`,
      nbOccurrences: resultat.nbOccurrences,
      nbExclus: resultat.nbExclus,
      transportParentId: resultat.transportParentId,
      transports: resultat.transports,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    // Erreurs métier levées explicitement par le service
    if (
      err.message.includes("Veuillez") ||
      err.message.includes("obligatoire") ||
      err.message.includes("Aucune occurrence") ||
      err.message.includes("postérieure") ||
      err.message.includes("invalide")
    ) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/transports/:id — Modifier un transport
// ─────────────────────────────────────────────────────────────────────────────
const updateTransport = async (req, res) => {
  try {
    const transport = await Transport.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    if (!transport)
      return res.status(404).json({ message: "Transport introuvable" });
    res.json(transport);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/transports/:id — Soft delete
// ─────────────────────────────────────────────────────────────────────────────
const deleteTransport = async (req, res) => {
  try {
    await Transport.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ message: "Transport supprimé" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Actions lifecycle
// ─────────────────────────────────────────────────────────────────────────────
const confirmer = async (req, res) => {
  try {
    const r = await lifecycle.confirmerTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const planifier = async (req, res) => {
  try {
    const r = await lifecycle.planifierTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const assigner = async (req, res) => {
  try {
    const { vehiculeId, chauffeurId, auto } = req.body;
    const r = await lifecycle.assignerVehicule(
      req.params.id,
      { vehiculeId, chauffeurId, auto },
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const enRoute = async (req, res) => {
  try {
    const r = await lifecycle.marquerEnRoute(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const arriveePatient = async (req, res) => {
  try {
    const r = await lifecycle.marquerArriveePatient(
      req.params.id,
      req.body.position,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const patientABord = async (req, res) => {
  try {
    const r = await lifecycle.marquerPatientABord(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const arriveeDestination = async (req, res) => {
  try {
    const r = await lifecycle.marquerArriveeDestination(
      req.params.id,
      req.body.position,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const completer = async (req, res) => {
  try {
    const r = await lifecycle.completerTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const noShow = async (req, res) => {
  try {
    const r = await lifecycle.marquerNoShow(
      req.params.id,
      req.body.raison,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const annuler = async (req, res) => {
  try {
    const r = await lifecycle.annulerTransport(
      req.params.id,
      req.body.raison,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};
const reprogrammer = async (req, res) => {
  try {
    const r = await lifecycle.reprogrammerTransport(
      req.params.id,
      req.body,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};

const demarrerAttente = async (req, res) => {
  try {
    const r = await lifecycle.demarrerAttenteDestination(
      req.params.id,
      req.body.dureeAttenteMinutes != null ? parseInt(req.body.dureeAttenteMinutes) : null,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};

const demarrerRetour = async (req, res) => {
  try {
    const r = await lifecycle.demarrerRetourBase(
      req.params.id,
      req.body.position || null,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};

const facturer = async (req, res) => {
  if (!["superviseur", "admin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Clôture CPAM réservée aux superviseurs et administrateurs" });
  }
  try {
    const { referenceFacture, factureId: factureIdBody } = req.body;
    const Facture = require("../models/Facture");

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
        adresseDepart:      { coordonnees: null },
        adresseDestination: { coordonnees: null },
      });
    }

    // montantBase = forfait + (prix/km × distance facturée)
    const montantBase = Math.round(
      (tarif.bareme.forfait + tarif.bareme.prixKm * tarif.distanceFacturee) * 100,
    ) / 100;

    // ── Résoudre l'ObjectId facture ───────────────────────────────────────────
    let factureIdValide = transport.facture || null;
    if (factureIdBody && mongoose.Types.ObjectId.isValid(factureIdBody)) {
      factureIdValide = factureIdBody;
    }

    if (!factureIdValide) {
      // Créer la facture avec les vrais montants calculés
      const nouvelleFacture = await Facture.create({
        transportId:       transport._id,
        patientId:         transport.patientId || null,
        patientNom:        transport.patient?.nom   || "",
        patientPrenom:     transport.patient?.prenom || "",
        motif:             transport.motif    || "",
        typeVehicule:      transport.typeTransport || "VSL",
        allerRetour:       transport.allerRetour   || false,
        distanceKm:        tarif.distanceFacturee,
        montantBase,
        majoration:        tarif.supplements,
        tauxPriseEnCharge: tarif.tauxPriseEnCharge,
        // montantTotal, montantCPAM, montantPatient calculés par le hook pre-save
        statut:            "emise",
        dateEmission:      new Date(),
        referenceExterne:  referenceFacture || null,
        detailsCalcul:     {
          sourceDistance: tarif.sourceDistance,
          bareme:         tarif.bareme,
          lignes:         tarif.details,
        },
        notes: referenceFacture ? `Réf. CPAM : ${referenceFacture}` : "",
      });

      factureIdValide = nouvelleFacture._id;
      await Transport.findByIdAndUpdate(transport._id, { facture: factureIdValide });

      logger.info("Facture créée — clôture BILLED", {
        transport:     transport.numero,
        facture:       nouvelleFacture.numero,
        montantTotal:  nouvelleFacture.montantTotal,
        distanceKm:    tarif.distanceFacturee,
        source:        tarif.sourceDistance,
      });
    } else {
      // Mettre à jour les montants de la facture existante
      // findByIdAndUpdate ne déclenche pas le hook pre-save → setter tous les champs
      await Facture.findByIdAndUpdate(factureIdValide, {
        distanceKm:        tarif.distanceFacturee,
        montantBase,
        majoration:        tarif.supplements,
        tauxPriseEnCharge: tarif.tauxPriseEnCharge,
        montantTotal:      tarif.montantTotal,
        montantCPAM:       tarif.montantCPAM,
        montantPatient:    tarif.montantPatient,
        referenceExterne:  referenceFacture || undefined,
        detailsCalcul:     {
          sourceDistance: tarif.sourceDistance,
          bareme:         tarif.bareme,
          lignes:         tarif.details,
        },
      });

      logger.info("Facture existante mise à jour — clôture BILLED", {
        transport:    transport.numero,
        factureId:    factureIdValide,
        montantTotal: tarif.montantTotal,
      });
    }

    // ── Transition COMPLETED → BILLED ─────────────────────────────────────────
    const r = await lifecycle.cloturerFacturation(req.params.id, factureIdValide, req.user);

    // Stocker la référence texte CPAM (champ séparé, jamais casté en ObjectId)
    if (referenceFacture) {
      await Transport.findByIdAndUpdate(req.params.id, {
        referenceFactureCPAM: String(referenceFacture).trim(),
      });
    }

    res.json(r);
  } catch (e) {
    _handleErr(res, e);
  }
};

function _handleErr(res, e) {
  if (e.message?.includes("introuvable"))
    return res.status(404).json({ message: e.message });
  if (
    e.message?.includes("Transition invalide") ||
    e.message?.includes("Conditions non remplies")
  )
    return res.status(422).json({ message: e.message });
  if (e.message?.includes("Aucun véhicule"))
    return res.status(409).json({ message: e.message });
  return res.status(500).json({ message: e.message });
}

module.exports = {
  getTransports,
  getStats,
  getTransport,
  estimerTarif,
  createTransport,
  creerTransportsRecurrents,
  updateTransport,
  deleteTransport,
  confirmer,
  planifier,
  assigner,
  enRoute,
  arriveePatient,
  patientABord,
  arriveeDestination,
  completer,
  noShow,
  annuler,
  reprogrammer,
  demarrerAttente,
  demarrerRetour,
  facturer,
};
