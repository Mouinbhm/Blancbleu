/// Sprint M2 — Miroir Dart des noms d'events Socket.IO.
///
/// SYNCHRONISÉ À LA MAIN avec `server/sockets/events.js` (source de vérité)
/// et `client/src/lib/socketEvents.js`. Si tu touches ici, touche aussi les
/// autres miroirs.
///
/// Voir `docs/socket-events.md` pour le tableau complet.
class SocketEvents {
  SocketEvents._();

  // ── Serveur → driver app (foreground SocketManager) ─────────────────────
  static const String transportAssigned  = "transport:assigned";
  static const String transportCancelled = "transport:cancelled";
  static const String transportStatus    = "transport:status";
  static const String transportUpdated   = "transport:updated";

  // ── Messagerie / dispatcher ────────────────────────────────────────────
  static const String messageDispatcher  = "message:dispatcher"; // serveur EMET vers chauffeur
  static const String dispatcherStatus   = "dispatcher:status";
  static const String shiftForcedEnd     = "shift:forced_end";
  static const String messageDelivered   = "message:delivered";

  // ── Système ────────────────────────────────────────────────────────────
  static const String systemHeartbeat    = "system:heartbeat";
  static const String connectedAck       = "connected:ack";

  // ── Driver app → serveur (entrants) ────────────────────────────────────
  static const String inDriverLocation   = "driver:location"; // émis par bg isolate
  static const String inDriverStatus     = "driver:status";
  static const String inMessageDriver    = "message:driver";  // chauffeur ENVOIE
}
