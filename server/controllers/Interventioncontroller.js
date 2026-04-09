const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const Facture = require("../models/Facture");
const { autoDispatch } = require("../services/dispatchService");
const socketService = require("../services/socketService");
const { audit } = require("../services/auditService");
const { haversine, calculerETA, formatETA } = require("../utils/geoUtils");

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister toutes les interventions (filtres + pagination)
// @route   GET /api/interventions
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getInterventions = async (req, res) => {
  try {
    const { statut, priorite, limit = 50, page = 1 } = req.query;
    const filter = {};

    if (statut) filter.statut = statut;
    if (priorite) filter.priorite = priorite;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [interventions, total] = await Promise.all([
      Intervention.find(filter)
        .populate("unitAssignee", "nom immatriculation statut")
        .populate("dispatcher", "nom prenom")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Intervention.countDocuments(filter),
    ]);

    res.json({
      interventions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Détail d'une intervention
// @route   GET /api/interventions/:id
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id)
      .populate("unitAssignee", "nom immatriculation statut position equipage")
      .populate("dispatcher", "nom prenom email");

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    res.json(intervention);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Créer une nouvelle intervention
// @route   POST /api/interventions
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const createIntervention = async (req, res) => {
  try {
    const data = { ...req.body, dispatcher: req.user._id };

    // ── Auto-dispatch intelligent ─────────────────────────────────────────
    let dispatchResult = null;
    if (!data.unitAssignee && data.coordonnees?.lat && data.coordonnees?.lng) {
      try {
        dispatchResult = await autoDispatch({
          priorite: data.priorite || "P2",
          typeIncident: data.typeIncident || "Autre",
          lat: data.coordonnees.lat,
          lng: data.coordonnees.lng,
        });
        if (dispatchResult.unite) {
          data.unitAssignee = dispatchResult.unite._id;
          data.statut = "EN_ROUTE";
          data.heureDepart = new Date();
        }
      } catch (e) {
        console.warn("Auto-dispatch échoué:", e.message);
      }
    }

    const intervention = await Intervention.create(data);

    // ── Mettre l'unité en mission ─────────────────────────────────────────
    if (data.unitAssignee) {
      await Unit.findByIdAndUpdate(data.unitAssignee, {
        statut: "en_mission",
        interventionEnCours: intervention._id,
      });
      socketService.emitStatutUnite(
        data.unitAssignee,
        "en_mission",
        dispatchResult?.unite?.nom || "",
      );
    }

    // ── Facture automatique ───────────────────────────────────────────────
    try {
      const montants = { P1: 450, P2: 280, P3: 150 };
      await Facture.create({
        date: new Date(),
        motif: intervention.typeIncident,
        lieu: intervention.adresse,
        montant: montants[intervention.priorite] || 150,
        statut: "en-attente",
        patient: intervention.patient?.nom || "Inconnu",
        intervention: intervention._id,
        notes: `Auto-générée — Priorité ${intervention.priorite}`,
      });
    } catch (e) {
      console.warn("Facture auto non créée:", e.message);
    }

    // ── Socket.IO — diffusion temps réel ─────────────────────────────────
    socketService.emitInterventionCreated(intervention);

    if (dispatchResult?.unite) {
      socketService.emitUnitAssigned({
        intervention,
        unite: dispatchResult.unite,
        eta: dispatchResult.etaFormate,
        score: dispatchResult.scoreTotal,
        source: "AUTO",
      });
      socketService.emitDispatchCompleted({
        intervention,
        unite: dispatchResult.unite,
        score: dispatchResult.scoreTotal,
        eta: dispatchResult.etaFormate,
        alternatives: dispatchResult.alternatives,
      });
    }

    // Mise à jour stats globales
    socketService.emitStatsUpdate();

    // ── Audit traçabilité ─────────────────────────────────────────────────
    await audit.interventionCreee(intervention, req.user);
    if (dispatchResult?.unite) {
      await audit.dispatchAuto(
        intervention,
        dispatchResult.unite,
        dispatchResult.scoreTotal,
        dispatchResult.etaFormate,
      );
    }

    res.status(201).json({
      message: "Intervention créée",
      intervention,
      dispatch: dispatchResult
        ? {
            unite: dispatchResult.unite?.nom,
            score: dispatchResult.scoreTotal,
            eta: dispatchResult.etaFormate,
            distanceKm: dispatchResult.distanceKm,
            alternatives: dispatchResult.alternatives,
            justification: dispatchResult.justification,
          }
        : null,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier les informations d'une intervention
// @route   PATCH /api/interventions/:id
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updateIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    const io = req.app.get("io");
    io.emit("intervention:modifiee", intervention);

    res.json({ message: "Intervention mise à jour", intervention });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Changer le statut d'une intervention
//          (en_attente → en_cours → terminee | annulee)
//          Libère automatiquement l'unité si terminée/annulée
// @route   PATCH /api/interventions/:id/status
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const statutsValides = ["CREATED", "EN_ROUTE", "COMPLETED", "CANCELLED"];

    if (!statutsValides.includes(statut)) {
      return res
        .status(400)
        .json({
          message: `Statut invalide. Valeurs acceptées : ${statutsValides.join(", ")}`,
        });
    }

    // Horodatages automatiques selon la transition
    const update = { statut };
    if (statut === "EN_ROUTE") update.heureDepart = new Date();
    if (statut === "COMPLETED") update.heureTerminee = new Date();

    const intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true },
    ).populate("unitAssignee", "nom immatriculation _id");

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    // Libérer l'unité assignée si l'intervention se termine ou est annulée
    if (
      (statut === "COMPLETED" || statut === "CANCELLED") &&
      intervention.unitAssignee
    ) {
      await Unit.findByIdAndUpdate(intervention.unitAssignee._id, {
        statut: "disponible",
        interventionEnCours: null,
      });

      const io = req.app.get("io");
      io.emit("unit:statut_maj", {
        unitId: intervention.unitAssignee._id,
        statut: "disponible",
      });
    }

    const io = req.app.get("io");
    io.emit("intervention:statut_maj", intervention);

    res.json({ message: "Statut mis à jour", intervention });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Assigner une unité ambulancière à une intervention
//          Vérifie que l'unité est disponible avant d'assigner
// @route   PATCH /api/interventions/:id/assign
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const assignUnit = async (req, res) => {
  try {
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).json({ message: "unitId est obligatoire" });
    }

    // Vérifier que l'unité existe et est disponible
    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }
    if (unit.statut !== "disponible") {
      return res.status(400).json({
        message: `Impossible d'assigner — l'unité est actuellement "${unit.statut}"`,
      });
    }

    // Mettre à jour l'intervention
    const intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      {
        unitAssignee: unitId,
        statut: "EN_ROUTE",
        heureDepart: new Date(),
      },
      { new: true },
    ).populate("unitAssignee", "nom immatriculation statut");

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    // Mettre l'unité en mission
    await Unit.findByIdAndUpdate(unitId, {
      statut: "en_mission",
      interventionEnCours: intervention._id,
    });

    const io = req.app.get("io");
    io.emit("intervention:assignee", intervention);
    io.emit("unit:statut_maj", { unitId, statut: "en_mission" });

    res.json({ message: "Unité assignée avec succès", intervention });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Retirer l'unité assignée d'une intervention (désassigner)
// @route   PATCH /api/interventions/:id/unassign
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const unassignUnit = async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id);
    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    const unitId = intervention.unitAssignee;

    // Remettre l'intervention en attente
    const updated = await Intervention.findByIdAndUpdate(
      req.params.id,
      { unitAssignee: null, statut: "CREATED" },
      { new: true },
    );

    // Libérer l'unité si elle était assignée
    if (unitId) {
      await Unit.findByIdAndUpdate(unitId, {
        statut: "disponible",
        interventionEnCours: null,
      });

      const io = req.app.get("io");
      io.emit("unit:statut_maj", { unitId, statut: "disponible" });
    }

    const io = req.app.get("io");
    io.emit("intervention:modifiee", updated);

    res.json({ message: "Unité désassignée", intervention: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer une intervention
// @route   DELETE /api/interventions/:id
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const deleteIntervention = async (req, res) => {
  try {
    const intervention = await Intervention.findByIdAndDelete(req.params.id);

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    // Libérer l'unité si elle était assignée
    if (intervention.unitAssignee) {
      await Unit.findByIdAndUpdate(intervention.unitAssignee, {
        statut: "disponible",
        interventionEnCours: null,
      });
    }

    const io = req.app.get("io");
    io.emit("intervention:supprimee", { id: req.params.id });

    res.json({ message: "Intervention supprimée" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Statistiques pour le dashboard
// @route   GET /api/interventions/stats
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [total, enAttente, enCours, terminees, annulees] = await Promise.all([
      Intervention.countDocuments(),
      Intervention.countDocuments({ statut: "CREATED" }),
      Intervention.countDocuments({ statut: "EN_ROUTE" }),
      Intervention.countDocuments({ statut: "COMPLETED" }),
      Intervention.countDocuments({ statut: "CANCELLED" }),
    ]);

    const parPrioriteRaw = await Intervention.aggregate([
      { $group: { _id: "$priorite", count: { $sum: 1 } } },
    ]);
    const parPriorite = { P1: 0, P2: 0, P3: 0 };
    parPrioriteRaw.forEach((p) => {
      if (p._id) parPriorite[p._id] = p.count;
    });

    const parTypeRaw = await Intervention.aggregate([
      { $group: { _id: "$typeIncident", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.json({
      total,
      parStatut: { enAttente, enCours, terminees, annulees },
      parPriorite,
      parType: parTypeRaw,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getInterventions,
  getIntervention,
  createIntervention,
  updateIntervention,
  updateStatus,
  assignUnit,
  unassignUnit,
  deleteIntervention,
  getStats,
};
