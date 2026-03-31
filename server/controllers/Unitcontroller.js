const Unit = require("../models/Unit");
const Intervention = require("../models/Intervention");

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister toutes les unités (filtres: statut, type)
// @route   GET /api/units
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getUnits = async (req, res) => {
  try {
    const { statut, type } = req.query;
    const filter = {};

    if (statut) filter.statut = statut;
    if (type) filter.type = type;

    const units = await Unit.find(filter)
      .populate("interventionEnCours", "numero adresse priorite statut")
      .sort({ nom: 1 });

    res.json(units);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Détail d'une unité
// @route   GET /api/units/:id
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getUnit = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).populate(
      "interventionEnCours",
      "numero adresse priorite statut patient",
    );

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    res.json(unit);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Ajouter une nouvelle unité à la flotte
// @route   POST /api/units
// @access  Privé / admin ou superviseur
// ─────────────────────────────────────────────────────────────────────────────
const createUnit = async (req, res) => {
  try {
    const unit = await Unit.create(req.body);

    const io = req.app.get("io");
    io.emit("unit:nouvelle", unit);

    res.status(201).json({ message: "Unité ajoutée à la flotte", unit });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier les informations d'une unité (infos véhicule, équipage…)
// @route   PATCH /api/units/:id
// @access  Privé / admin ou superviseur
// ─────────────────────────────────────────────────────────────────────────────
const updateUnit = async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    const io = req.app.get("io");
    io.emit("unit:modifiee", unit);

    res.json({ message: "Unité mise à jour", unit });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Changer le statut opérationnel d'une unité
//          disponible | en_mission | indisponible | maintenance
// @route   PATCH /api/units/:id/status
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const statutsValides = [
      "disponible",
      "en_mission",
      "indisponible",
      "maintenance",
    ];

    if (!statutsValides.includes(statut)) {
      return res.status(400).json({
        message: `Statut invalide. Valeurs acceptées : ${statutsValides.join(", ")}`,
      });
    }

    const update = { statut };

    // Si l'unité quitte une mission manuellement, on la libère
    if (statut === "disponible") {
      update.interventionEnCours = null;
    }

    const unit = await Unit.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    const io = req.app.get("io");
    io.emit("unit:statut_maj", unit);

    res.json({ message: "Statut mis à jour", unit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Mettre à jour la position GPS d'une unité (temps réel)
// @route   PATCH /api/units/:id/position
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updatePosition = async (req, res) => {
  try {
    const { lat, lng, adresse } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "lat et lng sont obligatoires" });
    }

    const unit = await Unit.findByIdAndUpdate(
      req.params.id,
      {
        position: {
          lat,
          lng,
          adresse: adresse || "",
          derniereMaj: new Date(),
        },
      },
      { new: true },
    );

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    // Broadcast GPS en temps réel vers tous les clients connectés
    const io = req.app.get("io");
    io.emit("unit:position_maj", {
      unitId: unit._id,
      nom: unit.nom,
      position: unit.position,
      statut: unit.statut,
    });

    res.json({ message: "Position mise à jour", unit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Gérer l'équipage d'une unité (ajouter / retirer un membre)
// @route   PATCH /api/units/:id/equipage
// @access  Privé / admin ou superviseur
// ─────────────────────────────────────────────────────────────────────────────
const updateEquipage = async (req, res) => {
  try {
    const { action, membre } = req.body;
    // action: 'ajouter' | 'retirer'
    // membre: { nom, role }

    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    if (action === "ajouter") {
      if (!membre?.nom || !membre?.role) {
        return res
          .status(400)
          .json({ message: "nom et role du membre sont requis" });
      }
      unit.equipage.push(membre);
    } else if (action === "retirer") {
      if (!membre?._id) {
        return res
          .status(400)
          .json({ message: "_id du membre est requis pour le retirer" });
      }
      unit.equipage = unit.equipage.filter(
        (m) => m._id.toString() !== membre._id,
      );
    } else {
      return res
        .status(400)
        .json({ message: 'action invalide — utilisez "ajouter" ou "retirer"' });
    }

    await unit.save();

    res.json({
      message: `Équipage mis à jour (${action})`,
      equipage: unit.equipage,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer une unité de la flotte
// @route   DELETE /api/units/:id
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteUnit = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    // Empêcher la suppression si l'unité est en mission
    if (unit.statut === "en_mission") {
      return res.status(400).json({
        message: "Impossible de supprimer une unité en mission active",
      });
    }

    await Unit.findByIdAndDelete(req.params.id);

    const io = req.app.get("io");
    io.emit("unit:supprimee", { id: req.params.id });

    res.json({ message: "Unité supprimée de la flotte" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Statistiques de la flotte pour le dashboard
// @route   GET /api/units/stats
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [total, disponibles, enMission, indisponibles, maintenance, parType] =
      await Promise.all([
        Unit.countDocuments(),
        Unit.countDocuments({ statut: "disponible" }),
        Unit.countDocuments({ statut: "en_mission" }),
        Unit.countDocuments({ statut: "indisponible" }),
        Unit.countDocuments({ statut: "maintenance" }),
        Unit.aggregate([
          { $group: { _id: "$type", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

    res.json({
      total,
      parStatut: { disponibles, enMission, indisponibles, maintenance },
      parType,
      tauxDisponibilite:
        total > 0 ? Math.round((disponibles / total) * 100) : 0,
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
  updateStatus,
  updatePosition,
  updateEquipage,
  deleteUnit,
  getStats,
};
const Unit = require("../models/Unit");
const Intervention = require("../models/Intervention");

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister toutes les unités (filtres: statut, type)
// @route   GET /api/units
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getUnits = async (req, res) => {
  try {
    const { statut, type } = req.query;
    const filter = {};

    if (statut) filter.statut = statut;
    if (type) filter.type = type;

    const units = await Unit.find(filter)
      .populate("interventionEnCours", "numero adresse priorite statut")
      .sort({ nom: 1 });

    res.json(units);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Détail d'une unité
// @route   GET /api/units/:id
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getUnit = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).populate(
      "interventionEnCours",
      "numero adresse priorite statut patient",
    );

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    res.json(unit);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Ajouter une nouvelle unité à la flotte
// @route   POST /api/units
// @access  Privé / admin ou superviseur
// ─────────────────────────────────────────────────────────────────────────────
const createUnit = async (req, res) => {
  try {
    const unit = await Unit.create(req.body);

    const io = req.app.get("io");
    io.emit("unit:nouvelle", unit);

    res.status(201).json({ message: "Unité ajoutée à la flotte", unit });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier les informations d'une unité (infos véhicule, équipage…)
// @route   PATCH /api/units/:id
// @access  Privé / admin ou superviseur
// ─────────────────────────────────────────────────────────────────────────────
const updateUnit = async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    const io = req.app.get("io");
    io.emit("unit:modifiee", unit);

    res.json({ message: "Unité mise à jour", unit });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Changer le statut opérationnel d'une unité
//          disponible | en_mission | indisponible | maintenance
// @route   PATCH /api/units/:id/status
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const statutsValides = [
      "disponible",
      "en_mission",
      "indisponible",
      "maintenance",
    ];

    if (!statutsValides.includes(statut)) {
      return res.status(400).json({
        message: `Statut invalide. Valeurs acceptées : ${statutsValides.join(", ")}`,
      });
    }

    const update = { statut };

    // Si l'unité quitte une mission manuellement, on la libère
    if (statut === "disponible") {
      update.interventionEnCours = null;
    }

    const unit = await Unit.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    const io = req.app.get("io");
    io.emit("unit:statut_maj", unit);

    res.json({ message: "Statut mis à jour", unit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Mettre à jour la position GPS d'une unité (temps réel)
// @route   PATCH /api/units/:id/position
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const updatePosition = async (req, res) => {
  try {
    const { lat, lng, adresse } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "lat et lng sont obligatoires" });
    }

    const unit = await Unit.findByIdAndUpdate(
      req.params.id,
      {
        position: {
          lat,
          lng,
          adresse: adresse || "",
          derniereMaj: new Date(),
        },
      },
      { new: true },
    );

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    // Broadcast GPS en temps réel vers tous les clients connectés
    const io = req.app.get("io");
    io.emit("unit:position_maj", {
      unitId: unit._id,
      nom: unit.nom,
      position: unit.position,
      statut: unit.statut,
    });

    res.json({ message: "Position mise à jour", unit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Gérer l'équipage d'une unité (ajouter / retirer un membre)
// @route   PATCH /api/units/:id/equipage
// @access  Privé / admin ou superviseur
// ─────────────────────────────────────────────────────────────────────────────
const updateEquipage = async (req, res) => {
  try {
    const { action, membre } = req.body;
    // action: 'ajouter' | 'retirer'
    // membre: { nom, role }

    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    if (action === "ajouter") {
      if (!membre?.nom || !membre?.role) {
        return res
          .status(400)
          .json({ message: "nom et role du membre sont requis" });
      }
      unit.equipage.push(membre);
    } else if (action === "retirer") {
      if (!membre?._id) {
        return res
          .status(400)
          .json({ message: "_id du membre est requis pour le retirer" });
      }
      unit.equipage = unit.equipage.filter(
        (m) => m._id.toString() !== membre._id,
      );
    } else {
      return res
        .status(400)
        .json({ message: 'action invalide — utilisez "ajouter" ou "retirer"' });
    }

    await unit.save();

    res.json({
      message: `Équipage mis à jour (${action})`,
      equipage: unit.equipage,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer une unité de la flotte
// @route   DELETE /api/units/:id
// @access  Privé / admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteUnit = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    // Empêcher la suppression si l'unité est en mission
    if (unit.statut === "en_mission") {
      return res.status(400).json({
        message: "Impossible de supprimer une unité en mission active",
      });
    }

    await Unit.findByIdAndDelete(req.params.id);

    const io = req.app.get("io");
    io.emit("unit:supprimee", { id: req.params.id });

    res.json({ message: "Unité supprimée de la flotte" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Statistiques de la flotte pour le dashboard
// @route   GET /api/units/stats
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [total, disponibles, enMission, indisponibles, maintenance, parType] =
      await Promise.all([
        Unit.countDocuments(),
        Unit.countDocuments({ statut: "disponible" }),
        Unit.countDocuments({ statut: "en_mission" }),
        Unit.countDocuments({ statut: "indisponible" }),
        Unit.countDocuments({ statut: "maintenance" }),
        Unit.aggregate([
          { $group: { _id: "$type", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

    res.json({
      total,
      parStatut: { disponibles, enMission, indisponibles, maintenance },
      parType,
      tauxDisponibilite:
        total > 0 ? Math.round((disponibles / total) * 100) : 0,
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
  updateStatus,
  updatePosition,
  updateEquipage,
  deleteUnit,
  getStats,
};
