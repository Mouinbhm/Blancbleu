/**
 * BlancBleu — Contrôleur Transport
 * Remplace interventionController.js
 */

const mongoose = require("mongoose");
const path = require("path");
const Transport = require("../models/Transport");
const Notification = require("../models/Notification");
const Vehicle = require("../models/Vehicle");
const Patient = require("../models/Patient");
const lifecycle = require("../services/transportLifecycle");
const { audit } = require("../services/auditService");
const { TransportStateMachine } = require("../services/transportStateMachine");
const recurrenceService = require("../services/recurrenceService");
const { hashDeterministic } = require("../utils/hashing");
const tarifService = require("../services/tarifService");
const { geocodeTransport } = require("../utils/geocodeUtils");
const { generateMissionPdf } = require("../services/missionPdfService");
const transportNotif = require("../services/transportNotificationService");
const { fileUrl: resolveFileUrl } = require("../middleware/upload");

const logger = (() => {
  try {
    return require("../utils/logger");
  } catch {
    return console;
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports/estimation — Estimation tarifaire CPAM (formulaire)
// Paramètres : typeTransport, lat1, lng1, lat2, lng2, allerRetour, heureRDV, dateTransport
// ─────────────────────────────────────────────────────────────────────────────
const estimerTarif = async (req, res, next) => {
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
        message: "Coordonnées GPS manquantes : lat1, lng1, lat2, lng2 sont obligatoires",
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
      tauxPriseEnCharge: tauxPriseEnCharge ? parseInt(tauxPriseEnCharge, 10) : 65,
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
const getTransports = async (req, res, next) => {
  try {
    const {
      statut,
      typeTransport,
      motif,
      date,
      dateDebut,
      dateFin,
      origine,
      search,
      limit = 50,
      page = 1,
    } = req.query;
    const filter = { deletedAt: null };

    if (statut) {
      const statuts = String(statut)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      filter.statut = statuts.length === 1 ? statuts[0] : { $in: statuts };
    }
    if (typeTransport) filter.typeTransport = typeTransport;
    if (motif) filter.motif = motif;
    if (origine) filter.origine = origine;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { "patient.nom": re },
        { "patient.prenom": re },
        { "patient.telephone": re },
        { numero: re },
      ];
    }
    if (date) {
      const d = new Date(date);
      const fin = new Date(date);
      fin.setDate(fin.getDate() + 1);
      filter.dateTransport = { $gte: d, $lt: fin };
    } else if (dateDebut || dateFin) {
      filter.dateTransport = {};
      if (dateDebut) filter.dateTransport.$gte = new Date(dateDebut);
      if (dateFin) filter.dateTransport.$lte = new Date(dateFin + "T23:59:59");
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
    return next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports/stats
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res, next) => {
  try {
    const [total, enCours, planifies, completes, annules, noShows, parType, parMotif] =
      await Promise.all([
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
    return next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transports/:id
// ─────────────────────────────────────────────────────────────────────────────
const getTransport = async (req, res, next) => {
  try {
    const transport = await Transport.findById(req.params.id)
      .populate("vehicule", "nom type statut immatriculation position carburant kilometrage")
      .populate("chauffeur", "nom prenom email telephone")
      .populate("createdBy", "nom prenom")
      .populate(
        "patientId",
        "nom prenom telephone mobilite numeroPatient oxygene brancardage accompagnateur contactUrgence",
      )
      .populate(
        "prescriptionId",
        "numero statut motif dateEmission dateExpiration medecin validee",
      );

    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    const transitions = TransportStateMachine.transitionsPossibles(transport.statut);
    const progression = TransportStateMachine.progression(transport.statut);

    res.json({ ...transport.toJSON(), transitions, progression });
  } catch (err) {
    return next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transports — Créer un transport
// Géocode automatiquement les adresses si les coordonnées GPS sont absentes.
// ─────────────────────────────────────────────────────────────────────────────
const createTransport = async (req, res, next) => {
  try {
    const body = { ...req.body };

    // ── Géocodage automatique (best-effort) ──────────────────────────────────
    // Si le formulaire a déjà envoyé des coordonnées (via autocomplétion BAN),
    // on ne refait pas d'appel réseau. Sinon, on tente de les obtenir côté serveur.
    const departSansGPS = !body.adresseDepart?.coordonnees?.lat;
    const destSansGPS = !body.adresseDestination?.coordonnees?.lat;

    if (departSansGPS || destSansGPS) {
      try {
        const [geoDepart, geoDest] = await geocodeTransport(
          departSansGPS ? body.adresseDepart : null,
          destSansGPS ? body.adresseDestination : null,
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
          // Chercher par hash déterministe — numeroSecu est chiffré (AES-GCM non-déterministe)
          conditions.push({ numeroSecuHash: hashDeterministic(patientData.numeroSecu) });
        }
        const nomEsc = patientData.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const prenomEsc = (patientData.prenom || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        conditions.push({
          nom: { $regex: new RegExp(`^${nomEsc}$`, "i") },
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
            nom: patientData.nom,
            prenom: patientData.prenom || "",
            dateNaissance: patientData.dateNaissance || null,
            telephone: patientData.telephone || "",
            numeroSecu: patientData.numeroSecu?.trim() || "",
            mobilite: patientData.mobilite || "ASSIS",
            oxygene: patientData.oxygene || false,
            brancardage: patientData.brancardage || false,
            accompagnateur: patientData.accompagnateur || false,
            antecedents: patientData.antecedents || "",
            notes: patientData.notes || "",
            actif: true,
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
    return next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transports/recurrents — Créer une série de transports récurrents
// ─────────────────────────────────────────────────────────────────────────────
const creerTransportsRecurrents = async (req, res, next) => {
  try {
    const { recurrence, ...baseData } = req.body;

    // Validation minimale avant de déléguer au service
    if (!recurrence || !recurrence.joursSemaine || !recurrence.dateFin) {
      return res.status(400).json({
        message: "Les paramètres de récurrence sont obligatoires : joursSemaine et dateFin",
      });
    }

    const resultat = await recurrenceService.creerSerieRecurrente(baseData, recurrence, req.user);

    res.status(201).json({
      message: `Série créée avec succès : ${resultat.nbOccurrences} transport(s) généré(s)${
        resultat.nbExclus > 0 ? `, ${resultat.nbExclus} jour(s) férié(s) exclu(s)` : ""
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
    return next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/transports/:id — Modifier un transport (champs autorisés uniquement)
// ─────────────────────────────────────────────────────────────────────────────
const UPDATE_WHITELIST = [
  "notes",
  "heureDepart",
  "allerRetour",
  "adresseDepart",
  "adresseDestination",
  "tauxPriseEnCharge",
];

const updateTransport = async (req, res, next) => {
  try {
    const updates = {};
    for (const key of UPDATE_WHITELIST) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const transport = await Transport.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    res.json(transport);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/transports/:id — Soft delete
// ─────────────────────────────────────────────────────────────────────────────
const deleteTransport = async (req, res, next) => {
  try {
    const transport = await Transport.findById(req.params.id);
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    await Transport.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    logger.info("Transport supprimé (soft-delete)", {
      numero: transport.numero,
      suppresseur: req.user?._id,
    });
    res.json({ message: "Transport supprimé" });
  } catch (err) {
    return next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Actions lifecycle
// ─────────────────────────────────────────────────────────────────────────────
const confirmer = async (req, res, next) => {
  try {
    const r = await lifecycle.confirmerTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const planifier = async (req, res, next) => {
  try {
    const r = await lifecycle.planifierTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const assigner = async (req, res, next) => {
  try {
    const { shiftId, vehiculeId, chauffeurId, auto } = req.body;
    const r = await lifecycle.assignerVehicule(
      req.params.id,
      { shiftId, vehiculeId, chauffeurId, auto },
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const enRoute = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerEnRoute(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const arriveePatient = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerArriveePatient(req.params.id, req.body.position, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const patientABord = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerPatientABord(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const arriveeDestination = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerArriveeDestination(req.params.id, req.body.position, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const completer = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.completerTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const noShow = async (req, res, next) => {
  try {
    const r = await lifecycle.marquerNoShow(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const annuler = async (req, res, next) => {
  try {
    const r = await lifecycle.annulerTransport(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};
const reprogrammer = async (req, res, next) => {
  try {
    const r = await lifecycle.reprogrammerTransport(req.params.id, req.body, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const demarrerAttente = async (req, res, next) => {
  try {
    const r = await lifecycle.demarrerAttenteDestination(
      req.params.id,
      req.body.dureeAttenteMinutes != null ? parseInt(req.body.dureeAttenteMinutes) : null,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const demarrerRetour = async (req, res, next) => {
  try {
    const r = await lifecycle.demarrerRetourBase(
      req.params.id,
      req.body.position || null,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const accepterDriver = async (req, res, next) => {
  try {
    const r = await lifecycle.accepterDriver(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const refuserDriver = async (req, res, next) => {
  try {
    const r = await lifecycle.refuserDriver(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

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

const fail = async (req, res, next) => {
  try {
    const r = await lifecycle.marquerFailed(req.params.id, req.body.raison, req.user);
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
      const PatientModel = require("../models/Patient");
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

// ── Garde-fou date : transitions terrain uniquement ──────────────────────────
// Bloque EN_ROUTE / ARRIVED / ON_BOARD / DESTINATION / COMPLETE si le transport
// n'est pas planifié aujourd'hui.
// Contournable avec { bypass_date_check: true } en développement uniquement.
async function _verifierDateTerrain(transportId, body = {}) {
  if (body.bypass_date_check && process.env.NODE_ENV !== "production") return null;

  const t = await Transport.findById(transportId).select("dateTransport heureRDV");
  if (!t?.dateTransport) return null;

  const jourTransport = new Date(t.dateTransport);
  jourTransport.setHours(0, 0, 0, 0);

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const estJourJ = jourTransport.getTime() === debutJour.getTime();
  if (estJourJ) return null;

  const dateStr = new Date(t.dateTransport).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    message: `Ce transport est planifié le ${dateStr}. Les actions terrain ne sont disponibles qu'à cette date.`,
    code: "TRANSPORT_DATE_FUTURE",
    dateTransport: t.dateTransport,
  };
}

function _handleErr(res, next, e) {
  // Erreurs typées (AppError + sous-classes) — statusCode porté par la classe.
  if (e && typeof e.statusCode === "number") {
    return res.status(e.statusCode).json({ message: e.message });
  }
  if (e.message?.includes("introuvable")) return res.status(404).json({ message: e.message });
  if (e.message?.includes("Transition invalide") || e.message?.includes("Conditions non remplies"))
    return res.status(422).json({ message: e.message });
  if (e.message?.includes("Aucun véhicule")) return res.status(409).json({ message: e.message });
  return next(e);
}

// ══════════════════════════════════════════════════════════════════════════════
// PART A — GET /api/transports/:id/timeline
// ══════════════════════════════════════════════════════════════════════════════
const getTimeline = async (req, res, next) => {
  try {
    const timeline = await lifecycle.getTransportTimeline(req.params.id);
    res.json({ success: true, timeline });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// PART B — POST /api/transports/:id/signature
// ══════════════════════════════════════════════════════════════════════════════
const addSignature = async (req, res, next) => {
  try {
    const { signedByName, signatureBase64, consentText } = req.body;

    if (!signedByName?.trim()) {
      return res
        .status(400)
        .json({
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

// ══════════════════════════════════════════════════════════════════════════════
// PART C — POST /api/transports/:id/pmt
// ══════════════════════════════════════════════════════════════════════════════
const uploadPmt = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Fichier requis (champ 'file')", code: "MISSING_FILE" });
    }

    const relPath = `pmt/${req.file.filename}`;
    const url = resolveFileUrl(req, relPath);
    const triggerOcr = req.body.triggerOcr === "true" || req.body.triggerOcr === true;

    const { transport } = await lifecycle.uploadPmtDocument(req.params.id, {
      fileUrl: url,
      fileName: req.file.originalname,
      uploadedBy: req.user._id,
      triggerOcr,
    });

    transportNotif.notifyPmtUploaded(transport, req.file.originalname).catch(() => {});

    const addedDoc = transport.pmtDocuments[transport.pmtDocuments.length - 1];
    res.status(201).json({ success: true, message: "PMT ajoutée avec succès", document: addedDoc });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

// GET /api/transports/:id/pmt
const getPmt = async (req, res, next) => {
  try {
    const transport = await Transport.findById(req.params.id).select("pmtDocuments numero");
    if (!transport)
      return res.status(404).json({ success: false, message: "Transport introuvable" });
    res.json({ success: true, documents: transport.pmtDocuments || [] });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

// DELETE /api/transports/:id/pmt/:docId
const deletePmt = async (req, res, next) => {
  try {
    await lifecycle.deletePmtDocument(req.params.id, req.params.docId, req.user);
    res.json({ success: true, message: "Document PMT supprimé" });
  } catch (e) {
    if (e.message?.includes("introuvable"))
      return res.status(404).json({ success: false, message: e.message });
    _handleErr(res, next, e);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// PART D — GET /api/transports/:id/pdf
// ══════════════════════════════════════════════════════════════════════════════
const exportPdf = async (req, res, next) => {
  try {
    // Contrôle d'accès : admin, dispatcher, superviseur, ou chauffeur assigné
    const transport = await Transport.findById(req.params.id).select("chauffeur patientId");
    if (!transport)
      return res.status(404).json({ success: false, message: "Transport introuvable" });

    const user = req.user;
    const isStaff = ["admin", "dispatcher", "superviseur"].includes(user.role);
    const isDriver = transport.chauffeur?.toString() === user._id?.toString();
    const isPatient = transport.patientId?.toString() === user._id?.toString();

    if (!isStaff && !isDriver && !isPatient) {
      return res
        .status(403)
        .json({ success: false, message: "Accès non autorisé à ce document", code: "FORBIDDEN" });
    }

    const pdfBuffer = await generateMissionPdf(req.params.id);
    const numero = transport.numero || req.params.id;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mission_${numero}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// PART E — GET /api/transports/notifications
// ══════════════════════════════════════════════════════════════════════════════
const getNotifications = async (req, res, next) => {
  try {
    const user = req.user;
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const onlyUnread = req.query.unread === "true";

    const query = {
      $or: [{ recipientId: user._id }, { recipientRole: user.role }],
    };
    if (onlyUnread) query.read = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({ ...query, read: false });

    res.json({ success: true, notifications, unreadCount });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

// PATCH /api/transports/notifications/:id/read
const markNotificationRead = async (req, res, next) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true, readAt: new Date() });
    res.json({ success: true, message: "Notification marquée comme lue" });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

// PATCH /api/transports/notifications/read-all
const markAllNotificationsRead = async (req, res, next) => {
  try {
    const user = req.user;
    await Notification.updateMany(
      { $or: [{ recipientId: user._id }, { recipientRole: user.role }], read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    res.json({ success: true, message: "Toutes les notifications marquées comme lues" });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

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
  accepterDriver,
  refuserDriver,
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
  billingPending,
  paid,
  fail,
  facturer,
  // PART A
  getTimeline,
  // PART B
  addSignature,
  // PART C
  uploadPmt,
  getPmt,
  deletePmt,
  // PART D
  exportPdf,
  // PART E
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
