const express = require("express");
const router = express.Router();
const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const { protect } = require("../middleware/Auth");

// ─── GET /api/interventions ───────────────────────────────────────────────────
// Liste toutes les interventions (avec filtres optionnels)
router.get("/", protect, async (req, res) => {
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
});

// ─── GET /api/interventions/:id ───────────────────────────────────────────────
// Détail d'une intervention
router.get("/:id", protect, async (req, res) => {
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
});

// ─── POST /api/interventions ──────────────────────────────────────────────────
// Créer une nouvelle intervention
router.post("/", protect, async (req, res) => {
  try {
    const data = { ...req.body, dispatcher: req.user._id };
    const intervention = await Intervention.create(data);

    // Émettre l'événement Socket.IO
    const io = req.app.get("io");
    io.emit("intervention:nouvelle", intervention);

    res.status(201).json({ message: "Intervention créée", intervention });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─── PATCH /api/interventions/:id/status ─────────────────────────────────────
// Mettre à jour le statut d'une intervention
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { statut } = req.body;
    const statutsValides = ["en_attente", "en_cours", "terminee", "annulee"];

    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ message: "Statut invalide" });
    }

    const update = { statut };

    // Horodatages automatiques selon le statut
    if (statut === "en_cours") update.heureDepart = new Date();
    if (statut === "terminee") update.heureTerminee = new Date();

    const intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true },
    ).populate("unitAssignee", "nom immatriculation");

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    // Si terminée, libérer l'unité assignée
    if (statut === "terminee" || statut === "annulee") {
      if (intervention.unitAssignee) {
        await Unit.findByIdAndUpdate(intervention.unitAssignee._id, {
          statut: "disponible",
          interventionEnCours: null,
        });
      }
    }

    const io = req.app.get("io");
    io.emit("intervention:statut_maj", intervention);

    res.json({ message: "Statut mis à jour", intervention });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/interventions/:id/assign ─────────────────────────────────────
// Assigner une unité à une intervention
router.patch("/:id/assign", protect, async (req, res) => {
  try {
    const { unitId } = req.body;

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }
    if (unit.statut !== "disponible") {
      return res
        .status(400)
        .json({ message: `Unité non disponible (statut: ${unit.statut})` });
    }

    // Mettre à jour l'intervention
    const intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      { unitAssignee: unitId, statut: "en_cours", heureDepart: new Date() },
      { new: true },
    ).populate("unitAssignee", "nom immatriculation statut");

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    // Mettre à jour l'unité
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
});

// ─── PATCH /api/interventions/:id ────────────────────────────────────────────
// Modifier les informations d'une intervention
router.patch("/:id", protect, async (req, res) => {
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
});

// ─── DELETE /api/interventions/:id ───────────────────────────────────────────
// Supprimer une intervention
router.delete("/:id", protect, async (req, res) => {
  try {
    const intervention = await Intervention.findByIdAndDelete(req.params.id);

    if (!intervention) {
      return res.status(404).json({ message: "Intervention introuvable" });
    }

    const io = req.app.get("io");
    io.emit("intervention:supprimee", { id: req.params.id });

    res.json({ message: "Intervention supprimée" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
