/**
 * BlancBleu — Contrôleur IA v4.0
 * Transport sanitaire NON urgent
 *
 * Endpoints :
 *   POST /api/ai/pmt/extract        → Extraction PMT par OCR
 *   POST /api/ai/pmt/validate/:id   → Validation humaine d'une extraction
 *   POST /api/ai/dispatch/:id       → Recommandation véhicule pour un transport
 *   POST /api/ai/routing/optimize   → Optimisation de tournée journalière
 *   GET  /api/ai/status             → Statut du microservice IA
 */

const aiClient = require("../services/aiClient");
const { audit } = require("../services/auditService");
const socketService = require("../services/socketService");
const { geocodeTransport } = require("../utils/geocodeUtils");
const DispatchRecommendation = require("../models/DispatchRecommendation");

// ════════════════════════════════════════════════════════════════════════════
// MODULE 1 — PMT (Prescription Médicale de Transport)
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ai/pmt/extract
 * Reçoit un fichier PMT (PDF ou image) et retourne les données extraites.
 *
 * Body : multipart/form-data avec champ "pmt" (fichier)
 *
 * Réponse :
 * {
 *   extraction: { patient, medecin, typeTransport, mobilite, destination, ... },
 *   confiance: 0.87,
 *   validationRequise: false,
 *   champsManquants: []
 * }
 */
const extrairePMT = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Fichier PMT requis (champ 'pmt')" });
    }

    const result = await aiClient.extrairePMT(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname || "pmt",
    );

    // Journaliser l'extraction (données de santé — audit RGPD)
    if (req.body.transportId) {
      const Transport = require("../models/Transport");
      const transport = await Transport.findById(String(req.body.transportId));
      if (transport) {
        await audit.pmtExtraite(transport, result.extraction, result.confiance);

        // Notifier en temps réel si validation requise
        if (result.validationRequise) {
          socketService.emitPmtExtraite({
            transportId: transport._id,
            extraction: result.extraction,
            confiance: result.confiance,
          });
        }
      }
    }

    return res.json(result);
  } catch (err) {
    // Microservice non démarré → 503 avec structure de fallback
    if (err.message?.includes("indisponible")) {
      return res.status(503).json({
        message: "Service OCR temporairement indisponible",
        fallback: true,
        extraction: null,
        validationRequise: true,
      });
    }
    // Propager le code HTTP retourné par FastAPI (422, 400, 500…)
    const status = err.response?.status || 500;
    const message =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message;
    return res.status(status).json({ message: `Erreur microservice IA : ${message}` });
  }
};

/**
 * PATCH /api/ai/pmt/validate/:transportId
 * Le dispatcher valide ou corrige manuellement les données extraites de la PMT.
 *
 * Body : { extraction: { ... champs validés ... }, corrections: { ... } }
 */
const validerPMT = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const { extraction } = req.body;

    if (!extraction) {
      return res.status(400).json({ message: "extraction requise" });
    }

    // $set explicite : SEULS les champs prescription.* sont modifiés.
    // patient.mobilite, patient.nom, patient.prenom, typeTransport
    // ne sont JAMAIS touchés par cette mise à jour.
    const transport = await Transport.findByIdAndUpdate(
      req.params.transportId,
      {
        $set: {
          "prescription.validee": true,
          "prescription.extraitPar": "IA+HUMAIN",
          "prescription.contenu": extraction,
          "prescription.validePar": req.user._id,
          "prescription.valideAt": new Date(),
        },
      },
      { new: true }
    );

    if (!transport) {
      return res.status(404).json({ message: "Transport introuvable" });
    }

    await audit.pmtValidee(transport, req.user);

    return res.json({
      message: "PMT validée",
      transport: { _id: transport._id, numero: transport.numero },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// MODULE 2 — Dispatch (recommandation véhicule/chauffeur)
// ════════════════════════════════════════════════════════════════════════════

const planningLoadSvc     = require("../services/planningLoadService");
const driverPerfSvc       = require("../services/driverPerformanceService");

/**
 * POST /api/ai/dispatch/:transportId
 * Recommande le meilleur véhicule et chauffeur pour un transport.
 * Enrichit les données avec charge planning + ponctualité réelle.
 */
const recommanderDispatch = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const Vehicle   = require("../models/Vehicle");
    const Personnel = require("../models/Personnel");

    const transport = await Transport.findById(req.params.transportId);
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    // Audit — demande IA
    const userCtx = { id: req.user._id, email: req.user.email, role: req.user.role };
    await audit.iaDispatchRequis(transport, userCtx);

    const dateTransport = transport.dateTransport || new Date();

    // Pré-filtre géospatial $near sur Vehicle.location si on connaît le départ —
    // ramène en priorité 15 véhicules proches au lieu de toute la flotte.
    const candidatesQuery = { statut: "Disponible" };
    const depart = transport.adresseDepart?.coordonnees;
    let limitVehicules = 30;
    if (depart?.lat != null && depart?.lng != null) {
      candidatesQuery.location = {
        $near: {
          $geometry:     { type: "Point", coordinates: [depart.lng, depart.lat] },
          $maxDistance:  30000, // 30 km
        },
      };
      limitVehicules = 15;
    }

    const [vehicules, chauffeurs] = await Promise.all([
      Vehicle.find(candidatesQuery).limit(limitVehicules).lean(),
      Personnel.find({ statut: "Disponible", role: { $in: ["Ambulancier", "Chauffeur"] } }).lean(),
    ]);

    if (vehicules.length === 0) {
      return res.status(409).json({
        success: false,
        message: "Aucun véhicule disponible pour ce transport",
        recommendations: [],
        suggestions: [
          "Reprogrammer le transport",
          "Libérer un véhicule actuellement en mission",
          "Changer le type de véhicule demandé",
        ],
      });
    }

    // Enrichir charge planning + ponctualité en parallèle
    await Promise.all([
      ...vehicules.map(async (v) => {
        v._planningLoad = await planningLoadSvc.getVehiclePlanningLoad(v._id, dateTransport);
      }),
      ...chauffeurs.map(async (c) => {
        c.tauxPonctualite = await driverPerfSvc.getDriverPunctualityScore(c._id);
        c._planningLoad   = await planningLoadSvc.getDriverPlanningLoad(c._id, dateTransport);
      }),
    ]);

    let result;
    let fallbackUsed = false;
    try {
      result = await aiClient.recommanderDispatch(transport, vehicules, chauffeurs);
    } catch (aiErr) {
      fallbackUsed = true;
      result = _scoringLocalDispatch(transport, vehicules);
      await audit.iaDispatchFallback(transport, aiErr.message);
    }

    const best = result.bestRecommendation || result.recommandation;

    // Persister un document DispatchRecommendation (historique complet)
    let dispatchRec = null;
    if (best) {
      dispatchRec = await DispatchRecommendation.create({
        transportId: transport._id,
        source: fallbackUsed ? "fallback_node" : "ia",
        weights: result.weights || null,
        recommendations: Array.isArray(result.recommendations)
          ? result.recommendations
          : Array.isArray(result.alternatives)
            ? [best, ...result.alternatives]
            : [best],
        bestRecommendation: best,
        excludedCandidates: result.excludedCandidates || [],
        summary: result.summary || {
          totalCandidates:    vehicules.length,
          eligibleCandidates: Array.isArray(result.recommendations) ? result.recommendations.length : 1,
          excludedCandidates: Array.isArray(result.excludedCandidates) ? result.excludedCandidates.length : 0,
        },
      });

      // Sous-doc dénormalisé (rétrocompat frontend) + référence
      await Transport.findByIdAndUpdate(transport._id, {
        $set: {
          "aiDispatch.recommendedVehicleId": best.vehiculeId,
          "aiDispatch.recommendedDriverId":  best.driverId || null,
          "aiDispatch.vehicleName":          best.vehiculeName || best.immatriculation || "",
          "aiDispatch.driverName":           best.driverName || "",
          "aiDispatch.score":                best.finalScore ?? best.score ?? null,
          "aiDispatch.criteriaScores":       best.criteriaScores || null,
          "aiDispatch.explanation":          best.explanation || best.justification || [],
          "aiDispatch.risks":                best.risks || [],
          "aiDispatch.warnings":             best.warnings || [],
          "aiDispatch.source":               result.source || (fallbackUsed ? "fallback" : "ia"),
          "aiDispatch.fallbackUsed":         fallbackUsed,
          "aiDispatch.generatedAt":          new Date(),
          "aiDispatch.acceptedByDispatcher": null,
          "aiDispatch.lastRecommendationId": dispatchRec._id,
        },
      });
    }

    // Audit recommandation
    await audit.iaDispatchRecommande(transport, best, result.source || "ia", fallbackUsed);

    return res.json({ ...result, fallbackUsed, recommendationId: dispatchRec?._id || null });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/ai/dispatch/:transportId/explanation
 * Retourne la recommandation IA sauvegardée avec ses explications.
 */
const getDispatchExplanation = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const transport = await Transport.findById(req.params.transportId)
      .select("numero aiDispatch vehicule chauffeur")
      .populate("vehicule", "nom immatriculation type")
      .populate("chauffeur", "nom prenom");
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    if (!transport.aiDispatch?.generatedAt) {
      return res.status(404).json({ message: "Aucune recommandation IA générée pour ce transport" });
    }
    return res.json({ numero: transport.numero, aiDispatch: transport.aiDispatch });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/transports/:id/ai-recommendation/accept
 * Le dispatcher accepte la recommandation IA et assigne le véhicule.
 */
const accepterRecommandationIA = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const transport = await Transport.findById(req.params.id);
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    if (!transport.aiDispatch?.recommendedVehicleId) {
      return res.status(400).json({ message: "Aucune recommandation IA disponible à accepter" });
    }

    await Transport.findByIdAndUpdate(transport._id, {
      $set: {
        vehicule:                        transport.aiDispatch.recommendedVehicleId,
        chauffeur:                       transport.aiDispatch.recommendedDriverId || transport.chauffeur,
        scoreDispatch:                   transport.aiDispatch.score,
        "aiDispatch.acceptedByDispatcher": true,
        "aiDispatch.acceptedAt":         new Date(),
      },
    });

    // Tracer la décision dans la collection DispatchRecommendation
    const recId = transport.aiDispatch.lastRecommendationId;
    if (recId) {
      await DispatchRecommendation.findByIdAndUpdate(recId, {
        $set: {
          "decision.status":           "accepted",
          "decision.decidedAt":        new Date(),
          "decision.decidedBy":        req.user._id,
          "decision.finalVehiculeId":  transport.aiDispatch.recommendedVehicleId,
          "decision.finalChauffeurId": transport.aiDispatch.recommendedDriverId || null,
        },
      });
    }

    const userCtx = { id: req.user._id, email: req.user.email, role: req.user.role };
    await audit.iaDispatchAccepte(transport, userCtx);

    return res.json({ message: "Recommandation IA acceptée — véhicule assigné" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/transports/:id/ai-recommendation/reject
 * Le dispatcher refuse la recommandation IA avec une raison.
 */
const refuserRecommandationIA = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const { raison } = req.body;
    if (!raison) return res.status(400).json({ message: "raison requise" });

    const transport = await Transport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          "aiDispatch.acceptedByDispatcher": false,
          "aiDispatch.rejectedReason":       raison,
          "aiDispatch.acceptedAt":           new Date(),
        },
      },
      { new: true }
    );
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    // Tracer la décision dans la collection DispatchRecommendation
    const recId = transport.aiDispatch?.lastRecommendationId;
    if (recId) {
      await DispatchRecommendation.findByIdAndUpdate(recId, {
        $set: {
          "decision.status":          "rejected",
          "decision.decidedAt":       new Date(),
          "decision.decidedBy":       req.user._id,
          "decision.rejectionReason": raison,
        },
      });
    }

    const userCtx = { id: req.user._id, email: req.user.email, role: req.user.role };
    await audit.iaDispatchRefuse(transport, userCtx, raison);

    return res.json({ message: "Recommandation IA refusée — assignation manuelle requise" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Sérialise un sous-document adresse MongoDB en chaîne lisible pour l'API Python.
 * Pydantic attend un str, pas un objet.
 */
function _fmtAdresse(a) {
  if (!a || typeof a === "string") return a || "";
  return [a.nom, a.rue, a.ville, a.codePostal].filter(Boolean).join(", ");
}

/**
 * Scoring local de dispatch (fallback si microservice IA indisponible).
 * Basé uniquement sur les règles métier (compatibilité mobilité/véhicule).
 */
function _scoringLocalDispatch(transport, vehicules) {
  const mobilite = transport.patient?.mobilite || "ASSIS";

  // Règles de compatibilité mobilité → type de véhicule
  const compatibilite = {
    ASSIS: ["VSL", "AMBULANCE", "TPMR"],
    FAUTEUIL_ROULANT: ["TPMR"],
    ALLONGE: ["AMBULANCE"],
    CIVIERE: ["AMBULANCE"],
  };

  const typesCompatibles = compatibilite[mobilite] || ["VSL"];

  const scores = vehicules
    .filter((v) => typesCompatibles.includes(v.type))
    .map((v) => {
      let score = 60; // Base
      if (typesCompatibles[0] === v.type) score += 20; // Type optimal en premier
      if (transport.patient?.oxygene && v.oxygene) score += 10;
      if (transport.patient?.brancardage && v.brancard) score += 10;
      return { vehiculeId: v._id, immatriculation: v.immatriculation, type: v.type, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    return {
      recommandation: null,
      alternatives: [],
      source: "rules",
      message: `Aucun véhicule compatible avec mobilité ${mobilite}`,
    };
  }

  return {
    recommandation: { ...scores[0], justification: ["Règles métier locales (IA indisponible)"] },
    alternatives: scores.slice(1, 3),
    source: "rules",
  };
}

/**
 * POST /api/ai/dispatch/manual
 * Recommande un véhicule à partir d'un formulaire libre (sans transport existant en base).
 *
 * Body : { motif, mobilite, oxygene, brancardage, adresseDepart, adresseDestination }
 */
const recommanderDispatchManuel = async (req, res) => {
  try {
    const Vehicle = require("../models/Vehicle");
    const Personnel = require("../models/Personnel");

    const { motif, mobilite, oxygene, brancardage, adresseDepart, adresseDestination } = req.body;

    if (!mobilite) {
      return res.status(400).json({ message: "mobilite requise (ASSIS | FAUTEUIL_ROULANT | ALLONGE | CIVIERE)" });
    }

    const [vehicules, chauffeurs] = await Promise.all([
      Vehicle.find({ statut: "Disponible" }),
      Personnel.find({ statut: "Disponible", role: { $in: ["Ambulancier", "Chauffeur"] } }),
    ]);

    if (vehicules.length === 0) {
      return res.status(409).json({ message: "Aucun véhicule disponible" });
    }

    // Objet transport synthétique pour l'appel IA / fallback local
    const transportSynthetique = {
      _id: null,
      numero: "MANUEL",
      motif: motif || "Non précisé",
      patient: { mobilite, oxygene: !!oxygene, brancardage: !!brancardage },
      adresseDepart: adresseDepart || "",
      adresseDestination: adresseDestination || "",
    };

    let result;
    try {
      result = await aiClient.recommanderDispatch(transportSynthetique, vehicules, chauffeurs);
    } catch {
      result = _scoringLocalDispatch(transportSynthetique, vehicules);
    }

    return res.json({ ...result, mode: "manuel" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// MODULE 3 — Optimisation de tournée
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ai/routing/optimize
 * Optimise les tournées d'une journée pour plusieurs véhicules.
 *
 * Body :
 * {
 *   date: "2024-03-15",
 *   depot: { lat: 43.7102, lng: 7.2620 },  // Position du garage
 *   transportIds: ["id1", "id2", ...]       // Optionnel — sinon tous les transports du jour
 * }
 */
const optimiserTournee = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const Vehicle = require("../models/Vehicle");

    const { date, depot, transportIds } = req.body;

    if (!date) {
      return res.status(400).json({ message: "date requise (YYYY-MM-DD)" });
    }

    const dateDebut = new Date(date);
    const dateFin = new Date(date);
    dateFin.setDate(dateFin.getDate() + 1);

    // Charger les transports planifiés pour ce jour
    const filtre = {
      dateTransport: { $gte: dateDebut, $lt: dateFin },
      statut: { $in: ["CONFIRMED", "SCHEDULED", "ASSIGNED", "RESCHEDULED"] },
    };
    if (transportIds?.length) {
      filtre._id = { $in: transportIds };
    }

    const [transports, vehicules] = await Promise.all([
      Transport.find(filtre),
      Vehicle.find({ statut: "Disponible" }),
    ]);

    if (transports.length === 0) {
      return res.json({
        date,
        routes: [],
        distanceTotale: 0,
        dureeMaxMinutes: 0,
        nbTransports: 0,
        nbVehicules: 0,
        statut: "OPTIMAL",
        messageOptimiseur: "Aucun transport confirmé/planifié pour cette date",
      });
    }

    // Rétrogéocoder à la volée les transports sans coordonnées (best-effort)
    await Promise.all(
      transports.map(async (t) => {
        const manqueDepart = !t.adresseDepart?.coordonnees?.lat;
        const manqueDest   = !t.adresseDestination?.coordonnees?.lat;
        if (!manqueDepart && !manqueDest) return;
        try {
          const [geoD, geoDest] = await geocodeTransport(
            manqueDepart ? t.adresseDepart : null,
            manqueDest   ? t.adresseDestination : null,
          );
          if (manqueDepart && geoD) {
            t.adresseDepart = t.adresseDepart.toObject
              ? { ...t.adresseDepart.toObject(), coordonnees: { lat: geoD.lat, lng: geoD.lng } }
              : { ...t.adresseDepart, coordonnees: { lat: geoD.lat, lng: geoD.lng } };
            await t.constructor.updateOne(
              { _id: t._id },
              { $set: { "adresseDepart.coordonnees": { lat: geoD.lat, lng: geoD.lng } } },
            );
          }
          if (manqueDest && geoDest) {
            t.adresseDestination = t.adresseDestination.toObject
              ? { ...t.adresseDestination.toObject(), coordonnees: { lat: geoDest.lat, lng: geoDest.lng } }
              : { ...t.adresseDestination, coordonnees: { lat: geoDest.lat, lng: geoDest.lng } };
            await t.constructor.updateOne(
              { _id: t._id },
              { $set: { "adresseDestination.coordonnees": { lat: geoDest.lat, lng: geoDest.lng } } },
            );
          }
        } catch { /* géocodage non bloquant */ }
      })
    );

    const result = await aiClient.optimiserTournee({
      date,
      transports: transports.map((t) => ({
        _id: String(t._id),
        numero: t.numero,
        adresseDepart: _fmtAdresse(t.adresseDepart),
        adresseDestination: _fmtAdresse(t.adresseDestination),
        coordonneesDepart: t.adresseDepart?.coordonnees?.lat
          ? { lat: t.adresseDepart.coordonnees.lat, lng: t.adresseDepart.coordonnees.lng }
          : null,
        coordonneesDestination: t.adresseDestination?.coordonnees?.lat
          ? { lat: t.adresseDestination.coordonnees.lat, lng: t.adresseDestination.coordonnees.lng }
          : null,
        heureDepart: t.heureRDV || t.heureDepart || null,
        mobilite: t.patient?.mobilite || "ASSIS",
        typeTransport: t.typeTransport || "VSL",
        dureeEstimee: t.dureeEstimee || 30,
      })),
      vehicules: vehicules.map((v) => ({
        _id: String(v._id),
        immatriculation: v.immatriculation,
        type: v.type,
        position: v.position?.lat ? { lat: v.position.lat, lng: v.position.lng } : null,
      })),
      depot: depot || { lat: 43.7102, lng: 7.2620 }, // Nice centre par défaut
    });

    await audit.iaRouteOptimization(date, transports.length, result.distanceTotale);

    return res.json(result);
  } catch (err) {
    if (err.message.includes("indisponible")) {
      return res.status(503).json({
        message: "Service d'optimisation temporairement indisponible",
        fallback: "Planification manuelle requise",
      });
    }
    return res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// STATUT DU SERVICE IA
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai/dispatch/history?days=30
 * Retourne les stats agrégées sur les recommandations IA des N derniers jours :
 *   - taux d'acceptation / rejet / pending
 *   - score moyen global
 *   - top raisons de rejet
 *   - répartition par source (ia vs fallback_node)
 *
 * @access  admin | superviseur
 */
const getDispatchHistory = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [statusBreakdown, sourceBreakdown, avgScore, topRejections] = await Promise.all([
      DispatchRecommendation.aggregate([
        { $match: { generatedAt: { $gte: since } } },
        { $group: { _id: "$decision.status", count: { $sum: 1 } } },
      ]),
      DispatchRecommendation.aggregate([
        { $match: { generatedAt: { $gte: since } } },
        { $group: { _id: "$source", count: { $sum: 1 } } },
      ]),
      DispatchRecommendation.aggregate([
        { $match: { generatedAt: { $gte: since }, "bestRecommendation.score": { $ne: null } } },
        { $group: { _id: null, avg: { $avg: "$bestRecommendation.score" }, n: { $sum: 1 } } },
      ]),
      DispatchRecommendation.aggregate([
        { $match: { generatedAt: { $gte: since }, "decision.status": "rejected", "decision.rejectionReason": { $ne: null, $ne: "" } } },
        { $group: { _id: "$decision.rejectionReason", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const total = statusBreakdown.reduce((s, x) => s + x.count, 0);
    const byStatus = Object.fromEntries(statusBreakdown.map((x) => [x._id || "unknown", x.count]));
    const accepted = byStatus.accepted || 0;
    const rejected = byStatus.rejected || 0;
    const pending  = byStatus.pending  || 0;

    return res.json({
      days,
      since,
      total,
      accepted,
      rejected,
      pending,
      acceptanceRate: total ? +(100 * accepted / total).toFixed(1) : 0,
      rejectionRate:  total ? +(100 * rejected / total).toFixed(1) : 0,
      averageScore: avgScore[0]?.avg != null ? +avgScore[0].avg.toFixed(1) : null,
      bySource: Object.fromEntries(sourceBreakdown.map((x) => [x._id || "unknown", x.count])),
      topRejectionReasons: topRejections.map((x) => ({ reason: x._id, count: x.count })),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/ai/status
 * Vérifie la disponibilité du microservice IA Python.
 */
const getAIStatus = async (req, res) => {
  const sante = await aiClient.verifierSante();
  const statusCode = sante.available ? 200 : 503;
  return res.status(statusCode).json(sante);
};

// ════════════════════════════════════════════════════════════════════════════
// SERVICE-TO-SERVICE — Export du dataset d'entraînement DurationPredictor
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai/training-data?since=YYYY-MM-DD&limit=10000
 *
 * Appelé par le microservice IA Python pour réentraîner le DurationPredictor.
 * Renvoie les TransportFeature en JSON, projeté pour matcher exactement le
 * preprocessing attendu côté Python.
 *
 * Garde service-to-service via X-Service-Token (middleware serviceToken).
 * @access  service (AI_SERVICE_TOKEN)
 */
const MIN_REAL_FEATURES = 200; // seuil "données suffisantes"

const getTrainingData = async (req, res) => {
  try {
    const TransportFeature = require("../models/TransportFeature");
    const since = req.query.since ? new Date(req.query.since) : null;
    const limit = Math.min(50_000, parseInt(req.query.limit, 10) || 10_000);

    const filter = {};
    if (since && !isNaN(since.getTime())) filter.completedAt = { $gte: since };

    // Sortie projetée — champs attendus par train_real.py
    const rows = await TransportFeature.find(filter)
      .sort({ completedAt: 1 })
      .limit(limit)
      .select("-__v -createdAt -updatedAt -_id -transportId")
      .lean();

    const features = rows.map((r) => ({
      distanceKm:         r.distanceKm,
      heureDepart:        r.heureDepart,
      jourSemaine:        r.jourSemaine,
      mobilite:           r.mobilite,
      typeVehicule:       r.typeVehicule,
      motif:              r.motif,
      allerRetour:        r.allerRetour,
      oxygene:            r.oxygene,
      brancardage:        r.brancardage,
      dureeReelleMinutes: r.dureeReelleMinutes,
      completedAt:        r.completedAt,
      source:             r.source || "real",
    }));

    const payload = { count: features.length, features };
    if (features.length < MIN_REAL_FEATURES) {
      payload.warning = "insufficient_real_data";
      payload.threshold = MIN_REAL_FEATURES;
    }
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  extrairePMT,
  validerPMT,
  recommanderDispatch,
  recommanderDispatchManuel,
  optimiserTournee,
  getAIStatus,
  getDispatchExplanation,
  getDispatchHistory,
  accepterRecommandationIA,
  refuserRecommandationIA,
  getTrainingData,
};
