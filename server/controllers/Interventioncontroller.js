const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const Facture = require("../models/Facture");

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
    const intervention = await Intervention.create(data);

    // ── Créer automatiquement une facture en attente ──────────────────────
    try {
      const montantBase = {
        P1: 450, // Urgence critique
        P2: 280, // Urgence standard
        P3: 150, // Transport standard
      };
      await Facture.create({
        date: new Date(),
        motif: intervention.typeIncident,
        lieu: intervention.adresse,
        montant: montantBase[intervention.priorite] || 150,
        statut: "en-attente",
        patient: intervention.patient?.nom || "Inconnu",
        intervention: intervention._id,
        notes: `Facture générée automatiquement — Priorité ${intervention.priorite}`,
      });
    } catch (factureErr) {
      console.warn("Facture auto non créée:", factureErr.message);
    }

    const io = req.app.get("io");
    io.emit("intervention:nouvelle", intervention);

    res.status(201).json({ message: "Intervention créée", intervention });
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
    const statutsValides = ["en_attente", "en_cours", "terminee", "annulee"];

    if (!statutsValides.includes(statut)) {
      return res
        .status(400)
        .json({
          message: `Statut invalide. Valeurs acceptées : ${statutsValides.join(", ")}`,
        });
    }

    // Horodatages automatiques selon la transition
    const update = { statut };
    if (statut === "en_cours") update.heureDepart = new Date();
    if (statut === "terminee") update.heureTerminee = new Date();

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
      (statut === "terminee" || statut === "annulee") &&
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
        statut: "en_cours",
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
      { unitAssignee: null, statut: "en_attente" },
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
    const [
      total,
      enAttente,
      enCours,
      terminees,
      annulees,
      parPriorite,
      parType,
    ] = await Promise.all([
      Intervention.countDocuments(),
      Intervention.countDocuments({ statut: "en_attente" }),
      Intervention.countDocuments({ statut: "en_cours" }),
      Intervention.countDocuments({ statut: "terminee" }),
      Intervention.countDocuments({ statut: "annulee" }),
      Intervention.aggregate([
        { $group: { _id: "$priorite", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Intervention.aggregate([
        { $group: { _id: "$typeIncident", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    res.json({
      total,
      parStatut: { enAttente, enCours, terminees, annulees },
      parPriorite,
      parType,
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
