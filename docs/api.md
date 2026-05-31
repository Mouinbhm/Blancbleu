# API BlancBleu — guide d'utilisation

REST + WebSocket exposés par le backend Express sur `:5000`. Documentation
interactive servie par Swagger UI ; spec téléchargeable en JSON.

## Accès

| Surface          | URL                                   | Quand l'utiliser                                   |
| ---------------- | ------------------------------------- | -------------------------------------------------- |
| Swagger UI       | `http://localhost:5000/api-docs`      | Exploration interactive, tests d'endpoints en clic |
| Spec OpenAPI 3.0 | `http://localhost:5000/api-docs.json` | Import Postman / Insomnia, génération de clients   |
| Snapshot disque  | `server/docs/openapi.json`            | Vérifier le spec en CI, comparer entre branches    |

En production : Swagger UI **désactivé par défaut**. Activer en posant
`SWAGGER_IN_PROD=true` et protéger l'endpoint derrière une auth admin via le
reverse proxy (cf. `docs/operations.md` §2).

## Régénérer la spec

```bash
npm --prefix server run docs:openapi
```

Le script `scripts/dump-openapi.js` parcourt les JSDoc `@openapi` de
`routes/*.js` et `controllers/*.js`, fusionne avec les composants partagés de
[server/docs/openapi-components.js](../server/docs/openapi-components.js) et
écrit le résultat dans `server/docs/openapi.json`. Sortie typique :

```
OpenAPI spec écrit : .../server/docs/openapi.json
  paths : 40
  components.schemas : 16
```

## Authentification dans Swagger UI

1. Appeler `POST /api/auth/login` avec vos credentials.
2. Copier le `token` de la réponse.
3. Cliquer **Authorize** (cadenas en haut à droite) → coller le JWT dans
   `bearerAuth`.
4. Tous les appels suivants partent avec `Authorization: Bearer <token>`.

Pour les routes service-to-service (training-data, model/retrain), utiliser
`serviceTokenAuth` avec la valeur de `AI_SERVICE_TOKEN`.

## Conventions

- **Tags** servent à grouper dans l'UI : `Auth`, `Transports`, `Vehicles`,
  `Patients`, `Prescriptions`, `Factures`, `GDPR`, `Tracking`, `AI`,
  `Analytics`, `Health`, `Admin`.
- **Schémas réutilisables** dans `components.schemas` — référencer via
  `$ref: "#/components/schemas/Transport"` plutôt que dupliquer.
- **Responses partagées** dans `components.responses` :
  `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `BadRequest`,
  `ValidationError`, `ServerError`.
- **Pattern d'annotation** : JSDoc `@openapi` placé **directement au-dessus**
  de la ligne `router.<verbe>(...)` correspondante, jamais dans un fichier
  YAML séparé.

## Ajouter une route à la doc

Exemple minimal — copier ce squelette devant n'importe quelle route :

```js
/**
 * @openapi
 * /api/<chemin>/{id}:
 *   patch:
 *     tags: [<TagExistant>]
 *     summary: <Une phrase>
 *     description: <Bloc YAML | …>
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/<Schema>" }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/<Schema>" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.patch("/:id", protect, ctrl.update);
```

Si vous touchez à un schéma partagé ou ajoutez une `response` réutilisable,
modifiez [server/docs/openapi-components.js](../server/docs/openapi-components.js) plutôt que de copier-coller.

## Couverture actuelle

État au commit `docs(api): annotate 30 critical endpoints` :

| Tag           | Opérations annotées |
| ------------- | ------------------- |
| Auth          | 5                   |
| Transports    | 10                  |
| Vehicles      | 4                   |
| Patients      | 4                   |
| Prescriptions | 3                   |
| Factures      | 4                   |
| GDPR          | 3                   |
| Tracking      | 2                   |
| AI            | 11                  |
| **Total**     | **46 / ~80**        |

Les routes restantes (analytics, planning, payments Stripe, shift, messages,
notifications, équipements, maintenances, audit, comptabilité) ne sont pas
encore annotées — ouvrir un PR ciblé par fichier.

## Notes de mapping (spec demandée → endpoints réels)

Certaines lignes du sprint demandaient des chemins/verbes qui n'existent pas
en l'état du code. Les annotations couvrent les endpoints **réellement
exposés** ; correspondances appliquées :

| Demandé                            | Annoté                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| `POST /transports/:id/assign`      | `PATCH /transports/{id}/assign`                               |
| `POST /transports/:id/status`      | `PATCH /transports/{id}/complete` (transition représentative) |
| `POST /transports/:id/cancel`      | `PATCH /transports/{id}/cancel`                               |
| `POST /transports/:id/no-show`     | `PATCH /transports/{id}/no-show`                              |
| `GET  /transports/:id/history`     | `GET /transports/{id}/timeline`                               |
| `POST /transports/recurring`       | `POST /transports/recurrents`                                 |
| `PATCH /vehicles/:id`              | `PUT /vehicles/{id}`                                          |
| `GET  /vehicles/available`         | `GET /vehicles/availability?date=YYYY-MM-DD`                  |
| `POST /factures/:id/pay`           | `PATCH /factures/{id}/statut` (paiement Stripe = webhook)     |
| `POST /prescriptions` (upload)     | `POST /prescriptions/upload` (multipart)                      |
| `POST /prescriptions/:id/validate` | `PATCH /prescriptions/{id}/validate`                          |
| `GET  /gdpr/patients/me/data`      | `GET /gdpr/export`                                            |
| `PATCH /gdpr/patients/me/consent`  | `POST /patients/{id}/consent` (annoté sous tag `GDPR`)        |
| `POST /tracking/position`          | `POST /tracking/batch` (batch GPS app chauffeur)              |
| `GET  /tracking/:transportId`      | `GET /tracking/live` (snapshot dispatcher)                    |
