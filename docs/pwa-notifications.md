# PWA + Web Push + Heatmap (Sprint 6 — Module D)

## 1. PWA (Progressive Web App)

### Fichiers

| Fichier | Rôle |
|---|---|
| `client/public/manifest.json` | Métadonnées : nom, icônes, theme color (#1D6EF5), `display: standalone` |
| `client/public/sw.js` | Service Worker custom (sans Workbox) |
| `client/public/offline.html` | Page de fallback hors-ligne |
| `client/public/index.html` | `<link rel="manifest">`, `<meta theme-color>`, balises iOS apple-mobile-web-app-* |
| `client/src/serviceWorkerRegistration.js` | Helper `initServiceWorker()` |
| `client/src/index.js` | Appel `initServiceWorker()` après `initSentry()` |

### Stratégies de cache

| Type de requête | Stratégie | Cache |
|---|---|---|
| Navigation HTML | Network puis `/offline.html` | — |
| `/api/*` (GET) | Network-first puis cache | `bb-v1-api` |
| `*.js,css,png,jpg,svg,webp,woff2,ico` | Cache-first puis network | `bb-v1-static` |
| Cross-origin (CDN fonts) | Bypass SW | — |

Versioning : modifier `CACHE_VERSION` dans `sw.js` purge tous les caches au prochain `activate`.

### Activation

- **Production seulement** : `initServiceWorker()` est no-op en dev (`process.env.NODE_ENV !== "production"`).
- **Désactivation runtime** : positionner `REACT_APP_PWA_DISABLED=true` au build.
- **HTTPS obligatoire** sauf sur `localhost`.

### Installation

Le manifeste + l'enregistrement SW suffisent pour que Chrome/Edge proposent
"Installer l'application" (icône dans la barre d'adresse). Lighthouse PWA
score atteignable dès `npm run build` + serve.

---

## 2. Web Push (notifications navigateur)

### Architecture

```
┌──────────────┐   POST subscribe   ┌─────────────────┐
│  Navigateur  │ ────────────────▶ │  Node /api/...  │
│  (sw.js)     │                    │  pushController │
│              │                    └────────┬────────┘
│              │                             ▼
│              │                    ┌─────────────────┐
│              │                    │ PushSubscription │
│              │                    │ (MongoDB)        │
│              │                    └────────┬────────┘
│              │                             │
│              │   web-push lib + VAPID      ▼
│              │ ◀────────────────  webPushService.sendToUser/Role
└──────────────┘
```

### Setup (admin)

```bash
# 1. Générer la paire VAPID (une seule fois pour le déploiement)
node server/scripts/generate-vapid.js

# 2. Copier les 3 lignes affichées dans .env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contact@blancbleu.fr

# 3. Redémarrer le server (et le worker)
```

Sans ces variables :
- `GET /api/notifications/push/vapid-public-key` → 503.
- `webPushService.sendToUser/Role` → no-op + warn une fois dans les logs.

### Routes API

| Méthode | Path | Auth | Rôle |
|---|---|---|---|
| GET    | `/api/notifications/push/vapid-public-key` | Public | — |
| POST   | `/api/notifications/push/subscribe` | Bearer | tout user |
| DELETE | `/api/notifications/push/unsubscribe` | Bearer | tout user |
| GET    | `/api/notifications/push/status` | Bearer | tout user |

### Flux côté navigateur

Le hook `usePushNotifications()` (`client/src/hooks/usePushNotifications.js`)
encapsule tout :

```jsx
const { supported, permission, isSubscribed, subscribe, unsubscribe, loading, error } =
  usePushNotifications();
```

Étapes internes du `subscribe()` :

1. `Notification.requestPermission()` → `granted` requis.
2. `GET /api/notifications/push/vapid-public-key`.
3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
4. `POST /api/notifications/push/subscribe { subscription }` → upsert backend.

Le composant `PushNotificationsToggle` est intégré dans le footer de la
sidebar (Layout).

### Intégration backend

Le `autoDispatchWorker` envoie un push à tous les `dispatcher` quand une
proposition est créée en mode HITL :

```js
await webPush.sendToRole("dispatcher", {
  title: "Nouvelle proposition auto-dispatch",
  body:  `${transport.numero} → ${best.vehicleName} (score ${best.score})`,
  data:  { url: "/auto-dispatch" },
});
```

Pour ajouter un autre point d'intégration :
```js
const webPush = require("../services/webPushService");
await webPush.sendToUser(userId, { title, body, data: { url } });
// ou
await webPush.sendToRole("admin", { title, body });
```

### Nettoyage auto

Quand un push reçoit une réponse 410 (Gone) ou 404, la `PushSubscription`
correspondante est **supprimée automatiquement** (le token a expiré côté
navigateur). Pas besoin de cron de nettoyage.

### Limites

- **HTTPS obligatoire en prod.** Chrome refuse les SW non-HTTPS hors localhost.
- iOS Safari ne supporte le Web Push qu'à partir de iOS 16.4 et seulement pour
  les PWA installées sur l'écran d'accueil.
- Firefox demande la permission à chaque visite si l'utilisateur ne souscrit pas.

---

## 3. Heatmap des transports

### Endpoint

`GET /api/analytics/heatmap?days=N` (defaut 30, clamp 1-180)

Réponse :
```json
{
  "days": 30,
  "count": 142,
  "uniquePoints": 87,
  "maxWeight": 12,
  "points": [[43.710, 7.262, 12], [43.700, 7.270, 8], ...]
}
```

Agrégation : départ + destination de chaque transport en statut "actif/terminé"
(REQUESTED exclu — souvent non géocodé). Bucketing par
`lat.toFixed(3),lng.toFixed(3)` = ~110m de précision.

### Frontend

| Fichier | Rôle |
|---|---|
| `client/src/components/map/TransportHeatmap.jsx` | Couche `L.heatLayer` à monter dans un `MapContainer` |
| `client/src/pages/CarteAnalytique.jsx` | Page `/carte-analytique` avec sélecteur 7/30/90/180j + 3 KPI + carte |

Dépendance : `leaflet.heat` (plugin pur, pas de wrapper React).

### Personnalisation

Le gradient par défaut :
- 0.2 → bleu
- 0.4 → vert
- 0.6 → ambre
- 0.8 → rouge
- 1.0 → rouge foncé

Override via `<TransportHeatmap options={{ gradient: {...}, radius: 30 }} />`.

---

## 4. Tests

| Suite | Fichier | # tests |
|---|---|---|
| Web Push (service + controller) | `server/__tests__/integration/webPush.test.js` | 10 |
| Heatmap endpoint | `server/__tests__/integration/analyticsHeatmap.test.js` | 5 (=4 + 1 clamp) |

Pas de tests Leaflet (jsdom ne rend pas la carte). Couverture E2E à ajouter
avec Playwright si besoin (Sprint 7).

## 5. Démo

```bash
# 1. Build prod du client (SW activé seulement en prod)
cd client && npm run build && npx serve -s build

# 2. Ouvrir http://localhost:3000 dans Chrome -> "Installer l'application"
# 3. Activer les notifications depuis la sidebar (bouton "Activer notifs")
# 4. Déclencher une proposition auto-dispatch (Module A) -> push reçu
# 5. Aller sur /carte-analytique -> heatmap centrée sur Nice
```
