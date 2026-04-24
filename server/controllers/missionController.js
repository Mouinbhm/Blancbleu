/**
 * BlancBleu — Mission Controller v1.0
 * Gestion des missions opérationnelles liées aux transports.
 *
 * Règles métier appliquées :
 * - Un transport ne peut avoir qu'une seule mission active
 * - Un véhicule en maintenance ne peut pas être assigné
 * - Un chauffeur inactif ne peut pas être assigné
 * - La compatibilité patient/véhicule est vérifiée à l'assignation
 */
const Mission = require("../models/Mission");
const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const Personnel = require("../models/Personnel");
const Facture = require("../models/Facture");
const socketService = require("../services/socketService");
const aiDispatchService = require("../services/aiDispatchService");
const factureService = require("../services/factureService");
const logger = require("../utils/logger");

const _err = (res, err, status = 500) => {
  logger.error("missionController", { err: err.message });
  res.status(status).json({ message: err.message || "Erreur interne" });
};

// ── Validation compatibilité patient → véhicule ────────────────────────────────
async function verifierCompatibilite(transport, vehicleId) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new Error("Véhicule introuvable");
  if (vehicle.statut === "maintenance") throw new Error("Ce véhicule est en maintenance");
  if (vehicle.statut === "hors_service") throw new Error("Ce véhicule est hors service");

  const mobilite = transport.patient?.mobilite;
  if (!mobilite) return vehicle;

  if (mobilite === "FAUTEUIL_ROULANT" && !vehicle.capacites?.equipeFauteuil)
    throw new Error("Ce véhicule n'est pas équipé pour fauteuil roulant (TPMR requis)");
  if (["ALLONGE", "CIVIERE"].includes(mobilite) && !vehicle.capacites?.equipeBrancard)
    throw new Error("Ce véhicule n'est pas équipé pour patient allongé (AMBULANCE requise)");
  if (transport.patient?.oxygene && !vehicle.capacites?.equipeOxygene)
    throw new Error("Ce véhicule n'est pas équipé en oxygène");

  return vehicle;
}

// ── GET /api/missions/stats ───────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [total, enCours, terminees, planifiees, annulees] = await Promise.all([
      Mission.countDocuments(),
      Mission.countDocuments({ statut: "en_cours" }),
      Mission.countDocuments({ statut: "terminee" }),
      Mission.countDocuments({ statut: { $in: ["planifiee", "assignee"] } }),
      Mission.countDocuments({ statut: "annulee" }),
    ]);
    res.json({ total, enCours, terminees, planifiees, annulees });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/missions ─────────────────────────────────────────────────────────
exports.getMissions = async (req, res) => {
  try {
    const { statut, vehicleId, chauffeurId, transportId, date, page = 1, limit = 50 } = req.query;
    const filtre = {};
    if (statut) filtre.statut = statut;
    if (vehicleId) filtre.vehicleId = vehicleId;
    if (chauffeurId) filtre.chauffeurId = chauffeurId;
    if (transportId) filtre.transportId = transportId;
    if (date) {
      const d = new Date(date);
      const fin = new Date(d);
      fin.setDate(fin.getDate() + 1);
      filtre.plannedAt = { $gte: d, $lt: fin };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [missions, total] = await Promise.all([
      Mission.find(filtre)
        .populate("transportId", "numero motif statut dateTransport heureRDV patient adresseDepart adresseDestination")
        .populate("vehicleId", "nom immatriculation type statut")
        .populate("chauffeurId", "nom prenom telephone")
        .sort({ plannedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Mission.countDocuments(filtre),
    ]);

    res.json({ missions, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    _err(res, err);
  }
};

// ── GET /api/missions/:id ─────────────────────────────────────────────────────
exports.getMission = async (req, res) => {
  try {
    const mission = await Mission.findById(req.params.id)
      .populate("transportId")
      .populate("vehicleId", "nom immatriculation type statut capacites")
      .populate("chauffeurId", "nom prenom telephone role")
      .populate("personnelIds", "nom prenom role");
    if (!mission) return res.status(404).json({ message: "Mission introuvable" });
    res.json(mission);
  } catch (err) {
    _err(res, err);
  }
};

// ── POST /api/missions ────────────────────────────────────────────────────────
exports.createMission = async (req, res) => {
  try {
    let { transportId, vehicleId, chauffeurId, personnelIds, dispatchMode, plannedAt } = req.body;

    const transport = await Transport.findOne({ _id: transportId, deletedAt: null });
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    const missionExistante = await Mission.findOne({
      transportId,
      statut: { $nin: ["annulee"] },
    });
    if (missionExistante) {
      return res.status(400).json({ message: "Une mission existe déjà pour ce transport" });
    }

    // ── Dispatch IA ──────────────────────────────────────────────────────────
    let iaRecommendation = null;
    if (dispatchMode === "ia") {
      try {
        const iaResult = await aiDispatchService.getBestAssignment(transport);
        if (iaResult.ok) {
          iaRecommendation = {
            suggestedVehicleId: iaResult.vehicleId,
            suggestedDriverId: iaResult.driverId,
            confidence: iaResult.confidence,
            justification: iaResult.justification,
            alternatives: iaResult.alternatives || [],
            generatedAt: new Date(),
          };
          // Auto-assign si le score dépasse le seuil de confiance
          if (iaResult.autoApplicable) {
            vehicleId = vehicleId || iaResult.vehicleId;
            chauffeurId = chauffeurId || iaResult.driverId;
            logger.info("[missionController] IA auto-assigné", {
              vehicleId,
              chauffeurId,
              confidence: iaResult.confidence,
            });
          }
        }
      } catch (iaErr) {
        logger.warn("[missionController] IA indisponible, passage en manuel", { err: iaErr.message });
        dispatchMode = "manuel";
      }
    }

    // Validation compatibilité véhicule
    if (vehicleId) {
      await verifierCompatibilite(transport, vehicleId);
    }

    // Validation chauffeur — doit exister dans Personnel (pas User)
    if (chauffeurId) {
      const chauffeur = await Personnel.findById(chauffeurId);
      if (!chauffeur) {
        return res.status(404).json({ message: "Chauffeur introuvable dans le référentiel Personnel" });
      }
      if (!["Chauffeur", "Ambulancier"].includes(chauffeur.role)) {
        return res.status(400).json({
          message: `Le personnel sélectionné (rôle : ${chauffeur.role}) ne peut pas conduire. Rôle requis : Chauffeur ou Ambulancier`,
        });
      }
      if (chauffeur.statut !== "en-service") {
        return res.status(400).json({
          message: `Ce chauffeur n'est pas en service (statut actuel : ${chauffeur.statut})`,
        });
      }
    }

    const mission = await Mission.create({
      transportId,
      vehicleId: vehicleId || null,
      chauffeurId: chauffeurId || null,
      personnelIds: personnelIds || [],
      dispatchMode: dispatchMode || "manuel",
      plannedAt: plannedAt || new Date(),
      statut: vehicleId ? "assignee" : "planifiee",
      assignedAt: vehicleId ? new Date() : null,
      ...(iaRecommendation && { iaRecommendation }),
    });

    if (vehicleId) {
      await Vehicle.findByIdAndUpdate(vehicleId, {
        statut: "en_mission",
        transportEnCours: transportId,
      });
    }

    const populated = await Mission.findById(mission._id)
      .populate("transportId", "numero motif statut")
      .populate("vehicleId", "nom immatriculation type")
      .populate("chauffeurId", "nom prenom");

    res.status(201).json(populated);
  } catch (err) {
    _err(res, err, err.name === "ValidationError" ? 400 : 500);
  }
};

// ── PATCH /api/missions/:id/statut ────────────────────────────────────────────
// Mettre à jour le statut opérationnel de la mission (terrain)
exports.updateStatut = async (req, res) => {
  try {
    const { statut, notes } = req.body;
    const mission = await Mission.findById(req.params.id);
    if (!mission) return res.status(404).json({ message: "Mission introuvable" });

    const now = new Date();
    const updates = { statut };
    if (notes) updates.notes = notes;

    // Horodatages automatiques selon statut
    switch (statut) {
      case "en_cours":   updates.startedAt = now; break;
      case "terminee":
        updates.completedAt = now;
        if (mission.startedAt) {
          updates.dureeReelleMinutes = Math.round((now - mission.startedAt) / 60000);
        }
        break;
      case "annulee":
        updates.cancelledAt = now;
        updates.raisonAnnulation = req.body.raisonAnnulation || "";
        break;
    }

    Object.assign(mission, updates);
    await mission.save();

    // Libérer le véhicule si mission terminée/annulée
    if (["terminee", "annulee"].includes(statut) && mission.vehicleId) {
      await Vehicle.findByIdAndUpdate(mission.vehicleId, {
        statut: "disponible",
        transportEnCours: null,
      });
    }

    socketService.emitStatusUpdated?.({
      type: "mission",
      id: mission._id,
      statut,
    });

    res.json(mission);
  } catch (err) {
    _err(res, err);
  }
};

// ── PATCH /api/missions/:id ───────────────────────────────────────────────────
exports.updateMission = async (req, res) => {
  try {
    const mission = await Mission.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    )
      .populate("transportId", "numero motif statut")
      .populate("vehicleId", "nom immatriculation type")
      .populate("chauffeurId", "nom prenom");
    if (!mission) return res.status(404).json({ message: "Mission introuvable" });
    res.json(mission);
  } catch (err) {
    _err(res, err, err.name === "ValidationError" ? 400 : 500);
  }
};

// ── POST /api/missions/:id/terminer ───────────────────────────────────────────
// Terminer la mission + créer la facture automatiquement
exports.terminerMission = async (req, res) => {
  try {
    const { distanceKm, dureeAttenteMinutes } = req.body;
    const mission = await Mission.findById(req.params.id)
      .populate("transportId");

    if (!mission) return res.status(404).json({ message: "Mission introuvable" });
    if (mission.statut === "terminee") {
      return res.status(400).json({ message: "Mission déjà terminée" });
    }

    const now = new Date();
    mission.statut = "terminee";
    mission.completedAt = now;
    mission.distanceReelleKm = distanceKm || null;
    mission.dureeAttenteMinutes = dureeAttenteMinutes || null;
    if (mission.startedAt) {
      mission.dureeReelleMinutes = Math.round((now - mission.startedAt) / 60000);
    }
    await mission.save();

    // Libérer le véhicule
    if (mission.vehicleId) {
      await Vehicle.findByIdAndUpdate(mission.vehicleId, {
        statut: "disponible",
        transportEnCours: null,
      });
    }

    // Faire évoluer le transport vers COMPLETED
    const transport = mission.transportId;
    if (transport && !["COMPLETED", "BILLED"].includes(transport.statut)) {
      transport.statut = "COMPLETED";
      transport.heureTerminee = now;
      transport.dureeReelleMinutes = mission.dureeReelleMinutes;
      await transport.save();
    }

    // Créer la facture automatiquement
    let facture = null;
    try {
      const result = await factureService.createFactureFromMission(mission._id);
      facture = result.facture;
      if (result.created) {
        logger.info("[missionController] Facture auto-créée", { numero: facture.numero });
      }
    } catch (factErr) {
      logger.warn("[missionController] Création facture échouée (non bloquant)", { err: factErr.message });
    }

    socketService.emitStatusUpdated?.({ type: "mission", id: mission._id, statut: "terminee" });
    res.json({ mission, facture, message: "Mission terminée avec succès" });
  } catch (err) {
    _err(res, err);
  }
};
