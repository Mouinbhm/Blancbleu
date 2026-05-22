# Sprint 1 — Notes et bugs trouvés en route

Ce fichier recense les bugs/problèmes découverts pendant le sprint mais NON corrigés.
À traiter dans un sprint futur.

## smartDispatch.js — non supprimé (étape 9)

`server/services/smartDispatch.js` (237 LoC) est encore importé par :
  - `server/services/transportLifecycle.js:17` : `const { smartDispatch } = require("./smartDispatch")`
  - `server/services/transportLifecycle.js:242` : appel `await smartDispatch({...})`

La suppression casserait le cycle de vie des transports.
Action : d'abord supprimer l'appel dans `transportLifecycle.js` et le remplacer
par `aiClient.recommanderDispatch(...)`, puis supprimer `smartDispatch.js`.

## Incohérence de casse AuthController.js (étape 8)

`server/controllers/authController.js` est suivi dans git comme `AuthController.js`
mais toutes les references utilisent la casse minuscule. Fonctionne sur Windows
(case-insensitive) mais pourrait poser problème sur Linux en CI.
Action : même procédure two-step rename que pour `user.js → User.js`.

## clearCookie path incohérent dans authController.js

Dans `logout` :
  - Cookie `bb_access` est créé avec `path: "/"`
  - `clearCookie(ACCESS_COOKIE_NAME, { path: "/api" })` utilise `path: "/api"`

Ces paths ne correspondant pas, le cookie n'est pas supprimé côté client.
Action : aligner `clearCookie` avec `path: "/"`.
