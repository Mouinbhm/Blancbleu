/**
 * BlancBleu — Routes Géodécision
 * GET /api/geo/units/nearby     → unités triées par proximité
 * GET /api/geo/eta              → calcul ETA direct
 * GET /api/geo/zone/check       → vérifier zone Nice
 */
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Unit = require("../models/Unit");
const {
  haversine,
  calculerETA,
  trierParProximite,
  estDansZoneNice,
} = require("../utils/geoUtils");

// ─── GET /api/geo/units/nearby ────────────────────────────────────────────────
// Retourne les unités disponibles triées par distance depuis un incident
// Query params : lat, lng, priorite, limit
router.get("/units/nearby", protect, async (req, res) => {
  try {
    const { lat, lng, priorite = "P2", limit = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ message: "lat et lng requis" });
    }

    const incidentLat = parseFloat(lat);
    const incidentLng = parseFloat(lng);

    // Charger toutes les unités disponibles
    const units = await Unit.find({ statut: "disponible" });

    if (units.length === 0) {
      return res.json({
        units: [],
        total: 0,
        message: "Aucune unité disponible",
      });
    }

    // Trier par proximité
    const unitsTries = trierParProximite(
      units,
      incidentLat,
      incidentLng,
      priorite,
    );

    // Limiter les résultats
    const unitsLimitees = unitsTries.slice(0, parseInt(limit));

    res.json({
      units: unitsLimitees,
      total: units.length,
      incident: { lat: incidentLat, lng: incidentLng },
      priorite,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/geo/eta ─────────────────────────────────────────────────────────
// Calcule l'ETA entre une unité et un incident
// Query params : unitId, incidentLat, incidentLng, priorite
router.get("/eta", protect, async (req, res) => {
  try {
    const { unitId, incidentLat, incidentLng, priorite = "P2" } = req.query;

    if (!unitId || !incidentLat || !incidentLng) {
      return res
        .status(400)
        .json({ message: "unitId, incidentLat, incidentLng requis" });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ message: "Unité introuvable" });
    if (!unit.position?.lat || !unit.position?.lng) {
      return res
        .status(400)
        .json({ message: "Position GPS de l'unité manquante" });
    }

    const dist = haversine(
      unit.position.lat,
      unit.position.lng,
      parseFloat(incidentLat),
      parseFloat(incidentLng),
    );
    const eta = calculerETA(dist, priorite);

    res.json({
      unite: { id: unit._id, nom: unit.nom, type: unit.type },
      distance: { km: dist, label: `${dist} km` },
      eta,
      position: unit.position,
      incident: { lat: parseFloat(incidentLat), lng: parseFloat(incidentLng) },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/geo/distance ────────────────────────────────────────────────────
// Calcule la distance entre 2 points GPS
router.get("/distance", protect, (req, res) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.query;
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return res.status(400).json({ message: "lat1, lng1, lat2, lng2 requis" });
    }
    const dist = haversine(
      parseFloat(lat1),
      parseFloat(lng1),
      parseFloat(lat2),
      parseFloat(lng2),
    );
    res.json({ distanceKm: dist, label: `${dist} km` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/geo/zone/check ──────────────────────────────────────────────────
// Vérifie si des coordonnées sont dans la zone Nice
router.get("/zone/check", protect, (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng)
    return res.status(400).json({ message: "lat et lng requis" });
  const dansZone = estDansZoneNice(parseFloat(lat), parseFloat(lng));
  res.json({
    dansZone,
    message: dansZone
      ? "Dans la zone de couverture Nice"
      : "Hors zone — intervention possible avec délai majoré",
  });
});

module.exports = router;
