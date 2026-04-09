/**
 * BlancBleu — Routes Workflow (State Machine)
 * Toutes les transitions d'une intervention
 */
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const {
  InterventionStateMachine,
  LABELS,
  TRANSITIONS,
} = require("../services/stateMachine");
const socketService = require("../services/socketService");

// ─── GET /api/workflow/:id/status ─────────────────────────────────────────────
// Retourne le statut actuel + transitions possibles + progression
router.get("/:id/status", protect, async (req, res) => {
  try {
    const intervention = await Intervention.findById(req.params.id).populate(
      "unitAssignee",
      "nom type statut",
    );

    if (!intervention) return res.status(404).json({ message: "Introuvable" });

    const transitions = InterventionStateMachine.transitionsPossibles(
      intervention.statut,
    );
    const progression = InterventionStateMachine.progression(
      intervention.statut,
    );

    res.json({
      _id: intervention._id,
      numero: intervention.numero,
      statut: intervention.statut,
      label: LABELS[intervention.statut]?.fr,
      couleur: LABELS[intervention.statut]?.color,
      icone: LABELS[intervention.statut]?.icon,
      progression,
      transitions,
      journal: intervention.journal,
      unitAssignee: intervention.unitAssignee,
      timestamps: {
        creation: intervention.heureCreation,
        validation: intervention.heureValidation,
        assignation: intervention.heureAssignation,
        depart: intervention.heureDepart,
        arrivee: intervention.heureArrivee,
        transport: intervention.heureTransport,
        terminee: intervention.heureTerminee,
        annulation: intervention.heureAnnulation,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/workflow/:id/transition ───────────────────────────────────────
// Effectue une transition de statut
// Body : { statut, notes }
router.patch("/:id/transition", protect, async (req, res) => {
  try {
    const { statut: nouveauStatut, notes } = req.body;

    if (!nouveauStatut) {
      return res.status(400).json({ message: "Nouveau statut requis" });
    }

    const intervention = await Intervention.findById(req.params.id).populate(
      "unitAssignee",
    );

    if (!intervention)
      return res.status(404).json({ message: "Intervention introuvable" });

    // Effectuer la transition via la state machine
    const { update, entreeJournal } =
      InterventionStateMachine.effectuerTransition(
        intervention,
        nouveauStatut,
        { utilisateur: req.user.email, notes },
      );

    // Appliquer la mise à jour
    Object.assign(intervention, update);
    intervention.journal.push(entreeJournal);
    await intervention.save();

    // ── Actions secondaires selon transition ──────────────────────────────
    if (nouveauStatut === "COMPLETED" || nouveauStatut === "CANCELLED") {
      // Libérer l'unité
      if (intervention.unitAssignee) {
        await Unit.findByIdAndUpdate(
          intervention.unitAssignee._id || intervention.unitAssignee,
          {
            statut: "disponible",
            interventionEnCours: null,
          },
        );
        socketService.emitStatutUnite(
          intervention.unitAssignee._id || intervention.unitAssignee,
          "disponible",
          intervention.unitAssignee.nom || "",
        );
      }
    }

    if (nouveauStatut === "ASSIGNED" && intervention.unitAssignee) {
      // Mettre l'unité en mission
      await Unit.findByIdAndUpdate(
        intervention.unitAssignee._id || intervention.unitAssignee,
        {
          statut: "en_mission",
          interventionEnCours: intervention._id,
        },
      );
    }

    // Émettre l'événement Socket.IO
    socketService.emitStatusUpdated({
      intervention,
      ancienStatut: entreeJournal.de,
      nouveauStatut,
      utilisateur: req.user?.email,
    });

    // Mettre à jour les stats
    socketService.emitStatsUpdate();

    const progressionVal = InterventionStateMachine.progression(nouveauStatut);

    res.json({
      message: `Transition ${intervention.journal[intervention.journal.length - 2]?.de || "?"} → ${nouveauStatut} effectuée`,
      intervention: {
        _id: intervention._id,
        statut: intervention.statut,
        label: LABELS[nouveauStatut]?.fr,
        progression: progressionVal,
      },
      transitions: InterventionStateMachine.transitionsPossibles(nouveauStatut),
    });
  } catch (err) {
    // Erreurs de la state machine (transition invalide)
    if (
      err.message.includes("Transition invalide") ||
      err.message.includes("Conditions non remplies")
    ) {
      return res.status(422).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/workflow/transitions ───────────────────────────────────────────
// Retourne toutes les transitions possibles (pour documentation)
router.get("/transitions", protect, (req, res) => {
  const map = Object.entries(TRANSITIONS).map(([de, vers]) => ({
    de,
    label_de: LABELS[de]?.fr,
    vers: vers.map((v) => ({
      statut: v,
      label: LABELS[v]?.fr,
      icon: LABELS[v]?.icon,
    })),
  }));
  res.json(map);
});

module.exports = router;
