/// Sprint M2 — Miroir Dart des noms d'events Socket.IO.
///
/// SYNCHRONISÉ À LA MAIN avec `server/sockets/events.js` (source de vérité)
/// et les autres miroirs (`client/src/lib/socketEvents.js`,
/// `blancbleu_driver/lib/core/network/socket_events.dart`).
///
/// Voir `docs/socket-events.md`.
library;

class SocketEvents {
  SocketEvents._();

  // ── Serveur → patient app (room transport:{id}) ────────────────────────
  static const String transportStatus    = "transport:status";
  static const String transportGps       = "transport:gps";
  static const String transportAssigned  = "transport:assigned";
  static const String transportCancelled = "transport:cancelled";

  // ── Système ────────────────────────────────────────────────────────────
  static const String systemHeartbeat    = "system:heartbeat";
  static const String connectedAck       = "connected:ack";

  // ── Patient app → serveur ──────────────────────────────────────────────
  static const String inJoinTransport    = "join:transport";
  static const String inLeaveTransport   = "leave:transport";
  static const String inPatientFcmToken  = "patient:fcm_token";
}
