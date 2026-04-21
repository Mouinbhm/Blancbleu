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

    const transport = await Transport.findByIdAndUpdate(
      req.params.transportId,
      {
        "prescription.extraitPar": "IA+HUMAIN",
        "prescription.contenu": extraction,
        "prescription.valide": true,
        "prescription.validePar": req.user._id,
        "prescription.valideAt": new Date(),
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

/**
 * POST /api/ai/dispatch/:transportId
 * Recommande le meilleur véhicule et chauffeur pour un transport.
 *
 * Réponse :
 * {
 *   recommandation: { vehiculeId, chauffeurId, score, justification },
 *   alternatives: [ { vehiculeId, score }, ... ],
 *   source: "ia" | "rules"
 * }
 */
const recommanderDispatch = async (req, res) => {
  try {
    const Transport = require("../models/Transport");
    const Vehicle = require("../models/Vehicle");
    const Personnel = require("../models/Personnel");

    const transport = await Transport.findById(req.params.transportId);
    if (!transport) {
      return res.status(404).json({ message: "Transport introuvable" });
    }

    // Récupérer véhicules et chauffeurs disponibles
    const [vehicules, chauffeurs] = await Promise.all([
      Vehicle.find({ statut: "disponible" }),
      Personnel.find({
        statut: "en-service",
        role: { $in: ["Ambulancier", "Chauffeur"] },
      }),
    ]);

    if (vehicules.length === 0) {
      return res.status(409).json({ message: "Aucun véhicule disponible" });
    }

    let result;
    try {
      result = await aiClient.recommanderDispatch(transport, vehicules, chauffeurs);
    } catch (aiError) {
      // Fallback : scoring local basé sur les règles métier
      result = _scoringLocalDispatch(transport, vehicules);
    }

    // Journaliser la suggestion IA
    await audit.iaDispatchSuggestion(
      transport,
      result.recommandation,
      result.recommandation?.score
    );

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

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
      Vehicle.find({ statut: "disponible" }),
      Personnel.find({ statut: "en-service", role: { $in: ["Ambulancier", "Chauffeur"] } }),
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
      statut: { $in: ["CONFIRMED", "SCHEDULED"] },
    };
    if (transportIds?.length) {
      filtre._id = { $in: transportIds };
    }

    const [transports, vehicules] = await Promise.all([
      Transport.find(filtre),
      Vehicle.find({ statut: "disponible" }),
    ]);

    if (transports.length === 0) {
      return res.json({ message: "Aucun transport à optimiser pour cette date", routes: [] });
    }

    const result = await aiClient.optimiserTournee({
      date,
      transports: transports.map((t) => ({
        _id: t._id,
        numero: t.numero,
        adresseDepart: t.adresseDepart,
        adresseDestination: t.adresseDestination,
        heureDepart: t.heureDepart,
        mobilite: t.patient?.mobilite,
        typeTransport: t.typeTransport,
        dureeEstimee: t.dureeEstimee,
      })),
      vehicules: vehicules.map((v) => ({
        _id: v._id,
        immatriculation: v.immatriculation,
        type: v.type,
        position: v.position,
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
 * GET /api/ai/status
 * Vérifie la disponibilité du microservice IA Python.
 */
const getAIStatus = async (req, res) => {
  const sante = await aiClient.verifierSante();
  const statusCode = sante.available ? 200 : 503;
  return res.status(statusCode).json(sante);
};

module.exports = {
  extrairePMT,
  validerPMT,
  recommanderDispatch,
  recommanderDispatchManuel,
  optimiserTournee,
  getAIStatus,
};
