# Operations — BlancBleu

Guide opérationnel : déploiement, sauvegardes, monitoring, scaling, incident response.
Public visé : ops / dev qui mettent en prod et qui sont d'astreinte.

---

## 1. Architecture déployée

```
[Internet] → [Reverse proxy TLS]
                ├── client (nginx 8080)  → static React build
                └── server (node 5000)   → API + Socket.IO
                       ├── mongo (27017, replica set rs0 single-node)
                       ├── redis (6379)
                       └── ia    (5002, FastAPI)
                worker (node)            → BullMQ jobs (email, OCR, PDF)
```

- **Reverse proxy TLS** : non fourni — utiliser nginx, traefik ou caddy en amont.
- **MongoDB** : replica set obligatoire (sessions transactionnelles dans `withTransactionOrFallback`).
- **Redis** : cache + BullMQ + rate limiter distribué.
- **IA** : OCR + scoring dispatch + prédiction durée. Stateless.

---

## 2. Déploiement (Docker)

### Démarrage prod (avec override)

```bash
cp .env.example .env
# remplir TOUS les secrets (MONGO_USER, MONGO_PASSWORD, JWT_SECRET,
#                          AI_SERVICE_TOKEN, ENCRYPTION_KEY, SENTRY_DSN…)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Vérification post-déploiement

```bash
docker compose ps                                       # tous "healthy"
curl -fsS http://localhost:5000/api/health | jq .
curl -fsS http://localhost:5000/api/health/readiness    # 200 si mongo+redis+IA OK
curl -fsS http://localhost:5002/health
curl -fsS -H "X-Metrics-Token: $METRICS_TOKEN" http://localhost:5000/metrics | head -20
```

### Premier admin

```bash
docker compose exec server node scripts/create-admin.js
```

### Mise à jour zéro-downtime (simple)

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build server client ia worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d \
  --no-deps server client ia worker
```

> Pour rolling proper, passer par un orchestrateur (k8s, Nomad, Swarm).

---

## 3. Sauvegardes

### MongoDB — dump quotidien

```bash
# Exécution depuis l'host
docker compose exec mongo mongodump \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin \
  --db blancbleu \
  --archive=/data/db/backup-$(date +%F).archive --gzip

# Récupérer sur l'host puis envoyer vers S3 / B2 / cloud
docker compose cp mongo:/data/db/backup-$(date +%F).archive ./backups/
```

Cron suggéré : `0 2 * * *` (2 h du matin, faible trafic).
**Rétention recommandée** : 30 jours quotidiens + 12 mois mensuels.

### Restore

```bash
docker compose exec mongo mongorestore \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin \
  --archive=/data/db/backup-2026-05-24.archive --gzip --drop
```

### Redis

Le worker traite des jobs idempotents : pas de sauvegarde critique.
AOF est activé (`--appendonly yes`) → recovery au restart automatique.

### Fichiers (PMT scannées, factures PDF)

Stockés actuellement sur le filesystem du container `server`. **À migrer vers
un bucket S3-compatible** (B2, Scaleway, MinIO) en prod. Tant que ce n'est pas
fait, monter un volume Docker dédié et le sauvegarder avec `tar -czf`.

---

## 4. Observabilité

### Logs

- Format JSON (Winston) avec `requestId` (AsyncLocalStorage) et `userId`.
- En prod : `LOG_LEVEL=warn` (override `docker-compose.prod.yml`).
- Rotation : json-file driver, 10 MB × 3 fichiers par container.
- Pour centraliser : ajouter un sidecar Loki/Promtail/Vector et pousser vers Grafana Cloud.

### Métriques Prometheus

- Endpoint : `GET /metrics` (protégé par header `X-Metrics-Token`).
- Variables exposées :
  - `http_request_duration_seconds` (histogramme, labels: method, route, status)
  - `dispatch_recommendations_total` (counter, label: source = ia | fallback_node)
  - Métriques default Node (event loop lag, heap, GC…).
- À scraper toutes les 15 s.

### Erreurs Sentry

- Backend : `SENTRY_DSN` env (no-op si absent).
- Frontend : `REACT_APP_SENTRY_DSN` au build.
- Tag `requestId` propagé automatiquement pour corrélation logs ↔ traces.

### Dashboards Grafana recommandés

| Panel                         | Source           | Métrique                                                                   |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------- |
| Latence p50/p95/p99 par route | Prometheus       | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` |
| Taux d'erreur 5xx             | Prometheus       | `sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m]))`        |
| Dispatch IA vs fallback       | Prometheus       | `rate(dispatch_recommendations_total[10m])`                                |
| Heap Node                     | Prometheus       | `nodejs_heap_size_used_bytes`                                              |
| Mongo connexions actives      | mongodb_exporter | `mongodb_connections{state="current"}`                                     |

---

## 5. Scaling

### Vertical (rapide, par défaut)

Resource limits prod (voir `docker-compose.prod.yml`) :

- server : 768 MB / 1.5 cpu
- worker : 512 MB / 1 cpu
- ia : 1 GB / 2 cpu
- mongo : non-limité (à adapter)

Ajuster en fonction des métriques (heap utilisation > 80 % → augmenter).

### Horizontal (multi-instance)

- **server** : stateless OK, sessions via JWT. Plusieurs replicas derrière le reverse proxy. Socket.IO → ajouter un adapter Redis (`@socket.io/redis-adapter`).
- **worker** : BullMQ supporte plusieurs consommateurs sur la même queue → scale libre.
- **ia** : stateless, scale libre.
- **mongo** : passer à un vrai replica set 3 nœuds (au-delà du single-node actuel) avant tout horizontal scaling significatif.

---

## 6. Incident response

### Server KO

1. `docker compose ps` → statut "unhealthy" ?
2. `docker compose logs --tail=200 server` → stack trace.
3. `docker compose restart server`. Pendant ce temps : reverse proxy doit retourner 503.
4. Si redémarrage en boucle : `docker compose exec mongo mongosh` → vérifier connexion DB.

### MongoDB down / replica set cassé

```bash
docker compose exec mongo mongosh -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
  --authenticationDatabase admin --eval 'rs.status()'

# Si rs non initialisé :
docker compose exec mongo mongosh -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
  --authenticationDatabase admin --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]})'
```

### Tous les transports "stuck" (lifecycle bloqué)

Vérifier la queue BullMQ :

```bash
docker compose exec server node -e \
  'require("bullmq").Queue && new (require("bullmq").Queue)("transport-lifecycle").getJobCounts().then(console.log)'
```

### Rollback

```bash
git log --oneline -10
git checkout <sha>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## 7. CI/CD

- GitHub Actions : voir `.github/workflows/ci.yml`.
- Jobs critiques (bloquants) : `test-server`, `test-ia`, `build-client`.
- Jobs informatifs (continue-on-error) : `lint`, `audit`, `docker-build`, `e2e`.
- Coverage gate : 60 % minimum côté server (à monter à 80 %).

---

## 8. Suppression d'entités métier (intégrité référentielle)

Les routes REST exposent uniquement du **soft-delete** (`deletedAt`, `actif: false`).
Les hooks Mongoose `pre("findOneAndDelete")` posés sur `Vehicle`, `Personnel` et
`Patient` protègent contre les suppressions dures faites depuis un script, le
mongo shell ou un futur endpoint admin.

### Règles

| Entité      | Suppression dure                         | Comportement                                                                                                                                              |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vehicle`   | `findOneAndDelete` / `findByIdAndDelete` | Refus si transport actif (statut hors `COMPLETED/BILLED/PAID/CANCELLED/FAILED`). Sinon → flag `vehiculeDeleted=true` sur tous les Transport référençants. |
| `Personnel` | idem                                     | Idem mais sur `chauffeur` ; flag `chauffeurDeleted=true`.                                                                                                 |
| `Patient`   | idem                                     | **Toujours refusé** — passer par `patientGdprService.anonymizePatient(...)` (RGPD art. 17).                                                               |

### Que faire concrètement

1. **Véhicule retiré du parc** : soft-delete via `DELETE /api/vehicles/:id`
   (route existante, met `deletedAt`). Si purge dure souhaitée plus tard,
   utiliser le mongo shell — le hook bloquera tant que des missions actives
   référencent le véhicule.
2. **Chauffeur qui quitte la société** : soft-delete via
   `DELETE /api/personnel/:id` (met `actif=false`). Les missions futures ne le
   prendront plus en compte ; l'historique reste lisible.
3. **Patient — droit à l'oubli RGPD** : appeler
   `POST /api/gdpr/patients/:id/anonymize` (admin/DPO uniquement) avec
   `confirmReason`. Cf. `docs/rgpd.md` §droit à l'oubli.

### Synchronisation des indexes

Après tout ajout/retrait d'index dans un modèle, lancer :

```bash
# Dry-run d'abord (montre create/drop sans appliquer)
node server/scripts/sync-indexes.js --dry-run

# Application
npm --prefix server run db:sync-indexes
```

En production : **mongodump avant**. `syncIndexes()` drop les indexes du schema
disparus — vérifier le diff avant de presser le bouton.

---

## 9. Runbook minimal

| Symptôme                                      | Action                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `/api/health` retourne 503                    | Voir logs server, restart                                                 |
| Latence > 2 s p95                             | Vérifier Mongo (slow query log), CPU, taille connexion pool               |
| Pas d'email envoyé                            | `EMAIL_*` env définis ? Worker tourne ? Quota SMTP ?                      |
| OCR rejette tous les PMT                      | IA service up ? Tesseract installé dans container ? `curl ia:5002/health` |
| Dispatch IA renvoie fallback systématiquement | IA service injoignable ou `AI_SERVICE_TOKEN` mismatch                     |
| 429 Too Many Requests                         | Rate limit déclenché — vérifier IP appelante, ajuster `rateLimiter.js`    |
