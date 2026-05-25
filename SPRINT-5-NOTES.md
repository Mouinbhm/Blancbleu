# Sprint 5 — Notes (non commité)

## Étape 1 — État initial du lint

### Server (npm run lint)
- **338 problems (13 errors, 325 warnings)** au démarrage de Sprint 5
- Composition :
  - `no-console` (≈ 239 warnings) — traité étape 2
  - `no-unused-vars` (≈ 80 warnings) — héritage à nettoyer dans un sprint cleanup
  - `no-empty` (errors) — quelques blocs catch vides dans `stripePaymentService.js`,
    `factureService.js`, etc.
  - `no-useless-escape` (errors) — quelques regex avec `\-` inutile dans
    `twoFactorService.js`
- Action : les 13 erreurs sont des bugs hérités. Je les laisse intactes pour
  ne pas mélanger les changements ; à corriger dans un sprint cleanup OU lors
  des fichiers touchés en étape 2.

### Client (npm run lint)
- **29 problems (14 errors, 15 warnings)** au démarrage Sprint 5
- Errors : `testing-library/no-node-access` (querySelector dans les RTL tests
  Sprint 3) + quelques warnings hooks/exhaustive-deps préexistants.
- Action : à fixer dans un sprint test cleanup (préférer `screen.getBy*`).

### Python (ruff check .)
- **57 errors** (38 auto-fixables avec `ruff check --fix`)
- Composition : surtout `I001` (imports désordonnés) + qq `E402` (imports tardifs).
- Action : `ruff check --fix .` corrigera 38 automatiquement (à faire dans un
  sprint cleanup ou en passant). Le reste = imports tardifs intentionnels
  dans `train_real.py` (imports lourds dans main).

## Étape 5 — Stack Prometheus + Grafana (skip Sprint 5)

Endpoint /metrics exposé et fonctionnel. Stack monitoring docker-compose
non ajoutée (en attente sprint ops dédié). À ajouter dans un override
`docker-compose.monitoring.yml` avec profil `monitoring` :
  - service `prometheus` qui scrape `http://server:5000/metrics` avec
    `X-Metrics-Token`
  - service `grafana` avec dashboards pré-provisionnés (HTTP latency,
    dispatch counter, default Node.js metrics)

## Étape 6 — Swagger : annotation partielle

Composants OpenAPI réutilisables (`server/docs/openapi-components.js`) +
script `npm run docs:openapi` créés. `auth.js` et `ai.js` ont des annotations
détaillées pour les routes critiques (12 paths dumpés).

À COMPLÉTER (sprint cleanup ou en passant lors de chaque modif de route) :
  - `routes/transports.js` (le plus gros — ~20 endpoints lifecycle)
  - `routes/vehicles.js`, `patients.js`, `prescriptions.js`, `factures.js`
  - `routes/analytics.js`, `geo.js`, `personnel.js`, `notifications.js`
  - Toutes les routes legacy/Flutter (v1/*).

Le spec courant dump 12 paths sur ~80 endpoints réels. Le reste sera ajouté
au fur et à mesure ; les schémas réutilisables (Transport, Vehicle, Patient,
Facture, DispatchRecommendation, etc.) sont déjà prêts dans
`docs/openapi-components.js`.