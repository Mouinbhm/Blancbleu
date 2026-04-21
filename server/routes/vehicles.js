/**
 * BlancBleu — Routes Véhicules Transport Sanitaire
 * Remplace routes/units.js
 */
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const Vehicle = require("../models/Vehicle");
const Transport = require("../models/Transport");
const socketService = require("../services/socketService");
const { audit } = require("../services/auditService");

// Statuts indiquant qu'un transport est terminé (véhicule devrait être libre)
const STATUTS_TERMINES = ["COMPLETED", "CANCELLED", "NO_SHOW", "BILLED"];

// ── GET /api/vehicles ─────────────────────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  try {
    const { statut, type, disponible } = req.query;
    const filtre = { deletedAt: null };
    if (statut) filtre.statut = statut;
    if (type) filtre.type = type;
    if (disponible === "true") filtre.statut = "disponible";

    const vehicles = await Vehicle.find(filtre)
      .populate("chauffeurAssigne", "nom prenom email")
      .populate("transportEnCours", "numero motif statut patient")
      .sort({ statut: 1, nom: 1 });

    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/vehicles/stats ───────────────────────────────────────────────────
router.get("/stats", protect, async (req, res) => {
  try {
    const [total, disponibles, enMission, maintenance] = await Promise.all([
      Vehicle.countDocuments({ deletedAt: null }),
      Vehicle.countDocuments({ deletedAt: null, statut: "disponible" }),
      Vehicle.countDocuments({ deletedAt: null, statut: "en_mission" }),
      Vehicle.countDocuments({ deletedAt: null, statut: "maintenance" }),
    ]);

    const parType = await Vehicle.aggregate([
      { $match: { deletedAt: null } },
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

    res.json({ total, disponibles, enMission, maintenance, parType });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/vehicles/diagnostic ─────────────────────────────────────────────
// Rapport d'incohérence entre le statut des véhicules et l'état de leurs transports.
// Lecture seule — ne modifie rien en base.
router.get(
  "/diagnostic",
  protect,
  authorize("admin", "superviseur"),
  async (req, res) => {
    try {
      const vehiculesEnMission = await Vehicle.find({
        statut: "en_mission",
        deletedAt: null,
      })
        .populate("transportEnCours", "numero statut dateTransport")
        .lean();

      const vehiculesBloqués = [];

      for (const v of vehiculesEnMission) {
        let probleme = null;

        if (!v.transportEnCours) {
          probleme = "Aucun transport lié";
        } else if (STATUTS_TERMINES.includes(v.transportEnCours.statut)) {
          probleme = "Transport terminé mais véhicule non libéré";
        }

        if (probleme) {
          vehiculesBloqués.push({
            vehiculeId: v._id,
            immatriculation: v.immatriculation,
            nom: v.nom,
            type: v.type,
            statutVehicule: v.statut,
            transportEnCours: v.transportEnCours
              ? {
                  numero: v.transportEnCours.numero,
                  statut: v.transportEnCours.statut,
                  dateTransport: v.transportEnCours.dateTransport,
                }
              : null,
            probleme,
          });
        }
      }

      res.json({
        vehiculesBloqués,
        totalEnMission: vehiculesEnMission.length,
        totalBloqués: vehiculesBloqués.length,
        totalSains: vehiculesEnMission.length - vehiculesBloqués.length,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ── GET /api/vehicles/:id ─────────────────────────────────────────────────────
router.get("/:id", protect, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate("chauffeurAssigne", "nom prenom email")
      .populate(
        "transportEnCours",
        "numero motif statut patient dateTransport",
      );
    if (!vehicle)
      return res.status(404).json({ message: "Véhicule introuvable" });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/vehicles ────────────────────────────────────────────────────────
router.post(
  "/",
  protect,
  authorize("admin", "superviseur"),
  async (req, res) => {
    try {
      const vehicle = await Vehicle.create(req.body);
      res.status(201).json(vehicle);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// ── PUT /api/vehicles/:id ─────────────────────────────────────────────────────
router.put(
  "/:id",
  protect,
  authorize("admin", "superviseur"),
  async (req, res) => {
    try {
      const ancien = await Vehicle.findById(req.params.id);
      if (!ancien) return res.status(404).json({ message: "Introuvable" });

      const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });

      if (ancien.statut !== vehicle.statut) {
        socketService.emitUnitStatusChanged?.({
          unite: vehicle,
          ancienStatut: ancien.statut,
          nouveauStatut: vehicle.statut,
        });
      }

      res.json(vehicle);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// ── DELETE /api/vehicles/:id — Soft delete ────────────────────────────────────
router.delete("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    await Vehicle.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ message: "Véhicule supprimé" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/vehicles/:id/statut ────────────────────────────────────────────
router.patch("/:id/statut", protect, async (req, res) => {
  try {
    const { statut } = req.body;
    const valides = ["disponible", "en_mission", "maintenance", "hors_service"];
    if (!valides.includes(statut)) {
      return res
        .status(400)
        .json({ message: `Statut invalide. Valides : ${valides.join(", ")}` });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Introuvable" });

    const ancien = vehicle.statut;
    vehicle.statut = statut;
    await vehicle.save();

    socketService.emitUnitStatusChanged?.({
      unite: vehicle,
      ancienStatut: ancien,
      nouveauStatut: statut,
    });

    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/vehicles/:id/location — Mise à jour GPS ───────────────────────
router.patch("/:id/location", protect, async (req, res) => {
  try {
    const { lat, lng, adresse } = req.body;
    if (!lat || !lng)
      return res.status(400).json({ message: "lat et lng requis" });
    if (lat < -90 || lat > 90)
      return res.status(400).json({ message: "lat invalide" });
    if (lng < -180 || lng > 180)
      return res.status(400).json({ message: "lng invalide" });

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      {
        position: {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          adresse: adresse || "",
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!vehicle) return res.status(404).json({ message: "Introuvable" });

    socketService.emitLocationUpdated?.({
      unitId: vehicle._id,
      nom: vehicle.nom,
      type: vehicle.type,
      statut: vehicle.statut,
      position: vehicle.position,
      carburant: vehicle.carburant,
      kilometrage: vehicle.kilometrage,
      transportEnCours: vehicle.transportEnCours,
    });

    res.json({ message: "Position mise à jour", position: vehicle.position });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
