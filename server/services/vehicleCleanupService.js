/**
 * BlancBleu — Service nettoyage véhicules bloqués
 *
 * Extrait de server.js pour séparation des responsabilités.
 * Détecte et libère automatiquement les véhicules restés "En service"
 * après la fin de leur transport.  Idempotent et non-bloquant.
 */
const logger = require("../utils/logger");

const STATUTS_TERMINES = ["COMPLETED", "CANCELLED", "NO_SHOW", "BILLED", "PAID", "FAILED"];

/**
 * Vérifie tous les véhicules "En service" et libère ceux dont le transport
 * associé est terminé ou introuvable.
 * @returns {{ verifies: number, liberes: number, details: Array }}
 */
async function nettoyerVehiculesBloqués() {
  // Imports locaux pour éviter les dépendances circulaires au chargement
  const Vehicle = require("../models/Vehicle");
  const Transport = require("../models/Transport");
  const DriverShift = require("../models/DriverShift");

  const vehiculesEnMission = await Vehicle.find({
    statut: "En service",
    deletedAt: null,
  });

  let liberes = 0;
  const details = [];

  for (const vehicule of vehiculesEnMission) {
    let doitLiberer = false;
    let raison = "";

    // Un véhicule tenu par un shift actif est "En service" sans transport en
    // cours : ce n'est pas un véhicule bloqué, c'est un chauffeur qui a pris
    // son service. Le repasser "Disponible" le ferait apparaître libre dans la
    // flotte alors que son shift tourne toujours.
    const surShiftActif = vehicule.currentShiftId
      ? !!(await DriverShift.exists({ _id: vehicule.currentShiftId, status: "ACTIVE" }))
      : false;

    if (!vehicule.transportEnCours) {
      doitLiberer = true;
      raison = "aucun transport associé";
    } else {
      const transport = await Transport.findById(vehicule.transportEnCours).select("numero statut");

      if (!transport) {
        doitLiberer = true;
        raison = "transport introuvable en base";
      } else if (STATUTS_TERMINES.includes(transport.statut)) {
        doitLiberer = true;
        raison = `transport ${transport.numero} terminé (${transport.statut})`;
      }
    }

    // Rien à libérer sur un véhicule au repos entre deux missions de son shift.
    if (doitLiberer && surShiftActif && !vehicule.transportEnCours) {
      continue;
    }

    if (doitLiberer) {
      // Shift actif : on détache le transport terminé mais le véhicule reste
      // "En service", tenu par son shift.
      const statutApres = surShiftActif ? "En service" : "Disponible";

      await Vehicle.findByIdAndUpdate(vehicule._id, {
        statut: statutApres,
        transportEnCours: null,
        // Mise à jour du sous-document availability si présent. "available" vaut
        // ici "assignable" : un véhicule sur shift sans mission l'est aussi.
        "availability.currentStatus": "available",
        "availability.currentTransportId": null,
        "availability.unavailableReason": "",
      });

      logger.info("Véhicule débloqué automatiquement", {
        vehicule: vehicule.nom,
        immatriculation: vehicule.immatriculation,
        statut: statutApres,
        raison,
      });

      details.push({ vehiculeId: vehicule._id, nom: vehicule.nom, raison });
      liberes++;
    }
  }

  if (vehiculesEnMission.length > 0 || liberes > 0) {
    logger.info("Nettoyage véhicules terminé", {
      verifies: vehiculesEnMission.length,
      liberes,
    });
  }

  // Notification Socket.IO si des véhicules ont été débloqués
  if (liberes > 0) {
    try {
      const socketService = require("./socketService");
      const io = socketService.getIO?.();
      if (io) {
        io.to("role:admin").to("role:dispatcher").emit("fleet:vehicles_cleaned", {
          liberes,
          details,
          timestamp: new Date(),
        });
      }
    } catch {
      // Socket non disponible — non bloquant
    }
  }

  return { verifies: vehiculesEnMission.length, liberes, details };
}

module.exports = { nettoyerVehiculesBloqués };
