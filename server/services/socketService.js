/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — Service Socket.IO Temps Réel v4.0              ║
 * ║  Transport sanitaire NON urgent                             ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  ÉVÉNEMENTS ÉMIS :                                          ║
 * ║  transport:created       → nouveau transport créé           ║
 * ║  transport:updated       → modification générale            ║
 * ║  transport:statut        → changement de statut             ║
 * ║  vehicule:assigne        → véhicule assigné                 ║
 * ║  vehicule:statut         → statut d'un véhicule             ║
 * ║  vehicule:position       → position GPS mise à jour         ║
 * ║  dispatch:completed      → dispatch automatique effectué    ║
 * ║  pmt:extraite            → PMT extraite par IA              ║
 * ║  patient:created         → nouveau patient enregistré       ║
 * ║  stats:update            → mise à jour des KPIs             ║
 * ║  system:heartbeat        → ping serveur toutes les 30s      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const logger = require("../utils/logger");

let _io = null;

/** Retourne l'instance Socket.IO (utilisée par transportNotificationService) */
function getIO() { return _io; }

// ─── Salles Socket.IO par rôle ────────────────────────────────────────────────
const ROOMS = {
  ADMINS: "role:admin",
  SUPERVISORS: "role:superviseur",
  DISPATCHERS: "role:dispatcher",
  ALL: "broadcast",
};

// Sprint M2 — Helper interne : émet vers les 3 rooms staff au lieu de io.emit
// global. Sécurité (fuite d'info inter-rôle) + perf (pas d'envoi aux patients).
function _emitToStaff(event, payload) {
  if (!_io) return;
  _io.to(ROOMS.DISPATCHERS).to(ROOMS.ADMINS).to(ROOMS.SUPERVISORS).emit(event, payload);
}

// ── Initialisation ────────────────────────────────────────────────────────────
function init(io) {
  _io = io;

  io.on("connection", (socket) => {
    logger.info(`[Socket] Connecté : ${socket.id}`);

    // Rejoindre la salle correspondant au rôle utilisateur
    socket.on("join:role", ({ role, userId }) => {
      socket.join(`role:${role}`);
      socket.join(ROOMS.ALL);
      socket.data.role = role;
      socket.data.userId = userId;
      logger.info(`[Socket] ${socket.id} → role:${role}`);

      socket.emit("connected:ack", {
        socketId: socket.id,
        role,
        timestamp: new Date(),
        message: "Connexion temps réel établie — BlancBleu Transport",
      });
    });

    // Le client demande les statistiques actuelles
    socket.on("request:stats", async () => {
      try {
        const stats = await _getStatsRapides();
        socket.emit("stats:update", stats);
      } catch {
        // Silencieux — les stats ne sont pas critiques
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info(`[Socket] Déconnecté : ${socket.id} (${reason})`);
    });
  });

  // Heartbeat toutes les 30 secondes — broadcast intentionnel (présence
  // serveur, consommé par TOUS les clients pour l'indicateur "TEMPS RÉEL
  // ACTIF" de leur UI). Exception unique au principe "no global io.emit".
  setInterval(() => {
    if (_io) {
      _io.emit("system:heartbeat", { timestamp: new Date(), status: "ok" });
    }
  }, 30000);
}

// ═════════════════════════════════════════════════════════════════════════════
// ÉVÉNEMENTS TRANSPORT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * transport:created
 * Émis quand un nouveau transport est créé — visible des staff uniquement.
 */
function emitTransportCreated(transport) {
  if (!_io) return;
  _emitToStaff("transport:created", {
    _id: transport._id,
    numero: transport.numero,
    statut: transport.statut,
    patient: {
      nom: transport.patient?.nom,
      prenom: transport.patient?.prenom,
      mobilite: transport.patient?.mobilite,
    },
    motif: transport.motif,
    typeTransport: transport.typeTransport,
    dateTransport: transport.dateTransport,
    adresseDepart: transport.adresseDepart,
    adresseDestination: transport.adresseDestination,
    createdAt: transport.createdAt || new Date(),
    timestamp: new Date(),
  });
  logger.info(`[Socket] transport:created → ${transport.numero}`);
}

/**
 * transport:statut
 * Émis à chaque changement de statut (state machine). Scopé : staff + room
 * transport:{id} (patients/dispatchers qui suivent ce transport spécifique).
 */
function emitTransportStatut({ transport, ancienStatut, nouveauStatut, utilisateur }) {
  if (!_io) return;
  const payload = {
    transportId: transport._id,
    numero: transport.numero,
    ancienStatut,
    nouveauStatut,
    utilisateur: utilisateur || "système",
    progression: _calculerProgression(nouveauStatut),
    timestamp: new Date(),
  };
  _emitToStaff("transport:statut", payload);
  if (transport._id) {
    _io.to(`transport:${transport._id}`).emit("transport:statut", payload);
  }
  logger.info(
    `[Socket] transport:statut → ${transport.numero} : ${ancienStatut} → ${nouveauStatut}`
  );
}

/**
 * vehicule:assigne
 * Émis quand un véhicule + chauffeur sont affectés à un transport
 */
function emitVehiculeAssigne({ transport, vehicule, chauffeur, eta, score, source = "MANUEL" }) {
  if (!_io) return;
  const payload = {
    transportId: transport._id,
    numero: transport.numero,
    vehicule: {
      _id: vehicule._id,
      immatriculation: vehicule.immatriculation,
      type: vehicule.type,
    },
    chauffeur: chauffeur
      ? { _id: chauffeur._id, nom: chauffeur.nom, prenom: chauffeur.prenom }
      : null,
    eta,
    score,
    source, // 'AUTO' | 'MANUEL'
    timestamp: new Date(),
  };
  _emitToStaff("vehicule:assigne", payload);
  if (transport._id) {
    _io.to(`transport:${transport._id}`).emit("vehicule:assigne", payload);
  }
  logger.info(
    `[Socket] vehicule:assigne → ${vehicule.immatriculation} → ${transport.numero}`
  );
}

/**
 * vehicule:statut
 * Émis quand le statut d'un véhicule change
 */
function emitVehiculeStatut({ vehicule, ancienStatut, nouveauStatut }) {
  if (!_io) return;
  _emitToStaff("vehicule:statut", {
    vehiculeId: vehicule._id,
    immatriculation: vehicule.immatriculation,
    type: vehicule.type,
    ancienStatut,
    nouveauStatut,
    timestamp: new Date(),
  });
  logger.info(
    `[Socket] vehicule:statut → ${vehicule.immatriculation} : ${ancienStatut} → ${nouveauStatut}`
  );
}

/**
 * transport:statut_change
 * Alias enrichi de transport:statut — utilisé par la timeline React
 */
function emitTransportStatutChange({ transportId, numero, ancienStatut, nouveauStatut, journal, utilisateur }) {
  if (!_io) return;
  const payload = {
    transportId,
    numero,
    ancienStatut,
    nouveauStatut,
    journal: journal || [],
    utilisateur: utilisateur || "système",
    timestamp: new Date(),
  };
  _emitToStaff("transport:statut_change", payload);
  if (transportId) {
    _io.to(`transport:${transportId}`).emit("transport:statut_change", payload);
  }
}

/**
 * vehicule:position
 * Émis lors d'une mise à jour GPS d'un véhicule en mission
 */
function emitVehiculePosition(data) {
  if (!_io) return;
  _emitToStaff("vehicule:position", { ...data, timestamp: new Date() });
}

/**
 * dispatch:completed
 * Émis quand l'auto-dispatch a sélectionné un véhicule
 */
function emitDispatchCompleted({ transport, vehicule, score, eta, alternatives }) {
  if (!_io) return;
  _emitToStaff("dispatch:completed", {
    transportId: transport._id,
    numero: transport.numero,
    vehicule: {
      _id: vehicule._id,
      immatriculation: vehicule.immatriculation,
      type: vehicule.type,
    },
    score,
    eta,
    alternatives: alternatives || [],
    timestamp: new Date(),
  });
  logger.info(
    `[Socket] dispatch:completed → ${vehicule.immatriculation} (score ${score}/100)`
  );
}

/**
 * pmt:extraite
 * Émis quand l'IA a extrait les données d'une Prescription Médicale de Transport
 */
function emitPmtExtraite({ transportId, extraction, confiance }) {
  if (!_io) return;
  const payload = {
    transportId,
    extraction,
    confiance,
    validationRequise: confiance < 0.75,
    timestamp: new Date(),
  };
  _emitToStaff("pmt:extraite", payload);
  if (transportId) {
    _io.to(`transport:${transportId}`).emit("pmt:extraite", payload);
  }
  logger.info(`[Socket] pmt:extraite → transport ${transportId} (confiance ${confiance})`);
}

/**
 * prescription:created
 * Émis quand un patient envoie une prescription depuis l'app mobile
 */
function emitPrescriptionCreated(prescription) {
  if (!_io) return;
  _io.to(ROOMS.DISPATCHERS).to(ROOMS.SUPERVISORS).to(ROOMS.ADMINS).emit('prescription:created', {
    _id:          prescription._id,
    numero:       prescription.numero,
    motif:        prescription.motif,
    statut:       prescription.statut,
    source:       prescription.source,
    medecin:      prescription.medecin,
    dateEmission: prescription.dateEmission,
    fichierUrl:   prescription.fichierUrl,
    fichierNom:   prescription.fichierNom,
    timestamp:    new Date(),
  });
  logger.info(`[Socket] prescription:created → ${prescription.numero}`);
}

/**
 * facture:updated
 * Émis quand une facture est marquée payée (paiement en ligne Stripe)
 */
function emitFactureUpdated(facture) {
  if (!_io) return;
  _io.to(ROOMS.DISPATCHERS).to(ROOMS.SUPERVISORS).to(ROOMS.ADMINS).emit('facture:updated', {
    _id:            facture._id,
    numero:         facture.numero,
    statut:         facture.statut,
    datePaiement:   facture.datePaiement,
    modePaiement:   facture.modePaiement,
    referenceExterne: facture.referenceExterne,
    montantTotal:   facture.montantTotal,
    timestamp:      new Date(),
  });
  logger.info(`[Socket] facture:updated → ${facture.numero} (payee)`);
}

/**
 * patient:created
 * Émis quand un nouveau patient crée un compte via l'app mobile
 */
function emitPatientCreated(patient) {
  if (!_io) return;
  _io.to(ROOMS.DISPATCHERS).to(ROOMS.SUPERVISORS).to(ROOMS.ADMINS).emit('patient:created', {
    _id:           patient._id,
    numeroPatient: patient.numeroPatient,
    nom:           patient.nom,
    prenom:        patient.prenom,
    email:         patient.email,
    telephone:     patient.telephone,
    mobilite:      patient.mobilite,
    actif:         patient.actif,
    createdAt:     patient.createdAt || new Date(),
    timestamp:     new Date(),
  });
  logger.info(`[Socket] patient:created → ${patient.numeroPatient} (${patient.nom} ${patient.prenom})`);
}

/**
 * stats:update
 * Émis après chaque événement important pour actualiser les KPIs dashboard
 */
async function emitStatsUpdate() {
  if (!_io) return;
  try {
    const stats = await _getStatsRapides();
    _emitToStaff("stats:update", stats);
  } catch {
    // Silencieux
  }
}

// ─── Helpers privés ───────────────────────────────────────────────────────────

/**
 * Calcule le pourcentage de progression selon le statut du transport
 */
function _calculerProgression(statut) {
  const ordre = [
    "REQUESTED",
    "CONFIRMED",
    "SCHEDULED",
    "ASSIGNED",
    "EN_ROUTE_TO_PICKUP",
    "ARRIVED_AT_PICKUP",
    "PATIENT_ON_BOARD",
    "ARRIVED_AT_DESTINATION",
    "COMPLETED",
  ];
  const idx = ordre.indexOf(statut);
  return idx === -1 ? null : Math.round((idx / (ordre.length - 1)) * 100);
}

/**
 * Récupère les statistiques rapides pour le dashboard
 */
async function _getStatsRapides() {
  try {
    const Transport = require("../models/Transport");
    const Vehicle = require("../models/Vehicle");

    const [total, enCours, termines, annules, vehiculesDisponibles] =
      await Promise.all([
        Transport.countDocuments(),
        Transport.countDocuments({
          statut: {
            $nin: ["COMPLETED", "CANCELLED", "NO_SHOW"],
          },
        }),
        Transport.countDocuments({ statut: "COMPLETED" }),
        Transport.countDocuments({ statut: { $in: ["CANCELLED", "NO_SHOW"] } }),
        Vehicle.countDocuments({ statut: "Disponible" }),
      ]);

    // Répartition par motif
    const parMotif = await Transport.aggregate([
      { $match: { statut: { $nin: ["CANCELLED", "NO_SHOW"] } } },
      { $group: { _id: "$motif", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    return {
      total,
      enCours,
      termines,
      annules,
      vehiculesDisponibles,
      parMotif,
      timestamp: new Date(),
    };
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS NOTIFICATIONS — émission ciblée
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Émet un événement à un utilisateur spécifique via sa room personnelle.
 * Retourne true si l'io est disponible (émission tentée).
 */
function emitToUser(userId, event, payload) {
  if (!_io || !userId) return false;
  _io.to(`user:${userId}`).emit(event, { ...payload, timestamp: new Date() });
  return true;
}

/**
 * Émet un événement à tous les sockets d'un rôle donné.
 */
function emitToRole(role, event, payload) {
  if (!_io || !role) return false;
  _io.to(`role:${role}`).emit(event, { ...payload, timestamp: new Date() });
  return true;
}

/**
 * Émet un événement dans la room d'un transport (suivi temps réel).
 */
function emitToTransportRoom(transportId, event, payload) {
  if (!_io || !transportId) return false;
  _io.to(`transport:${transportId}`).emit(event, { ...payload, timestamp: new Date() });
  return true;
}

module.exports = {
  init,
  getIO,
  ROOMS,
  emitTransportCreated,
  emitTransportStatut,
  emitTransportStatutChange,
  emitVehiculeAssigne,
  emitVehiculeStatut,
  emitVehiculePosition,
  emitDispatchCompleted,
  emitPmtExtraite,
  emitPrescriptionCreated,
  emitPatientCreated,
  emitFactureUpdated,
  emitStatsUpdate,
  // Helpers ciblés
  emitToUser,
  emitToRole,
  emitToTransportRoom,
};
