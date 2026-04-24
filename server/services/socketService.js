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
 * ║  stats:update            → mise à jour des KPIs             ║
 * ║  system:heartbeat        → ping serveur toutes les 30s      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

let _io = null;

// ─── Salles Socket.IO par rôle ────────────────────────────────────────────────
const ROOMS = {
  ADMINS: "role:admin",
  SUPERVISORS: "role:superviseur",
  DISPATCHERS: "role:dispatcher",
  ALL: "broadcast",
};

// ── Initialisation ────────────────────────────────────────────────────────────
function init(io) {
  _io = io;

  io.on("connection", (socket) => {
    console.log(`[Socket] Connecté : ${socket.id}`);

    // Rejoindre la salle correspondant au rôle utilisateur
    socket.on("join:role", ({ role, userId }) => {
      socket.join(`role:${role}`);
      socket.join(ROOMS.ALL);
      socket.data.role = role;
      socket.data.userId = userId;
      console.log(`[Socket] ${socket.id} → role:${role}`);

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
      console.log(`[Socket] Déconnecté : ${socket.id} (${reason})`);
    });
  });

  // Heartbeat toutes les 30 secondes
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
 * Émis quand un nouveau transport est créé
 */
function emitTransportCreated(transport) {
  if (!_io) return;
  _io.emit("transport:created", {
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
  console.log(`[Socket] transport:created → ${transport.numero}`);
}

/**
 * transport:statut
 * Émis à chaque changement de statut (state machine)
 */
function emitTransportStatut({ transport, ancienStatut, nouveauStatut, utilisateur }) {
  if (!_io) return;
  _io.emit("transport:statut", {
    transportId: transport._id,
    numero: transport.numero,
    ancienStatut,
    nouveauStatut,
    utilisateur: utilisateur || "système",
    progression: _calculerProgression(nouveauStatut),
    timestamp: new Date(),
  });
  console.log(
    `[Socket] transport:statut → ${transport.numero} : ${ancienStatut} → ${nouveauStatut}`
  );
}

/**
 * vehicule:assigne
 * Émis quand un véhicule + chauffeur sont affectés à un transport
 */
function emitVehiculeAssigne({ transport, vehicule, chauffeur, eta, score, source = "MANUEL" }) {
  if (!_io) return;
  _io.emit("vehicule:assigne", {
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
  });
  console.log(
    `[Socket] vehicule:assigne → ${vehicule.immatriculation} → ${transport.numero}`
  );
}

/**
 * vehicule:statut
 * Émis quand le statut d'un véhicule change
 */
function emitVehiculeStatut({ vehicule, ancienStatut, nouveauStatut }) {
  if (!_io) return;
  _io.emit("vehicule:statut", {
    vehiculeId: vehicule._id,
    immatriculation: vehicule.immatriculation,
    type: vehicule.type,
    ancienStatut,
    nouveauStatut,
    timestamp: new Date(),
  });
  console.log(
    `[Socket] vehicule:statut → ${vehicule.immatriculation} : ${ancienStatut} → ${nouveauStatut}`
  );
}

/**
 * transport:statut_change
 * Alias enrichi de transport:statut — utilisé par la timeline React
 */
function emitTransportStatutChange({ transportId, numero, ancienStatut, nouveauStatut, journal, utilisateur }) {
  if (!_io) return;
  _io.emit("transport:statut_change", {
    transportId,
    numero,
    ancienStatut,
    nouveauStatut,
    journal: journal || [],
    utilisateur: utilisateur || "système",
    timestamp: new Date(),
  });
}

/**
 * vehicule:position
 * Émis lors d'une mise à jour GPS d'un véhicule en mission
 */
function emitVehiculePosition(data) {
  if (!_io) return;
  _io.emit("vehicule:position", { ...data, timestamp: new Date() });
}

/**
 * dispatch:completed
 * Émis quand l'auto-dispatch a sélectionné un véhicule
 */
function emitDispatchCompleted({ transport, vehicule, score, eta, alternatives }) {
  if (!_io) return;
  _io.emit("dispatch:completed", {
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
  console.log(
    `[Socket] dispatch:completed → ${vehicule.immatriculation} (score ${score}/100)`
  );
}

/**
 * pmt:extraite
 * Émis quand l'IA a extrait les données d'une Prescription Médicale de Transport
 */
function emitPmtExtraite({ transportId, extraction, confiance }) {
  if (!_io) return;
  _io.emit("pmt:extraite", {
    transportId,
    extraction,
    confiance,
    validationRequise: confiance < 0.75,
    timestamp: new Date(),
  });
  console.log(`[Socket] pmt:extraite → transport ${transportId} (confiance ${confiance})`);
}

/**
 * stats:update
 * Émis après chaque événement important pour actualiser les KPIs dashboard
 */
async function emitStatsUpdate() {
  if (!_io) return;
  try {
    const stats = await _getStatsRapides();
    _io.emit("stats:update", stats);
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
        Vehicle.countDocuments({ statut: "disponible" }),
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

module.exports = {
  init,
  ROOMS,
  emitTransportCreated,
  emitTransportStatut,
  emitTransportStatutChange,
  emitVehiculeAssigne,
  emitVehiculeStatut,
  emitVehiculePosition,
  emitDispatchCompleted,
  emitPmtExtraite,
  emitStatsUpdate,
};
