/**
 * BlancBleu — Service Lifecycle Transport Non Urgent
 *
 * Orchestre toutes les transitions métier d'un transport :
 *   REQUESTED → CONFIRMED → SCHEDULED → ASSIGNED
 *   → EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP
 *   → PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION → COMPLETED
 *
 * Remplace unitLifecycle.js (urgences)
 */

const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const Facture = require("../models/Facture");
const { TransportStateMachine } = require("./transportStateMachine");
const { smartDispatch } = require("./smartDispatch");
const socketService = require("./socketService");
const { audit, log } = require("./auditService");
const { haversine } = require("../utils/geoUtils");
const tarifService = require("./tarifService");
const logger = (() => {
  try {
    return require("../utils/logger");
  } catch {
    return console;
  }
})();

// ── Helper : effectuer une transition et sauvegarder ──────────────────────────
async function _transition(transportId, nouveauStatut, metadata = {}) {
  const transport = await Transport.findById(transportId)
    .populate("vehicule", "nom type statut position kilometrage carburant")
    .populate("chauffeur", "nom prenom email");

  if (!transport) throw new Error("Transport introuvable");
  if (TransportStateMachine.estTerminal(transport.statut)) {
    throw new Error(`Transport déjà terminé (statut: ${transport.statut})`);
  }

  const { update, entreeJournal } = TransportStateMachine.effectuerTransition(
    transport,
    nouveauStatut,
    metadata,
  );

  Object.assign(transport, update);
  transport.journal.push(entreeJournal);
  await transport.save();

  // ── Garde-fou : libération automatique du véhicule ────────────────────────
  // Garantit que le véhicule est libéré dès que la transition est persistée,
  // même si la fonction appelante (completerTransport, annulerTransport…) échoue
  // après ce point. Idempotent : re-libérer un véhicule déjà disponible est sans effet.
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(nouveauStatut)) {
    const vehiculeId = transport.vehicule?._id ?? transport.vehicule;
    if (vehiculeId) {
      try {
        await Vehicle.findByIdAndUpdate(vehiculeId, {
          statut: "disponible",
          transportEnCours: null,
        });
        logger.info("Véhicule libéré (garde-fou lifecycle)", {
          vehiculeId,
          transport: transport.numero,
          nouveauStatut,
        });
      } catch (errLiberation) {
        // Non bloquant — la transition est déjà sauvegardée
        logger.warn("Garde-fou : échec libération véhicule", {
          vehiculeId,
          transport: transport.numero,
          err: errLiberation.message,
        });
      }
    }
  }

  // Émettre événement Socket.IO
  socketService.emitStatusUpdated?.({
    intervention: {
      _id: transport._id,
      numero: transport.numero,
      priorite: "transport",
    },
    ancienStatut: entreeJournal.de,
    nouveauStatut,
    utilisateur: metadata.utilisateur || "système",
  });
  socketService.emitStatsUpdate?.();

  return transport;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CONFIRMER UN TRANSPORT
// ══════════════════════════════════════════════════════════════════════════════
async function confirmerTransport(transportId, utilisateur) {
  const transport = await _transition(transportId, "CONFIRMED", {
    utilisateur: utilisateur.email,
    notes: "Transport confirmé",
  });

  await log({
    action: "STATUT_CHANGED",
    origine: "HUMAIN",
    utilisateur,
    ressource: {
      type: "Transport",
      id: transport._id,
      reference: transport.numero,
    },
    details: {
      avant: { statut: "REQUESTED" },
      apres: { statut: "CONFIRMED" },
      message: "Transport confirmé",
    },
  });

  logger.info("Transport confirmé", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PLANIFIER UN TRANSPORT (avec vérification PMT si nécessaire)
// ══════════════════════════════════════════════════════════════════════════════
async function planifierTransport(transportId, utilisateur) {
  const transport = await _transition(transportId, "SCHEDULED", {
    utilisateur: utilisateur.email,
  });

  logger.info("Transport planifié", {
    numero: transport.numero,
    date: transport.dateTransport,
  });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. ASSIGNER VÉHICULE + CHAUFFEUR (manuel ou auto)
// ══════════════════════════════════════════════════════════════════════════════
async function assignerVehicule(
  transportId,
  { vehiculeId, chauffeurId, auto = false },
  utilisateur,
) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  let vehiculeIdFinal = vehiculeId;
  let chauffeurIdFinal = chauffeurId;
  let scoreDispatch = null;
  let justification = [];

  if (auto) {
    // Auto-dispatch intelligent
    const dispatch = await smartDispatch({
      mobilite: transport.patient.mobilite,
      dateTransport: transport.dateTransport,
      heureRDV: transport.heureRDV,
      coordonneesDepart: transport.adresseDepart.coordonnees,
    });

    if (!dispatch.vehicule) {
      throw new Error(
        `Aucun véhicule disponible : ${dispatch.justification[0]}`,
      );
    }

    vehiculeIdFinal = dispatch.vehicule._id;
    chauffeurIdFinal = dispatch.chauffeur?._id || chauffeurId;
    scoreDispatch = dispatch.scoreTotal;
    justification = dispatch.justification;
  }

  // Mettre à jour avant la transition
  await Transport.findByIdAndUpdate(transportId, {
    vehicule: vehiculeIdFinal,
    chauffeur: chauffeurIdFinal,
    scoreDispatch,
  });

  // Mettre le véhicule en mission
  await Vehicle.findByIdAndUpdate(vehiculeIdFinal, {
    statut: "en_mission",
    transportEnCours: transportId,
  });

  const transportUpdated = await _transition(transportId, "ASSIGNED", {
    utilisateur: utilisateur.email,
    notes: auto
      ? `Auto-dispatch : ${justification[0]}`
      : "Assignation manuelle",
  });

  socketService.emitUnitAssigned?.({
    intervention: { _id: transport._id, numero: transport.numero },
    unite: { _id: vehiculeIdFinal },
    score: scoreDispatch,
    source: auto ? "AUTO" : "MANUEL",
  });

  logger.info("Véhicule assigné", {
    numero: transport.numero,
    vehicule: vehiculeIdFinal,
    auto,
    score: scoreDispatch,
  });

  return { transport: transportUpdated, justification };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. EN ROUTE VERS LE PATIENT
// ══════════════════════════════════════════════════════════════════════════════
async function marquerEnRoute(transportId, utilisateur) {
  const transport = await _transition(transportId, "EN_ROUTE_TO_PICKUP", {
    utilisateur: utilisateur.email,
  });

  logger.info("En route vers patient", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. ARRIVÉ CHEZ LE PATIENT
// ══════════════════════════════════════════════════════════════════════════════
async function marquerArriveePatient(
  transportId,
  positionActuelle,
  utilisateur,
) {
  const transport = await _transition(transportId, "ARRIVED_AT_PICKUP", {
    utilisateur: utilisateur.email,
  });

  // Mettre à jour position du véhicule si fournie
  if (positionActuelle?.lat && transport.vehicule) {
    await Vehicle.findByIdAndUpdate(transport.vehicule, {
      position: { ...positionActuelle, updatedAt: new Date() },
    });
  }

  logger.info("Arrivé chez le patient", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. PATIENT À BORD
// ══════════════════════════════════════════════════════════════════════════════
async function marquerPatientABord(transportId, utilisateur) {
  const transport = await _transition(transportId, "PATIENT_ON_BOARD", {
    utilisateur: utilisateur.email,
  });

  logger.info("Patient à bord", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. ARRIVÉ À DESTINATION
// ══════════════════════════════════════════════════════════════════════════════
async function marquerArriveeDestination(
  transportId,
  positionActuelle,
  utilisateur,
) {
  const transport = await _transition(transportId, "ARRIVED_AT_DESTINATION", {
    utilisateur: utilisateur.email,
  });

  // Calculer distance parcourue si GPS disponible
  if (positionActuelle?.lat && transport.adresseDepart?.coordonnees?.lat) {
    const dist = haversine(
      transport.adresseDepart.coordonnees.lat,
      transport.adresseDepart.coordonnees.lng,
      positionActuelle.lat,
      positionActuelle.lng,
    );
    if (transport.vehicule) {
      const vehicle = await Vehicle.findById(transport.vehicule);
      if (vehicle) {
        vehicle.kilometrage =
          Math.round((vehicle.kilometrage + dist) * 10) / 10;
        await vehicle.save();
      }
    }
  }

  logger.info("Arrivé à destination", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. COMPLÉTER LE TRANSPORT
// ══════════════════════════════════════════════════════════════════════════════
async function completerTransport(transportId, utilisateur) {
  const transport = await _transition(transportId, "COMPLETED", {
    utilisateur: utilisateur.email,
  });

  // Libérer le véhicule
  if (transport.vehicule) {
    await Vehicle.findByIdAndUpdate(transport.vehicule, {
      statut: "disponible",
      transportEnCours: null,
    });
    socketService.emitUnitStatusChanged?.({
      unite: { _id: transport.vehicule, nom: "" },
      ancienStatut: "en_mission",
      nouveauStatut: "disponible",
    });
  }

  await log({
    action: "STATUT_CHANGED",
    origine: "HUMAIN",
    utilisateur,
    ressource: {
      type: "Transport",
      id: transport._id,
      reference: transport.numero,
    },
    details: {
      avant: { statut: "ARRIVED_AT_DESTINATION" },
      apres: { statut: "COMPLETED" },
      message: `Transport ${transport.numero} complété en ${transport.dureeReelleMinutes} min`,
    },
  });

  // ── Création automatique de la facture pré-remplie (best-effort) ──────────
  // Non bloquant : un échec ici ne remet pas en cause la complétion du transport.
  // La facture peut toujours être créée manuellement depuis le module facturation.
  try {
    const factureExistante = await Facture.findOne({ transport: transport._id });
    if (!factureExistante) {
      const tarif = await tarifService.calculerTarif(transport);
      const patientLabel = [transport.patient?.nom, transport.patient?.prenom]
        .filter(Boolean)
        .join(" ");
      const lieuLabel =
        transport.adresseDestination?.nom ||
        transport.adresseDestination?.ville ||
        "Non précisé";

      await Facture.create({
        transport: transport._id,
        patient: patientLabel,
        motif: transport.motif,
        lieu: lieuLabel,
        montant: tarif.montantTotal,
        montantCPAM: tarif.montantCPAM,
        montantPatient: tarif.montantPatient,
        distanceKm: tarif.distanceKm,
        typeVehicule: transport.typeTransport,
        statut: "en-attente",
        notes: tarif.details.join("\n"),
      });
      logger.info("Facture auto-créée", {
        numero: transport.numero,
        montant: tarif.montantTotal,
      });
    }
  } catch (err) {
    // Journaliser sans bloquer le workflow
    logger.warn("Création facture automatique échouée", {
      transport: transport.numero,
      err: err.message,
    });
  }

  logger.info("Transport complété", {
    numero: transport.numero,
    duree: transport.dureeReelleMinutes,
  });

  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 8b. ATTENTE À DESTINATION (dialyse, chimio, rééducation…)
//     Statut optionnel — le véhicule reste en mission pendant toute l'attente.
// ══════════════════════════════════════════════════════════════════════════════
async function demarrerAttenteDestination(
  transportId,
  dureeAttenteMinutes,
  utilisateur,
) {
  // Persister la durée estimée avant la transition (best-effort)
  if (dureeAttenteMinutes != null) {
    await Transport.findByIdAndUpdate(transportId, { dureeAttenteMinutes });
  }

  const transport = await _transition(transportId, "WAITING_AT_DESTINATION", {
    utilisateur: utilisateur.email,
    notes: dureeAttenteMinutes
      ? `Attente estimée : ${dureeAttenteMinutes} min`
      : "Attente à destination démarrée",
    dureeAttenteMinutes,
  });

  // Le véhicule reste en statut "en_mission" — pas de modification ici.
  logger.info("Attente à destination démarrée", {
    numero: transport.numero,
    dureeEstimeeMin: dureeAttenteMinutes ?? "non renseignée",
  });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 8c. RETOUR BASE — trajet chauffeur après dépôt du patient
//     Met à jour vehicle.kilometrage via Haversine (destination → départ).
//     Le véhicule reste en mission jusqu'à la complétion.
// ══════════════════════════════════════════════════════════════════════════════
async function demarrerRetourBase(transportId, positionActuelle, utilisateur) {
  const transport = await Transport.findById(transportId).populate(
    "vehicule",
    "kilometrage statut",
  );
  if (!transport) throw new Error("Transport introuvable");

  // Calculer la distance de retour : position actuelle (ou destination) → départ
  const posRef = positionActuelle?.lat
    ? positionActuelle
    : transport.adresseDestination?.coordonnees;
  const posBase = transport.adresseDepart?.coordonnees;

  if (posRef?.lat && posBase?.lat && transport.vehicule) {
    const distRetourKm = haversine(
      posRef.lat,
      posRef.lng,
      posBase.lat,
      posBase.lng,
    );
    await Vehicle.findByIdAndUpdate(transport.vehicule._id, {
      kilometrage:
        Math.round(((transport.vehicule.kilometrage || 0) + distRetourKm) * 10) /
        10,
    });
    logger.info("Kilométrage retour mis à jour", {
      numero: transport.numero,
      distRetourKm: Math.round(distRetourKm * 10) / 10,
    });
  }

  const updated = await _transition(transportId, "RETURN_TO_BASE", {
    utilisateur: utilisateur.email,
    notes: "Retour base en cours",
  });

  logger.info("Retour base démarré", { numero: transport.numero });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. NO-SHOW (patient absent)
// ══════════════════════════════════════════════════════════════════════════════
async function marquerNoShow(transportId, raison, utilisateur) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  transport.raisonNoShow = raison || "Patient absent à l'heure prévue";
  await transport.save();

  const updated = await _transition(transportId, "NO_SHOW", {
    utilisateur: utilisateur.email,
    notes: transport.raisonNoShow,
  });

  // Libérer le véhicule
  if (updated.vehicule) {
    await Vehicle.findByIdAndUpdate(updated.vehicule, {
      statut: "disponible",
      transportEnCours: null,
    });
  }

  logger.info("No-show enregistré", { numero: transport.numero, raison });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. ANNULER
// ══════════════════════════════════════════════════════════════════════════════
async function annulerTransport(transportId, raison, utilisateur) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  transport.raisonAnnulation = raison || "Annulé par l'opérateur";
  await transport.save();

  const updated = await _transition(transportId, "CANCELLED", {
    utilisateur: utilisateur.email,
    raisonAnnulation: transport.raisonAnnulation,
  });

  // Libérer le véhicule si assigné
  if (updated.vehicule) {
    await Vehicle.findByIdAndUpdate(updated.vehicule, {
      statut: "disponible",
      transportEnCours: null,
    });
  }

  logger.info("Transport annulé", { numero: transport.numero, raison });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. REPROGRAMMER
// ══════════════════════════════════════════════════════════════════════════════
async function reprogrammerTransport(
  transportId,
  { nouvelleDate, raison },
  utilisateur,
) {
  if (!nouvelleDate)
    throw new Error("Nouvelle date obligatoire pour reprogrammer");

  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  transport.raisonReprogrammation = raison || "Reprogrammé à la demande";
  await transport.save();

  const updated = await _transition(transportId, "RESCHEDULED", {
    utilisateur: utilisateur.email,
    raisonReprogrammation: transport.raisonReprogrammation,
    nouvelleDate,
  });

  // Libérer le véhicule si assigné
  if (updated.vehicule) {
    await Vehicle.findByIdAndUpdate(updated.vehicule, {
      statut: "disponible",
      transportEnCours: null,
    });
    await Transport.findByIdAndUpdate(transportId, {
      vehicule: null,
      chauffeur: null,
    });
  }

  logger.info("Transport reprogrammé", {
    numero: transport.numero,
    nouvelleDate,
  });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. CLÔTURE FINANCIÈRE — BILLED (superviseur/admin uniquement)
//     Le contrôleur doit vérifier le rôle avant d'appeler cette fonction.
// ══════════════════════════════════════════════════════════════════════════════
async function cloturerFacturation(transportId, factureId, utilisateur) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  // Associer la facture sur le document avant la transition
  // (le validateur COMPLETED_BILLED inspecte transport.facture)
  if (factureId) {
    transport.facture = factureId;
    transport._factureIdTemp = factureId; // flag pour le validateur in-memory
    await transport.save();
  }

  const updated = await _transition(transportId, "BILLED", {
    utilisateur: utilisateur.email,
    notes: `Clôture CPAM — facture ${factureId || transport.facture}`,
    factureId: factureId || transport.facture,
  });

  await log({
    action: "STATUT_CHANGED",
    origine: "HUMAIN",
    utilisateur,
    ressource: {
      type: "Transport",
      id: transport._id,
      reference: transport.numero,
    },
    details: {
      avant: { statut: "COMPLETED" },
      apres: { statut: "BILLED" },
      message: `Transport ${transport.numero} facturé (CPAM)`,
    },
  });

  logger.info("Transport facturé (BILLED)", {
    numero: transport.numero,
    factureId: factureId || transport.facture,
  });
  return { transport: updated };
}

module.exports = {
  confirmerTransport,
  planifierTransport,
  assignerVehicule,
  marquerEnRoute,
  marquerArriveePatient,
  marquerPatientABord,
  marquerArriveeDestination,
  demarrerAttenteDestination,
  demarrerRetourBase,
  completerTransport,
  cloturerFacturation,
  marquerNoShow,
  annulerTransport,
  reprogrammerTransport,
};
