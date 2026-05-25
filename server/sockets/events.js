/**
 * BlancBleu — Source de vérité UNIQUE des noms d'events Socket.IO.
 *
 * Convention : <domaine>:<action> en anglais, scopé par room (jamais io.emit
 * global). Importer EXCLUSIVEMENT depuis ce fichier côté serveur ; les clients
 * (web React, Flutter driver, Flutter patient) maintiennent leurs propres
 * miroirs synchronisés avec ce fichier.
 *
 * Pourquoi : avant le Sprint M2, on avait 3 conventions concurrentes pour les
 * mêmes concepts (transport:statut + transport:statut_change +
 * transport:status_updated pour le statut ; vehicule:position + vehicle:position +
 * driver:location_updated pour la position). Sources :
 *   - server/services/socketService.js
 *   - server/sockets/driverSocket.js
 *   - server/controllers/driverController.js
 *
 * IMPORTANT : certains noms d'events apparaissent dans les DEUX sens (client→
 * serveur ET serveur→client), avec un sens opposé selon l'émetteur. Ex.
 * `message:driver` :
 *   - quand un chauffeur EMET → c'est un message DEPUIS le chauffeur (entrant
 *     côté serveur)
 *   - quand le serveur EMET → c'est un message À DESTINATION d'un dispatcher
 *     (sortant côté serveur)
 * On préfixe les entrants `IN_*` ici pour lever toute ambiguïté de lecture
 * côté serveur, mais le NOM TRANSPORTÉ sur le wire reste identique.
 */

module.exports = Object.freeze({
  // ── Serveur → clients dans une room transport:{id} ─────────────────────────
  // Tout client (patient app, dispatcher web) qui suit un transport reçoit ces
  // events après un emit io.to(`transport:${id}`).emit(...).
  TRANSPORT_STATUS:    "transport:status",     // ← remplace transport:statut, transport:statut_change, transport:status_updated
  TRANSPORT_GPS:       "transport:gps",         // ← remplace tracking:gps_updated (patient)
  TRANSPORT_ASSIGNED:  "transport:assigned",
  TRANSPORT_CANCELLED: "transport:cancelled",
  TRANSPORT_CREATED:   "transport:created",
  TRANSPORT_UPDATED:   "transport:updated",
  TRANSPORT_SIGNATURE: "transport:signature_added",

  // ── Serveur → staff (rooms role:dispatcher / role:admin / role:superviseur) ─
  VEHICLE_POSITION:    "vehicle:position",      // ← remplace vehicule:position + vehicle:position + driver:location_updated
  VEHICLE_SNAPSHOT:    "vehicle:positions_snapshot",
  VEHICLE_STATUS:      "vehicle:status_changed",
  DRIVER_ONLINE:       "driver:online",
  DRIVER_OFFLINE:      "driver:offline",
  DRIVER_STATUS:       "driver:status_changed",
  DISPATCHER_STATUS:   "dispatcher:status",
  STATS_UPDATE:        "stats:update",
  PMT_EXTRACTED:       "pmt:extraite",          // FR conservé (déjà couplé au code IA)

  // ── Auto-dispatch (Sprint 6 — vers role:dispatcher / role:admin) ───────────
  AUTODISPATCH_PROPOSAL:  "autoDispatch:proposal_created",
  AUTODISPATCH_ASSIGNED:  "autoDispatch:auto_assigned",
  AUTODISPATCH_DECIDED:   "autoDispatch:proposal_decided",

  // ── Messagerie (serveur → app) ─────────────────────────────────────────────
  MESSAGE_TO_DRIVER:     "message:dispatcher", // serveur EMET ce nom au chauffeur
  MESSAGE_TO_DISPATCHER: "message:driver",     // serveur EMET ce nom au dispatcher
  MESSAGE_DELIVERED:     "message:delivered",
  SHIFT_FORCED_END:      "shift:forced_end",
  NOTIFICATION_UNREAD:   "notification:unread_count",

  // ── Système ────────────────────────────────────────────────────────────────
  SYSTEM_HEARTBEAT:    "system:heartbeat",
  CONNECTED_ACK:       "connected:ack",

  // ── Client → serveur (entrants — préfixe IN_ pour lever l'ambiguïté) ──────
  IN_DRIVER_LOCATION:    "driver:location",
  IN_DRIVER_STATUS:      "driver:status",
  IN_MESSAGE_DRIVER:     "message:driver",      // chauffeur ENVOIE depuis app
  IN_MESSAGE_DISPATCHER: "message:dispatcher",  // dispatcher ENVOIE depuis web
  IN_JOIN_TRANSPORT:     "join:transport",
  IN_LEAVE_TRANSPORT:    "leave:transport",
  IN_JOIN_ROLE:          "join:role",
  IN_SHIFT_FORCE_END:    "shift:force_end",
  IN_PATIENT_FCM_TOKEN:  "patient:fcm_token",
  IN_REQUEST_STATS:      "request:stats",
});
