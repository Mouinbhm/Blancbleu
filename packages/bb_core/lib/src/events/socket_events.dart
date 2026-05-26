/// Miroir Dart des noms d'events Socket.IO.
///
/// SYNCHRONISÉ À LA MAIN avec `server/sockets/events.js` (source de vérité).
/// Si tu touches ici, touche aussi le fichier serveur.
///
/// Voir `docs/socket-events.md` pour le tableau complet {event, room, payload}.
///
/// Sprint M3 : consolidation des miroirs auparavant dupliqués dans chaque app
/// (`blancbleu_driver/lib/core/network/socket_events.dart` et idem patient).
/// Les apps ré-exportent désormais depuis ce package.
library;

class SocketEvents {
  SocketEvents._();

  // ── Serveur → clients (room transport:{id}) ─────────────────────────────
  static const String transportStatus    = "transport:status";
  static const String transportGps       = "transport:gps";
  static const String transportAssigned  = "transport:assigned";
  static const String transportCancelled = "transport:cancelled";
  static const String transportCreated   = "transport:created";
  static const String transportUpdated   = "transport:updated";
  static const String transportSignature = "transport:signature_added";

  // ── Serveur → staff (rooms role:dispatcher / role:admin / role:superviseur)
  static const String vehiclePosition    = "vehicle:position";
  static const String vehicleSnapshot    = "vehicle:positions_snapshot";
  static const String vehicleStatus      = "vehicle:status_changed";
  static const String driverOnline       = "driver:online";
  static const String driverOffline      = "driver:offline";
  static const String driverStatus       = "driver:status_changed";
  static const String dispatcherStatus   = "dispatcher:status";
  static const String statsUpdate        = "stats:update";
  static const String pmtExtracted       = "pmt:extraite";

  // ── Auto-dispatch (Sprint 6) ────────────────────────────────────────────
  static const String autoDispatchProposal = "autoDispatch:proposal_created";
  static const String autoDispatchAssigned = "autoDispatch:auto_assigned";
  static const String autoDispatchDecided  = "autoDispatch:proposal_decided";

  // ── Messagerie ──────────────────────────────────────────────────────────
  static const String messageDispatcher  = "message:dispatcher"; // serveur → chauffeur
  static const String messageDriver      = "message:driver";     // serveur → dispatcher
  static const String messageDelivered   = "message:delivered";
  static const String shiftForcedEnd     = "shift:forced_end";
  static const String notificationUnread = "notification:unread_count";

  // ── Système ────────────────────────────────────────────────────────────
  static const String systemHeartbeat    = "system:heartbeat";
  static const String connectedAck       = "connected:ack";

  // ── Client → serveur (entrants) ────────────────────────────────────────
  // NB : `message:driver` et `message:dispatcher` apparaissent dans les deux
  // sens — le nom sur le wire est identique. Côté serveur on les préfixe IN_
  // pour distinguer ; côté client on n'a pas d'ambiguïté car on est forcément
  // l'émetteur quand on appelle `socket.emit(...)`.
  static const String inDriverLocation   = "driver:location";
  static const String inDriverStatus     = "driver:status";
  static const String inMessageDriver    = "message:driver";
  static const String inMessageDispatcher = "message:dispatcher";
  static const String inJoinTransport    = "join:transport";
  static const String inLeaveTransport   = "leave:transport";
  static const String inJoinRole         = "join:role";
  static const String inShiftForceEnd    = "shift:force_end";
  static const String inPatientFcmToken  = "patient:fcm_token";
  static const String inRequestStats     = "request:stats";
}
