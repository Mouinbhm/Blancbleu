/**
 * BlancBleu — Miroir client des noms d'events Socket.IO.
 *
 * SYNCHRONISÉ À LA MAIN avec server/sockets/events.js (source de vérité).
 * Si tu touches ici, touche aussi le fichier serveur (et inversement).
 *
 * Voir docs/socket-events.md pour le tableau complet {event, room, payload}.
 */

const SOCKET_EVENTS = Object.freeze({
  // ── Serveur → clients (room transport:{id}) ─────────────────────────────────
  TRANSPORT_STATUS:    "transport:status",
  TRANSPORT_GPS:       "transport:gps",
  TRANSPORT_ASSIGNED:  "transport:assigned",
  TRANSPORT_CANCELLED: "transport:cancelled",
  TRANSPORT_CREATED:   "transport:created",
  TRANSPORT_UPDATED:   "transport:updated",
  TRANSPORT_SIGNATURE: "transport:signature_added",

  // ── Serveur → staff (rooms role:dispatcher / role:admin / role:superviseur) ─
  VEHICLE_POSITION:    "vehicle:position",
  VEHICLE_SNAPSHOT:    "vehicle:positions_snapshot",
  VEHICLE_STATUS:      "vehicle:status_changed",
  DRIVER_ONLINE:       "driver:online",
  DRIVER_OFFLINE:      "driver:offline",
  DRIVER_STATUS:       "driver:status_changed",
  DISPATCHER_STATUS:   "dispatcher:status",
  STATS_UPDATE:        "stats:update",
  PMT_EXTRACTED:       "pmt:extraite",

  // ── Auto-dispatch ───────────────────────────────────────────────────────────
  AUTODISPATCH_PROPOSAL: "autoDispatch:proposal_created",
  AUTODISPATCH_ASSIGNED: "autoDispatch:auto_assigned",
  AUTODISPATCH_DECIDED:  "autoDispatch:proposal_decided",

  // ── Messagerie ──────────────────────────────────────────────────────────────
  MESSAGE_TO_DRIVER:     "message:dispatcher",
  MESSAGE_TO_DISPATCHER: "message:driver",
  MESSAGE_DELIVERED:     "message:delivered",
  SHIFT_FORCED_END:      "shift:forced_end",
  NOTIFICATION_UNREAD:   "notification:unread_count",

  // ── Système ─────────────────────────────────────────────────────────────────
  SYSTEM_HEARTBEAT:    "system:heartbeat",
  CONNECTED_ACK:       "connected:ack",

  // ── Client → serveur (entrants) ─────────────────────────────────────────────
  IN_DRIVER_LOCATION:    "driver:location",
  IN_DRIVER_STATUS:      "driver:status",
  IN_MESSAGE_DRIVER:     "message:driver",
  IN_MESSAGE_DISPATCHER: "message:dispatcher",
  IN_JOIN_TRANSPORT:     "join:transport",
  IN_LEAVE_TRANSPORT:    "leave:transport",
  IN_JOIN_ROLE:          "join:role",
  IN_SHIFT_FORCE_END:    "shift:force_end",
});

export default SOCKET_EVENTS;
export { SOCKET_EVENTS };
