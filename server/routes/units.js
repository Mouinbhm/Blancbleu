const express = require("express");
const router = express.Router();
const Unit = require("../models/Unit");
const { protect, authorize } = require("../middleware/Auth");

// ─── GET /api/units ───────────────────────────────────────────────────────────
// Liste toutes les unités (avec filtre optionnel)
router.get("/", protect, async (req, res) => {
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
});

// ─── GET /api/units/:id ───────────────────────────────────────────────────────
// Détail d'une unité
router.get("/:id", protect, async (req, res) => {
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
});

// ─── POST /api/units ──────────────────────────────────────────────────────────
// Ajouter une nouvelle unité à la flotte
router.post(
  "/",
  protect,
  authorize("admin", "superviseur"),
  async (req, res) => {
    try {
      const unit = await Unit.create(req.body);

      const io = req.app.get("io");
      io.emit("unit:nouvelle", unit);

      res.status(201).json({ message: "Unité créée", unit });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// ─── PATCH /api/units/:id/status ─────────────────────────────────────────────
// Mettre à jour le statut d'une unité
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { statut } = req.body;
    const statutsValides = [
      "disponible",
      "en_mission",
      "indisponible",
      "maintenance",
    ];

    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ message: "Statut invalide" });
    }

    const unit = await Unit.findByIdAndUpdate(
      req.params.id,
      { statut },
      { new: true },
    );

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    const io = req.app.get("io");
    io.emit("unit:statut_maj", unit);

    res.json({ message: "Statut mis à jour", unit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/units/:id/position ───────────────────────────────────────────
// Mettre à jour la position GPS d'une unité (temps réel)
router.patch("/:id/position", protect, async (req, res) => {
  try {
    const { lat, lng, adresse } = req.body;

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

    // Broadcast de la position en temps réel
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
});

// ─── PATCH /api/units/:id ─────────────────────────────────────────────────────
// Modifier les informations d'une unité
router.patch(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  async (req, res) => {
    try {
      const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });

      if (!unit) {
        return res.status(404).json({ message: "Unité introuvable" });
      }

      res.json({ message: "Unité mise à jour", unit });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// ─── DELETE /api/units/:id ────────────────────────────────────────────────────
// Retirer une unité de la flotte
router.delete("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const unit = await Unit.findByIdAndDelete(req.params.id);

    if (!unit) {
      return res.status(404).json({ message: "Unité introuvable" });
    }

    const io = req.app.get("io");
    io.emit("unit:supprimee", { id: req.params.id });

    res.json({ message: "Unité supprimée de la flotte" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
