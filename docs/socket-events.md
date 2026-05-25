# Socket.IO Events — BlancBleu

Source de vérité côté serveur : [`server/sockets/events.js`](../server/sockets/events.js).

Miroirs clients (synchronisés à la main avec le fichier serveur) :
- Web React : `client/src/lib/socketEvents.js`
- Driver Flutter : `blancbleu_driver/lib/core/network/socket_events.dart`
- Patient Flutter : `blancbleu_patient/lib/core/network/socket_events.dart`

**Toutes** les routes serveur DOIVENT importer les noms depuis `events.js` et
NE JAMAIS taper un event en littéral. Aucun `io.emit("xxx")` global n'est
autorisé — toujours scoper par room (`io.to("transport:{id}").emit(...)`).

---

## Conventions

- Format : `<domaine>:<action>` en anglais, snake_case.
- **Une seule** room par concept : `transport:{id}`, `role:dispatcher`, etc.
- Payload uniforme : clés anglaises canoniques (`oldStatus`, `newStatus`,
  `timestamp`). Alias FR (`ancienStatut`, `nouveauStatut`) tolérés en transition,
  à retirer en M3.
- Les events `message:driver` et `message:dispatcher` apparaissent dans les
  DEUX sens. Côté serveur on les nomme `IN_*` pour les entrants et
  `MESSAGE_TO_*` pour les sortants — le nom sur le wire reste identique.

---

## Events serveur → clients

### Room `transport:{id}` (patient + dispatcher suivant ce transport)

| Constante              | Event sur le wire           | Émis depuis                                              | Payload canonique |
|---|---|---|---|
| `TRANSPORT_STATUS`     | `transport:status`          | `transportLifecycle._transition`, `driverController.updateStatus` | `{ transportId, oldStatus, newStatus, progression, timestamp }` |
| `TRANSPORT_GPS`        | `transport:gps`             | `driverSocket.driver:location` (M1), `trackingController.batch` | `{ transportId, lat, lng, speed, timestamp }` |
| `TRANSPORT_ASSIGNED`   | `transport:assigned`        | `transportLifecycle.assignerVehicule`                     | `{ transportId, numero, vehiculeId, chauffeurId }` |
| `TRANSPORT_CANCELLED`  | `transport:cancelled`       | `transportLifecycle.annulerTransport`                     | `{ transportId, numero, reason }` |
| `TRANSPORT_SIGNATURE`  | `transport:signature_added` | `transportLifecycle.addSignature`                         | `{ transportId, numero, signedByName, signedAt }` |
| `TRANSPORT_UPDATED`    | `transport:updated`         | divers (modif PMT, modif metadata)                        | `{ transportId, numero, ...updates }` |

### Rooms staff (`role:dispatcher`, `role:admin`, `role:superviseur`)

| Constante              | Event sur le wire           | Émis depuis                                | Payload |
|---|---|---|---|
| `TRANSPORT_CREATED`    | `transport:created`         | `transportController.create`                | `{ transportId, numero, motif, ... }` |
| `VEHICLE_POSITION`     | `vehicle:position`          | `driverSocket.driver:location`              | `{ vehicleId, driverId, driverNom, lat, lng, speed, shiftId, timestamp }` |
| `VEHICLE_SNAPSHOT`     | `vehicle:positions_snapshot`| `sockets/index.js` (à la connexion d'un staff) | `{ positions: [...] }` (lu depuis Redis M2) |
| `VEHICLE_STATUS`       | `vehicle:status_changed`    | `vehicleController.updateStatus`            | `{ vehicleId, oldStatus, newStatus }` |
| `DRIVER_ONLINE`        | `driver:online`             | `driverSocket.connect`                      | `{ driverId, driverNom, timestamp }` |
| `DRIVER_OFFLINE`       | `driver:offline`            | `driverSocket.disconnect`                   | `{ driverId, timestamp }` |
| `DRIVER_STATUS`        | `driver:status_changed`     | `driverSocket.driver:status`                | `{ driverId, driverNom, status, timestamp }` |
| `DISPATCHER_STATUS`    | `dispatcher:status`         | présence dispatcher                          | `{ dispatcherId, online }` |
| `STATS_UPDATE`         | `stats:update`              | `socketService.emitStatsUpdate`             | `{ ... KPIs ... }` |
| `PMT_EXTRACTED`        | `pmt:extraite`              | `aiController.extrairePMT`                  | `{ transportId, documentId, extractedData }` |

### Auto-dispatch (Sprint 6)

| Constante                | Event sur le wire                  | Émis depuis                  | Cible |
|---|---|---|---|
| `AUTODISPATCH_PROPOSAL`  | `autoDispatch:proposal_created`    | `autoDispatchWorker`         | `role:dispatcher` + `role:admin` |
| `AUTODISPATCH_ASSIGNED`  | `autoDispatch:auto_assigned`       | `autoDispatchWorker`         | `role:dispatcher` |
| `AUTODISPATCH_DECIDED`   | `autoDispatch:proposal_decided`    | `autoDispatchController`     | `role:dispatcher` |

### Messagerie ciblée

| Constante              | Event sur le wire     | Cible                              | Payload |
|---|---|---|---|
| `MESSAGE_TO_DRIVER`    | `message:dispatcher`  | `driver:{id}`                      | `{ messageId, from, fromNom, text, timestamp }` |
| `MESSAGE_TO_DISPATCHER`| `message:driver`      | `user:{dispatcherId}` ou `role:dispatcher` | `{ messageId, from, fromNom, text, timestamp }` |
| `MESSAGE_DELIVERED`    | `message:delivered`   | socket émetteur                    | `{ messageId, localId }` |
| `SHIFT_FORCED_END`     | `shift:forced_end`    | `driver:{id}`                      | `{ byUserId, timestamp }` |
| `NOTIFICATION_UNREAD`  | `notification:unread_count` | `user:{id}`                  | `{ count }` |

### Système

| Constante           | Event sur le wire | Cible       | Payload |
|---|---|---|---|
| `SYSTEM_HEARTBEAT`  | `system:heartbeat`| broadcast   | `{ timestamp, status: "ok" }` |
| `CONNECTED_ACK`     | `connected:ack`   | socket émetteur | `{ socketId, role, timestamp, message }` |

---

## Events clients → serveur (entrants)

| Constante              | Event sur le wire   | Émetteur                  | Handler |
|---|---|---|---|
| `IN_DRIVER_LOCATION`   | `driver:location`   | driver app (bg isolate)   | `driverSocket.on('driver:location')` |
| `IN_DRIVER_STATUS`     | `driver:status`     | driver app                | `driverSocket.on('driver:status')` |
| `IN_MESSAGE_DRIVER`    | `message:driver`    | driver app                | `driverSocket.on('message:driver')` |
| `IN_MESSAGE_DISPATCHER`| `message:dispatcher`| web dispatcher            | `driverSocket.on('message:dispatcher')` |
| `IN_JOIN_TRANSPORT`    | `join:transport`    | patient app, web          | `sockets/index.js` |
| `IN_LEAVE_TRANSPORT`   | `leave:transport`   | patient app, web          | `sockets/index.js` |
| `IN_JOIN_ROLE`         | `join:role`         | tout client               | `socketService.init` |
| `IN_SHIFT_FORCE_END`   | `shift:force_end`   | web dispatcher            | `driverSocket.on('shift:force_end')` |
| `IN_PATIENT_FCM_TOKEN` | `patient:fcm_token` | patient app               | `patientSocket` |
| `IN_REQUEST_STATS`     | `request:stats`     | web dispatcher            | `socketService.init` |

---

## Events DÉPRÉCIÉS (à supprimer après cutover M2)

Ces noms ont été remplacés. Aucun nouveau code ne doit les utiliser. Si tu en
trouves encore (via `grep -rn` sur le repo), c'est un oubli de migration.

| Ancien nom                | Remplacé par         | Raison |
|---|---|---|
| `transport:statut`        | `transport:status`   | EN/FR inconsistent |
| `transport:statut_change` | `transport:status`   | duplicate sémantique |
| `transport:status_updated`| `transport:status`   | duplicate sémantique |
| `vehicule:position`       | `vehicle:position`   | EN/FR inconsistent |
| `driver:location_updated` | `vehicle:position`   | duplicate sémantique |
| `tracking:gps_updated`    | `transport:gps`      | renommage de domaine |

Mots-clés à grep pour valider le cutover :
```
grep -rn "transport:statut\|vehicule:position\|driver:location_updated\|tracking:gps_updated\|status_updated" \
  server/ client/ blancbleu_driver/ blancbleu_patient/
```

---

## Règles de payload

- Toutes les clés sortantes en **anglais** : `oldStatus`, `newStatus`,
  `timestamp`, `transportId`, `vehicleId`. Les clés FR (`ancienStatut`,
  `nouveauStatut`) restent ACCEPTÉES en LECTURE pendant la transition, mais
  l'écriture doit utiliser uniquement les clés anglaises.
- `timestamp` toujours en ISO-8601 (`new Date().toISOString()` ou `new Date()`
  sérialisé par socket.io).
- `transportId`, `vehicleId`, `driverId` toujours en `String` (jamais
  `ObjectId` brut) — `String(doc._id)` au moment de l'emit.
