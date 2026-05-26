# Push Notifications FCM — BlancBleu

Sprint M4 a câblé les notifications push **réelles** (FCM) côté serveur +
driver app + patient app, avec **dégradation gracieuse** : sans config
Firebase, l'app build et tourne, les push sont skip silencieusement, et
les notifications passent uniquement par socket + notifs locales.

---

## Architecture

```
┌────────────┐  PATCH /transports/.../status      ┌─────────────────┐
│ Web Driver │ ───────────────────────────────▶  │   server (M2)   │
└────────────┘                                    │ transportLifecyc│
                                                  └────┬────────────┘
                                                       │ pushDispatcher.pushToDriver/PatientEmail
                                                       ▼
                                                  ┌─────────────────┐
                                                  │ BullMQ queue    │
                                                  │   push          │
                                                  └────┬────────────┘
                                                       │
                                                  ┌────▼────────────┐
                                                  │ pushWorker      │
                                                  │  ↓              │
                                                  │ pushNotification│
                                                  │  (firebase-admin)│
                                                  └────┬────────────┘
                                                       │ FCM HTTPS
                              ┌────────────────────────┴──────────┐
                              ▼                                    ▼
                       ┌────────────┐                        ┌────────────┐
                       │ Driver app │                        │ Patient app│
                       │ (foreground│                        │ (foreground│
                       │  + tué)    │                        │  + tué)    │
                       └────────────┘                        └────────────┘
```

- **Foreground** (app ouverte) : FCM délivre `onMessage` → l'app affiche une
  notif locale via `flutter_local_notifications` (channel critique).
- **Background** (app minimisée) : FCM affiche automatiquement la notif système
  (bloc `notification` du message hybride). Tap → `onMessageOpenedApp`.
- **App tuée** : FCM affiche la notif système ; tap → bg handler top-level
  `_fcmBackgroundHandler` + `getInitialMessage` au prochain démarrage.

---

## Setup côté serveur (production)

### 1. Créer le projet Firebase

1. Console Firebase : <https://console.firebase.google.com/>
2. Créer un projet `blancbleu-prod` (ou réutiliser un existant).
3. Ajouter 2 apps Android :
   - `com.blancbleu.blancbleu_driver`
   - `fr.blancbleu.blancbleu_patient`
4. Optionnel : ajouter 2 apps iOS (`Bundle ID` identiques).

### 2. Générer le service account (clé privée)

1. Project Settings → Service accounts → "Generate new private key".
2. Télécharger le fichier `*.json`.
3. **Ne JAMAIS le committer** — il est gitignored (`firebase-service-account*.json`).
4. Le poser sur le serveur, par exemple `server/firebase-service-account.json`.

### 3. Renseigner `FIREBASE_SERVICE_ACCOUNT`

3 formats acceptés (le service détecte automatiquement) :

```env
# 1. JSON inline (le plus simple en dev local)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"blancbleu-prod",...}

# 2. JSON encodé base64 (recommandé pour Docker/CI, evite l'echappement)
FIREBASE_SERVICE_ACCOUNT=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6...

# 3. Chemin de fichier (relatif au cwd OU absolu)
FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json
```

### 4. docker-compose

`docker-compose.yml` lit `FIREBASE_SERVICE_ACCOUNT` depuis l'env hôte (valeur
vide par défaut → no-op). Mounter le fichier si format chemin :

```yaml
server:
  environment:
    FIREBASE_SERVICE_ACCOUNT: /run/secrets/fb_sa.json
  secrets:
    - fb_sa

worker:
  environment:
    FIREBASE_SERVICE_ACCOUNT: /run/secrets/fb_sa.json
  secrets:
    - fb_sa

secrets:
  fb_sa:
    file: ./firebase-service-account.json
```

(Pour le format inline ou base64, juste `export FIREBASE_SERVICE_ACCOUNT=...`.)

---

## Setup côté Driver (Android)

### 1. Télécharger `google-services.json`

Console Firebase → Project Settings → App driver Android → "Download google-services.json".

Poser dans `blancbleu_driver/android/app/google-services.json` (gitignored).

### 2. iOS (optionnel)

- Activer Push Notifications + Background Modes (Remote notifications) dans
  Xcode > Signing & Capabilities.
- Générer une APNs key sur Apple Developer + l'uploader dans Firebase Console.
- Télécharger `GoogleService-Info.plist` → `ios/Runner/GoogleService-Info.plist`.

### 3. Build

Le plugin `google-services` n'est appliqué QUE si `google-services.json` existe
(cf. `android/app/build.gradle`). Donc :

- **Avec** le fichier → FCM actif, l'app peut recevoir des push.
- **Sans** le fichier → build OK, app boote OK, `PushService.init()` renvoie
  false, FCM désactivé runtime. Pas de crash.

## Setup côté Patient (Android)

Idem driver, applicationId `fr.blancbleu.blancbleu_patient`. Pose le fichier
dans `blancbleu_patient/android/app/google-services.json`.

---

## Matrice events → push

| Source serveur | Event métier                     | Cible      | Channel Android      | Title (RGPD-safe)            | Body                          | data                                                  |
|---|---|---|---|---|---|---|
| `transportLifecycle.assignerVehicule` | Véhicule + chauffeur assignés à un transport | Driver     | `blancbleu_critical` | "Nouvelle mission"           | "Transport TRS-..."           | `type=transport_assigned, transportId`                |
| `transportLifecycle._transition`      | Statut → `ASSIGNED`                          | Patient    | `blancbleu_transport`| "Véhicule attribué"          | "Transport TRS-..."           | `type=transport_status, transportId, newStatus`       |
| `transportLifecycle._transition`      | Statut → `EN_ROUTE_TO_PICKUP`                | Patient    | `blancbleu_transport`| "Votre ambulance arrive"     | "Transport TRS-..."           | `type=transport_status, transportId, newStatus`       |
| `transportLifecycle._transition`      | Statut → `ARRIVED_AT_PICKUP`                 | Patient    | `blancbleu_transport`| "Votre ambulance est sur place" | "Transport TRS-..."        | `type=transport_status, transportId, newStatus`       |
| `transportLifecycle._transition`      | Statut → `CANCELLED`                         | Patient    | `blancbleu_transport`| "Transport annulé"           | "Transport TRS-..."           | `type=transport_status, transportId, newStatus`       |

**Anti-spam** : seuls les 5 events ci-dessus déclenchent un push. Les autres
changements de statut (e.g. `PATIENT_ON_BOARD`, `COMPLETED`, `BILLED`)
passent uniquement par socket — le patient les voit dans l'app ouverte.

**RGPD** : aucun nom patient, aucune donnée médicale dans `title` / `body`.
Le `transportId` dans `data` est nominal mais non exposé sur l'écran de
verrouillage (visible seulement après ouverture). `visibility: public` OK.

---

## Deep-link routing

Côté driver (`main.dart._handleFcmDeepLink`) et patient (`main.dart._handleFcmDeepLink`)
selon `data.type` :

| Type             | Action                                                       |
|---|---|
| `transport_assigned` | Driver : snackbar + `SyncService.sync()` (TODO M5 : navigation vers `/transports/:id`). Patient : N/A |
| `transport_status`   | Snackbar + sync. (TODO M5 : navigation vers fiche transport/suivi.) |
| `message_dispatcher` | Driver : (TODO M5 : ouvrir le chat.)                         |
| `shift_forced_end`   | Driver : feedback + `ShiftCubit.end()` géré via socket déjà.   |
| `facture`            | Patient : (TODO M5 : ouvrir l'écran factures.)              |

---

## Comportement de dégradation

| Composant | Sans config Firebase | Avec config Firebase |
|---|---|---|
| Serveur | `pushNotification.isEnabled()` = false. `pushDispatcher.push*` met quand même le job en queue. `pushWorker` skip avec `{ skipped: 'push_disabled' }`. **Pas de crash.** | Job en queue → envoi FCM → notif système chez le destinataire. |
| Driver app | `PushService.init()` returns false. `attachHandlers` est no-op. Notifs locales fonctionnent toujours (socket). Build Android OK (`apply plugin: google-services` skip si le fichier absent). | FCM actif. App reçoit push même tuée. |
| Patient app | Idem driver. `registerFcmToken` (anciennement code mort) reste inactif sans crash. | FCM actif. |

---

## Tests

- `server/__tests__/integration/fcmTokenLifecycle.test.js` (11 tests) :
  - POST/DELETE `/fcm-token` (driver + patient) ; logout efface le token ;
    auth requise ; 400 sans body.
  - `pushNotification` en mode no-op (sans `FIREBASE_SERVICE_ACCOUNT`) :
    `isEnabled() === false`, `sendToToken` / `notifyPatient` renvoient
    `{ skipped: 'push_disabled' }`.
- `server/__tests__/integration/pushDispatcher.test.js` (Sprint M4 étape 8) :
  - `pushToDriver` / `pushToPatientUser` mettent bien un job en queue.
  - Job invalide → skip propre, pas de crash.

Validation manuelle (nécessite Firebase configuré + device) :

1. **Driver tué** → assigner un transport via web dispatcher → le téléphone
   reçoit "Nouvelle mission TRS-...". Tap → ouvre l'app.
2. **Patient tué** → passer le transport en `EN_ROUTE_TO_PICKUP` → notif
   "Votre ambulance arrive". Tap → ouvre l'app.
3. Token périmé (désinstaller/réinstaller l'app sans logout) → `sendToToken`
   renvoie `messaging/registration-token-not-registered` → cleanup auto
   du `fcmToken` en base.
