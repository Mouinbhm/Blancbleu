# Security — BlancBleu

Politique de sécurité applicative : auth, secrets, audit, dépendances, divulgation responsable.

---

## 1. Authentification & sessions

### Modèle

- **JWT access token** (15 min) + **refresh token** (7 j), tous deux émis à `/api/auth/login`.
- Stockage navigateur : cookies httpOnly `bb_access` et `bb_refresh` (jamais en localStorage).
- Cookie attributes en prod : `Secure`, `SameSite=Lax`, `httpOnly`.
- Rotation refresh : chaque appel `/api/auth/refresh` invalide l'ancien token.
- Révocation globale : `/api/auth/logout-all` (côté admin pour un user donné, ou pour soi-même).

### Rate limiting

- Login : 10 tentatives / 15 min / IP (`authLimiter`).
- Register (admin only) : 5 / 15 min / IP (`registerLimiter`).
- 2FA verify : 5 / 15 min / IP (`twoFaLimiter`).
- Réservoir distribué via Redis (`rate-limit-redis`).

### 2FA (TOTP)

- Obligatoire pour les rôles `admin`, `dispatcher`, `superviseur`.
- Implémentation : `speakeasy` + `qrcode` pour le setup.
- Codes de secours : 10 codes single-use générés au setup, hashés en base.

### Rôles

| Rôle          | Périmètre                                         |
| ------------- | ------------------------------------------------- |
| `admin`       | Tout — gestion users, config IA, reset password   |
| `dispatcher`  | CRUD transports, dispatch, assignation véhicules  |
| `superviseur` | Lecture + validation, analytics                   |
| `comptable`   | Factures, paiements Stripe                        |
| `patient`     | Ses propres transports / prescriptions / factures |

Enforcement : middleware `authorize(...roles)` dans `middleware/auth.js`.

---

## 2. Secrets

### Stockage

- **Jamais en commit** : `.env` est dans `.gitignore`, `.env.example` est un template.
- `MONGO_PASSWORD`, `JWT_SECRET`, `AI_SERVICE_TOKEN`, `ENCRYPTION_KEY`, `EMAIL_PASS`,
  `SENTRY_DSN`, `METRICS_TOKEN`, `STRIPE_SECRET_KEY` → en variable d'environnement uniquement.
- En prod, injection via gestionnaire de secrets (Vault, AWS SM, Doppler, Bitwarden Secrets).

### Génération recommandée

```bash
# JWT_SECRET (64 octets hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 octets — pour AES-256-GCM, voir utils/encryption.js)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AI_SERVICE_TOKEN (token partagé Node ↔ Python)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# METRICS_TOKEN
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### Rotation

- **JWT_SECRET** : la rotation invalide toutes les sessions actives — planifier maintenance.
- **AI_SERVICE_TOKEN** : rotation possible sans downtime si déployé simultanément côté node + python.
- **ENCRYPTION_KEY** : ne JAMAIS changer sans plan de migration des données chiffrées en base.

---

## 3. Chiffrement

| Donnée                                          | Chiffrement                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Mots de passe                                   | bcryptjs, cost 10                                                           |
| Données patient sensibles (NIR, numéro de sécu) | AES-256-GCM via `utils/encryption.js`                                       |
| 2FA TOTP secret                                 | chiffré en base                                                             |
| Cookies session                                 | signés (JWT) + httpOnly + Secure en prod                                    |
| TLS                                             | délégué au reverse proxy (à configurer en amont — non fourni dans la stack) |

---

## 4. Headers HTTP & CSP

- **Helmet** activé côté Express (CSP, X-Frame-Options, HSTS, etc.).
- **CORS** strict : whitelist via `ALLOWED_ORIGINS` (multi-valeur séparée par virgule).
- **Cookies** : `httpOnly`, `Secure` en prod, `SameSite=Lax` par défaut.
- **Nginx (client)** : `X-Content-Type-Options nosniff`, `X-Frame-Options SAMEORIGIN`,
  `Referrer-Policy no-referrer`, `server_tokens off`.

---

## 4b. Uploads & antivirus (ClamAV)

Les fichiers uploadés (PMT, signatures, avatars, documents personnel) sont
scannés par **ClamAV** avant traitement.

- **Démon** : service docker `clamav` (image `clamav/clamav:stable`), clamd en
  TCP sur `clamav:3310`. Base de signatures persistée dans le volume
  `clamav_db`, rafraîchie par freshclam (1er démarrage long, ~200 Mo).
- **Middleware** : `server/middleware/antivirus.js` → `scanUpload`, placé
  **après** multer sur toutes les routes d'upload (prescriptions, transports
  PMT/signature, ai PMT, personnel avatar/documents, patient prescriptions).
  Gère disque (`.path`) et mémoire (`.buffer` via `scanStream`).
- **Fichier infecté** → suppression immédiate + `400 { code: "FILE_INFECTED",
viruses }`. Tous les fichiers de la requête sont supprimés, pas seulement
  l'infecté.
- **Configuration** (`.env`) :
  - `CLAMAV_ENABLED` — `true` par défaut en prod, `false` sinon (dev/test sans
    démon). Mettre `false` en dev local si pas de ClamAV.
  - `CLAMAV_HOST` / `CLAMAV_PORT` — défaut `clamav` / `3310`.
  - `CLAMAV_FAIL_OPEN` — si le démon est injoignable : `false` (défaut) =
    **fail-closed** (upload refusé `503`), `true` = fail-open (laisser passer
    avec log d'alerte). En prod, garder `false`.
- **Test** : `__tests__/integration/antivirus.test.js` couvre le passe-through
  (désactivé / sans fichier). Le test de détection EICAR est opt-in via
  `RUN_CLAMAV_LIVE=true` (nécessite un démon joignable) — signature standard
  `EICAR-STANDARD-ANTIVIRUS-TEST-FILE`.

---

## 4c. Protection CSRF (double-submit)

Les sessions reposent sur des cookies httpOnly auto-envoyés par le navigateur →
vecteur CSRF. Deux couches :

1. **`SameSite=Strict`** sur `bb_access`/`bb_refresh` (un site tiers ne peut pas
   déclencher de requête authentifiée). Baseline déjà en place.
2. **Double-submit token** (`csrf-csrf`, `server/middleware/csrf.js`) en
   défense-en-profondeur : cookie `bb_csrf` (httpOnly, `__Host-` + Secure en
   prod) + header `X-CSRF-Token` que seul un script same-origin peut poser.

- **Flux client** : `GET /api/csrf-token` au boot → le client stocke le token
  et le renvoie en header sur POST/PUT/PATCH/DELETE
  (`client/src/services/api/client.js`). Refresh auto si `403 EBADCSRFTOKEN`.
- **Exclusions** (pas de cookie de session → CSRF non applicable) : webhook
  Stripe (signé HMAC), routes service-to-service IA (`AI_SERVICE_TOKEN`), app
  mobile `/api/v1/*` et `/api/patient` (auth Bearer), `/api/auth/login` et
  `/refresh`.
- **Désactivable** : `CSRF_ENABLED=false` (défaut hors prod → tests/E2E
  passent sans token ; les tests E2E tournent en `NODE_ENV=test`).
- **Test** : `__tests__/integration/csrf.test.js` (token émis, 403 sans header,
  200 avec header valide, route exclue, passe-through désactivé).

---

## 5. Audit & logs

- Toutes les actions sensibles loguées dans `AuditLog` (collection mongo).
- Champs : `userId`, `action`, `resource`, `resourceId`, `ip`, `userAgent`, `before`, `after`, `requestId`.
- Actions tracées : login (OK/KO), 2FA setup/verify, user create/update/delete, transport
  state transitions critiques, role change, password reset.
- Rétention : 12 mois minimum (à enforcer via un cron de purge — pas encore implémenté).

---

## 6. Dépendances & vulnérabilités

### CI

- `npm audit --audit-level=high` sur server + client (informatif en CI).
- `pip-audit` sur ai-service (informatif en CI).
- Job CI : `.github/workflows/ci.yml` → `audit`.

### Processus

1. Toute vuln **high** ou **critical** doit être traitée en moins de 7 jours.
2. Patch dispo → `npm update <pkg>` + test → PR.
3. Pas de patch → évaluer impact, désactiver le code path concerné si possible.
4. Vulns connues acceptées : à documenter ici dans la section ci-dessous.

### Vulnérabilités acceptées (à supprimer dès que résolues)

| CVE                   | Package | Sévérité | Justification | Date revue |
| --------------------- | ------- | -------- | ------------- | ---------- |
| _aucune actuellement_ |         |          |               |            |

---

## 7. Protections en place

- **NoSQL injection** : `express-mongo-sanitize` (middleware/sanitize.js) + Mongoose schemas stricts.
- **XSS** : sanitization input + Helmet CSP + escaping React par défaut.
- **CSRF** : `SameSite=Strict` sur les cookies de session **+** double-submit
  token (csrf-csrf) sur les mutations — cf. §4c.
- **SQL injection** : N/A (MongoDB).
- **Brute force** : rate limiting + 2FA + verrouillage compte après X échecs (à confirmer).
- **Énumération users** : `forgot-password` répond toujours 200 quelle que soit l'existence du compte.
- **Path traversal** : aucun endpoint n'accepte de path utilisateur arbitraire (uploads = `multer` avec destination fixée).

---

## 8. Endpoints exposés vs internes

| Endpoint                                                | Accès                                                        | Protection               |
| ------------------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| `/api/auth/*` (login, refresh, logout, forgot-password) | Public                                                       | Rate limit               |
| `/api/health`                                           | Public                                                       | —                        |
| `/api/health/readiness`                                 | Public (k8s readiness probe)                                 | —                        |
| `/metrics`                                              | Public-route mais token requis                               | Header `X-Metrics-Token` |
| `/api/docs` (Swagger UI)                                | Public en dev, désactivé en prod sauf `SWAGGER_IN_PROD=true` | —                        |
| Routes `ai/training-data`, `ai/model/retrain`           | Service-to-service                                           | Header `X-Service-Token` |
| Tout le reste                                           | JWT requis                                                   | `protect` middleware     |

---

## 9. Divulgation responsable

Pour signaler une vulnérabilité :

- Email : `security@blancbleu.fr` _(à configurer)_
- PGP key : _(à publier)_
- Délai de réponse cible : 48 h ouvrées.
- Politique : pas de bug bounty, mais hall of fame possible.

Ne PAS ouvrir d'issue publique GitHub pour une vuln non patchée.
