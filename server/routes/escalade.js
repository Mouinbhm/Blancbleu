/**
 * BlancBleu — Routes Escalade
 */
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const {
  analyserEscalade,
  verifierDisponibiliteUnites,
  surveillerInterventionsActives,
  SEUILS,
  NIVEAUX,
} = require("../services/escaladeService");

// ─── POST /api/escalade/analyser ─────────────────────────────────────────────
// Analyse les escalades pour une intervention donnée
router.post("/analyser", protect, async (req, res) => {
  try {
    const { interventionId } = req.body;
    if (!interventionId)
      return res.status(400).json({ message: "interventionId requis" });

    const intervention =
      await Intervention.findById(interventionId).populate("unitAssignee");
    if (!intervention)
      return res.status(404).json({ message: "Intervention introuvable" });

    const resultat = await analyserEscalade(
      intervention,
      intervention.unitAssignee,
    );
    res.json(resultat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/escalade/dashboard ─────────────────────────────────────────────
// Vue globale des escalades actives
router.get("/dashboard", protect, async (req, res) => {
  try {
    const [unitesDispo, interventionsActives] = await Promise.all([
      Unit.countDocuments({ statut: "disponible" }),
      Intervention.find({
        statut: {
          $in: ["CREATED", "VALIDATED", "ASSIGNED", "EN_ROUTE", "ON_SITE"],
        },
      })
        .populate("unitAssignee")
        .sort({ priorite: 1, createdAt: 1 }),
    ]);

    // Analyser chaque intervention active
    const analyses = await Promise.all(
      interventionsActives.map(async (i) => {
        const r = await analyserEscalade(i, i.unitAssignee);
        return {
          interventionId: i._id,
          numero: i.numero,
          priorite: i.priorite,
          typeIncident: i.typeIncident,
          statut: i.statut,
          alertes: r.alertes.length,
          niveauMax: r.niveauMaximal?.label || "OK",
          resume: r.resume,
        };
      }),
    );

    const necessitentAction = analyses.filter((a) => a.alertes > 0);

    res.json({
      resume: {
        unitesDispo,
        interventionsActives: interventionsActives.length,
        necessitentAction: necessitentAction.length,
        niveau:
          necessitentAction.length > 0
            ? necessitentAction.some((a) => a.niveauMax === "Urgence")
              ? "EMERGENCY"
              : "WARNING"
            : "OK",
      },
      interventions: analyses,
      seuils: SEUILS,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/escalade/unites/status ─────────────────────────────────────────
// Statut global des unités + alertes disponibilité
router.get("/unites/status", protect, async (req, res) => {
  try {
    const [total, disponibles, enMission, maintenance] = await Promise.all([
      Unit.countDocuments(),
      Unit.countDocuments({ statut: "disponible" }),
      Unit.countDocuments({ statut: "en_mission" }),
      Unit.countDocuments({ statut: "maintenance" }),
    ]);

    const tauxDispo = total > 0 ? Math.round((disponibles / total) * 100) : 0;

    let alerte = null;
    if (disponibles === 0) {
      alerte = { niveau: "EMERGENCY", message: "Aucune unité disponible" };
    } else if (tauxDispo < 25) {
      alerte = {
        niveau: "CRITICAL",
        message: `Seulement ${disponibles} unité(s) disponible(s)`,
      };
    } else if (tauxDispo < 50) {
      alerte = {
        niveau: "WARNING",
        message: `Faible disponibilité : ${tauxDispo}%`,
      };
    }

    res.json({ total, disponibles, enMission, maintenance, tauxDispo, alerte });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/escalade/scan ──────────────────────────────────────────────────
// Déclenche un scan manuel
router.post("/scan", protect, async (req, res) => {
  try {
    const resultat = await surveillerInterventionsActives();
    res.json({ message: "Scan terminé", ...resultat });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
