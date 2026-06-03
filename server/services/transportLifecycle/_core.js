/**
 * BlancBleu — Lifecycle Transport : noyau partagé (privé)
 *
 * Regroupe la transition centrale `_transition`, le helper `_meta`, la
 * simulation GPS optionnelle, la liste des statuts assignables et TOUS les
 * requires partagés entre les sous-modules (transitions / assignment /
 * completion / documents).
 *
 * Les sous-modules importent ce noyau ; jamais l'inverse (pas de cycle).
 * Le require de transportNotificationService vit ICI uniquement.
 */

const Transport = require("../../models/Transport");
const Vehicle = require("../../models/Vehicle");
const Personnel = require("../../models/Personnel");
const Facture = require("../../models/Facture");
const { TransportStateMachine } = require("../transportStateMachine");
const { smartDispatch } = require("../smartDispatch");
const socketService = require("../socketService");
const { audit, log } = require("../auditService");
const { haversine } = require("../../utils/geoUtils");
const tarifService = require("../tarifService");
const transportNotif = require("../transportNotificationService");
const { withTransactionOrFallback } = require("../../utils/withTransaction");
const { ConflictError } = require("../../utils/errors");
const { delPattern } = require("../../utils/redis");
const featureCollector = require("../featureCollectorService");
const logger = (() => {
  try {
    return require("../../utils/logger");
  } catch {
    return console;
  }
})();

// Statuts depuis lesquels un transport peut recevoir un véhicule. Cohérent
// avec TRANSITIONS du state machine : SCHEDULED → ASSIGNED et
// DRIVER_REJECTED → ASSIGNED (réassignation après refus chauffeur).
const ASSIGNABLE_TRANSPORT_STATES = ["SCHEDULED", "DRIVER_REJECTED"];

// ── SIMULATION GPS AUTO DÉSACTIVÉE ───────────────────────────────────────────
// Mettre SIMULATION_GPS_ACTIVE = true pour réactiver (démos PFE).
// Quand actif : 5s après l'assignation d'un véhicule, la simulation GPS
// démarre et fait évoluer le transport automatiquement jusqu'à COMPLETED.
const SIMULATION_GPS_ACTIVE = false;

function scheduleGpsSimulation(transportId) {
  if (!SIMULATION_GPS_ACTIVE) return; // désactivé — contrôle manuel uniquement
  if (process.env.NODE_ENV === "test") return;
  setTimeout(() => {
    require("../simulationGPS")
      .demarrerSimulation(transportId)
      .catch((err) => logger.warn("Simulation GPS non démarrée", { err: err.message }));
  }, 5000);
}

// ── Helper : effectuer une transition et sauvegarder ──────────────────────────
// session : passer une ClientSession Mongoose pour exécuter les writes dans une
// transaction ; null/undefined pour un comportement non-transactionnel (legacy).
async function _transition(transportId, nouveauStatut, metadata = {}, session = null) {
  const transport = await Transport.findById(transportId)
    .session(session)
    .populate("vehicule", "nom type statut position kilometrage carburant")
    .populate("chauffeur", "nom prenom email");

  if (!transport) throw new Error("Transport introuvable");
  if (TransportStateMachine.estTerminal(transport.statut)) {
    throw new Error(`Transport déjà terminé (statut: ${transport.statut})`);
  }

  const ancienStatut = transport.statut;

  const { update, entreeJournal } = TransportStateMachine.effectuerTransition(
    transport,
    nouveauStatut,
    metadata,
  );

  Object.assign(transport, update);
  transport.journal.push(entreeJournal);

  // ── PART A : Historique riche des statuts ─────────────────────────────────
  transport.statusLog.push({
    from: ancienStatut,
    to: nouveauStatut,
    changedBy: metadata.userId || null,
    changedByRole: metadata.userRole || "système",
    changedAt: new Date(),
    reason: metadata.reason || metadata.notes || "",
    metadata: metadata.extra || {},
  });

  await transport.save({ session: session || undefined });

  // ── Garde-fou : libération automatique du véhicule ────────────────────────
  // Garantit que le véhicule est libéré dès que la transition est persistée,
  // même si la fonction appelante (completerTransport, annulerTransport…) échoue
  // après ce point. Idempotent : re-libérer un véhicule déjà disponible est sans effet.
  // Dans une transaction, le write est inclus dans la même session.
  if (["COMPLETED", "CANCELLED", "NO_SHOW", "PAID", "FAILED"].includes(nouveauStatut)) {
    const vehiculeId = transport.vehicule?._id ?? transport.vehicule;
    if (vehiculeId) {
      try {
        await Vehicle.findByIdAndUpdate(
          vehiculeId,
          { statut: "Disponible", transportEnCours: null },
          { session: session || undefined },
        );
        logger.info("Véhicule libéré (garde-fou lifecycle)", {
          vehiculeId,
          transport: transport.numero,
          nouveauStatut,
        });
      } catch (errLiberation) {
        // Dans une transaction, on doit propager pour rollback. Hors transaction,
        // on reste best-effort comme avant.
        if (session) throw errLiberation;
        logger.warn("Garde-fou : échec libération véhicule", {
          vehiculeId,
          transport: transport.numero,
          err: errLiberation.message,
        });
      }
    }
  }

  // Émettre événements Socket.IO
  socketService.emitTransportStatut?.({
    transport,
    ancienStatut: entreeJournal.de,
    nouveauStatut,
    utilisateur: metadata.utilisateur || "système",
  });
  socketService.emitTransportStatutChange?.({
    transportId: transport._id,
    numero: transport.numero,
    ancienStatut: entreeJournal.de,
    nouveauStatut,
    journal: transport.journal,
    statusLog: transport.statusLog,
    utilisateur: metadata.utilisateur || "système",
  });
  socketService.emitStatsUpdate?.();
  // Sprint M2 — event canonique TRANSPORT_STATUS pour les clients qui suivent
  // ce transport (patient app, web Suivi en direct, driver foreground).
  const EVENTS = require("../../sockets/events");
  socketService.emitToTransportRoom?.(transport._id, EVENTS.TRANSPORT_STATUS, {
    transportId: transport._id,
    numero: transport.numero,
    oldStatus: entreeJournal.de,
    newStatus: nouveauStatut,
    ancienStatut: entreeJournal.de, // alias FR rétrocompat
    nouveauStatut,
    progression: require("../transportStateMachine").TransportStateMachine.progression(
      nouveauStatut,
    ),
  });

  // ── PART E : Notification persistée + push Socket ─────────────────────────
  setImmediate(() => {
    transportNotif
      .notifyStatusChanged(
        transport,
        ancienStatut,
        nouveauStatut,
        { _id: metadata.userId, role: metadata.userRole, email: metadata.utilisateur },
        metadata.reason || metadata.notes,
      )
      .catch((err) =>
        logger.warn("[lifecycle] Notification transport échouée", { err: err.message }),
      );
  });

  // ── Sprint M4 — Push FCM pour les changements de statut clés (patient) ───
  // On évite le spam : seuls les statuts qui changent l'expérience patient
  // déclenchent une push. Le socket suffit pour les autres.
  const PATIENT_PUSH_STATUSES = new Set([
    "ASSIGNED",
    "EN_ROUTE_TO_PICKUP",
    "ARRIVED_AT_PICKUP",
    "CANCELLED",
  ]);
  if (PATIENT_PUSH_STATUSES.has(nouveauStatut) && transport.patient?.email) {
    setImmediate(() => {
      const { pushToPatientEmail } = require("../pushDispatcher");
      const titles = {
        ASSIGNED: "Véhicule attribué",
        EN_ROUTE_TO_PICKUP: "Votre ambulance arrive",
        ARRIVED_AT_PICKUP: "Votre ambulance est sur place",
        CANCELLED: "Transport annulé",
      };
      // RGPD : pas de données médicales dans le body (cf. M4 étape 7).
      pushToPatientEmail(transport.patient.email, {
        type: "transport_status",
        title: titles[nouveauStatut] || "Mise à jour transport",
        body: transport.numero ? `Transport ${transport.numero}` : "Nouvelle mise à jour",
        channelId: "blancbleu_transport",
        data: {
          transportId: String(transport._id),
          newStatus: nouveauStatut,
        },
      }).catch((err) => logger.warn("[lifecycle] push patient échoué", { err: err.message }));
    });
  }

  return transport;
}

// ── Utility : enrichir les metadata avec userId/userRole ──────────────────────
function _meta(utilisateur, overrides = {}) {
  return {
    utilisateur: utilisateur?.email || "système",
    userId: utilisateur?._id || null,
    userRole: utilisateur?.role || "système",
    ...overrides,
  };
}

module.exports = {
  // Modèles
  Transport,
  Vehicle,
  Personnel,
  Facture,
  // Services & utils partagés
  TransportStateMachine,
  smartDispatch,
  socketService,
  audit,
  log,
  haversine,
  tarifService,
  transportNotif,
  withTransactionOrFallback,
  ConflictError,
  delPattern,
  featureCollector,
  logger,
  // Constantes & helpers lifecycle
  ASSIGNABLE_TRANSPORT_STATES,
  scheduleGpsSimulation,
  _transition,
  _meta,
};
