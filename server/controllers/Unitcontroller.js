/**
 * BlancBleu — Controller Unités v2.0
 * CRUD + géolocalisation temps réel
 */
const Unit = require("../models/Unit");
const socketService = require("../services/socketService");
const { audit } = require("../services/auditService");

// ─── GET /api/units ───────────────────────────────────────────────────────────
const getUnits = async (req, res) => {
  try {
    const { statut, type, disponible } = req.query;
    const filtre = {};
    if (statut) filtre.statut = statut;
    if (type) filtre.type = type;
    if (disponible === "true") filtre.statut = "disponible";

    const units = await Unit.find(filtre)
      .populate(
        "interventionEnCours",
        "numero typeIncident priorite adresse statut",
      )
      .sort({ statut: 1, nom: 1 });

    res.json(units);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/units/:id ───────────────────────────────────────────────────────
const getUnit = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).populate(
      "interventionEnCours",
    );
    if (!unit) return res.status(404).json({ message: "Unité introuvable" });
    res.json(unit);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/units ──────────────────────────────────────────────────────────
const createUnit = async (req, res) => {
  try {
    const unit = await Unit.create(req.body);
    socketService.emitUnitStatusChanged({
      unite: unit,
      ancienStatut: null,
      nouveauStatut: unit.statut,
    });
    res.status(201).json(unit);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── PUT /api/units/:id ───────────────────────────────────────────────────────
const updateUnit = async (req, res) => {
  try {
    const ancienne = await Unit.findById(req.params.id);
    if (!ancienne)
      return res.status(404).json({ message: "Unité introuvable" });

    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (ancienne.statut !== unit.statut) {
      socketService.emitUnitStatusChanged({
        unite: unit,
        ancienStatut: ancienne.statut,
        nouveauStatut: unit.statut,
      });
      await audit.uniteStatusChange(
        unit,
        ancienne.statut,
        unit.statut,
        req.user,
      );
    }

    res.json(unit);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─── DELETE /api/units/:id ────────────────────────────────────────────────────
const deleteUnit = async (req, res) => {
  try {
    await Unit.findByIdAndDelete(req.params.id);
    res.json({ message: "Unité supprimée" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PUT /api/units/:id/location ──────────────────────────────────────────────
const updateLocation = async (req, res) => {
  try {
    const { lat, lng, vitesse, cap, precision, adresse } = req.body;

    if (!lat || !lng)
      return res.status(400).json({ message: "lat et lng requis" });
    if (lat < -90 || lat > 90)
      return res.status(400).json({ message: "lat invalide (-90 à 90)" });
    if (lng < -180 || lng > 180)
      return res.status(400).json({ message: "lng invalide (-180 à 180)" });

    const unit = await Unit.findById(req.params.id);
    if (!unit) return res.status(404).json({ message: "Unité introuvable" });

    await unit.updateLocation(lat, lng, { vitesse, cap, precision, adresse });

    // Diffuser la nouvelle position via Socket.IO
    socketService.emitLocationUpdated({
      unitId: unit._id,
      nom: unit.nom,
      type: unit.type,
      statut: unit.statut,
      position: unit.position,
      interventionEnCours: unit.interventionEnCours,
    });

    res.json({ message: "Position mise à jour", position: unit.position });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/units/:id/statut ──────────────────────────────────────────────
const updateStatut = async (req, res) => {
  try {
    const { statut } = req.body;
    const statutsValides = [
      "disponible",
      "en_mission",
      "maintenance",
      "hors_service",
      "pause",
    ];
    if (!statutsValides.includes(statut))
      return res
        .status(400)
        .json({
          message: `Statut invalide. Valides: ${statutsValides.join(", ")}`,
        });

    const unit = await Unit.findById(req.params.id);
    if (!unit) return res.status(404).json({ message: "Unité introuvable" });
    const ancien = unit.statut;
    unit.statut = statut;
    await unit.save();

    socketService.emitUnitStatusChanged({
      unite: unit,
      ancienStatut: ancien,
      nouveauStatut: statut,
    });
    await audit.uniteStatusChange(unit, ancien, statut, req.user);

    res.json(unit);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/units/stats ─────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [total, disponibles, enMission, maintenance, horsService] =
      await Promise.all([
        Unit.countDocuments(),
        Unit.countDocuments({ statut: "disponible" }),
        Unit.countDocuments({ statut: "en_mission" }),
        Unit.countDocuments({ statut: "maintenance" }),
        Unit.countDocuments({ statut: "hors_service" }),
      ]);
    const parType = await Unit.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          disponibles: {
            $sum: { $cond: [{ $eq: ["$statut", "disponible"] }, 1, 0] },
          },
        },
      },
    ]);
    res.json({
      total,
      disponibles,
      enMission,
      maintenance,
      horsService,
      parType,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getUnits,
  getUnit,
  createUnit,
  updateUnit,
  deleteUnit,
  updateLocation,
  updateStatut,
  getStats,
};
