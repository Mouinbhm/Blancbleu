# Sécurité mobile — BlancBleu

Sprint M5. Récapitulatif des mesures de sécurité, d'observabilité et DevOps des
2 apps Flutter (`blancbleu_driver`, `blancbleu_patient`) et du package partagé
`bb_core`. Voir `docs/mobile-build.md` pour les commandes de build associées.

---

## 1. SSL public-key pinning (SPKI)

**Fichier** : `packages/bb_core/lib/src/network/ssl_pinning.dart`

Validation par **empreinte de clé publique** (SPKI SHA-256), pas par certificat
entier — résiste au renouvellement du certificat tant que la paire de clés est
conservée.

- `SslPinning.buildPinnedAdapter(spkiSha256PinsBase64, baseUrl)` retourne un
  `IOHttpClientAdapter` qui vérifie le SPKI de chaque cert présenté.
- **Retourne `null`** (→ adapter par défaut, pinning désactivé) si :
  - la liste de pins est vide, **ou**
  - `baseUrl` n'est pas `https://` (dev en HTTP/LAN).
- **Aucun `badCertificateCallback => true`** : un mismatch fait échouer la
  connexion. Pas de bypass.

> **Dev** : pinning désactivé (pas de cert public stable sur le serveur local).
> **Staging/prod** : pins fournis via `--dart-define=SSL_PINS=...`. Toujours
> ≥2 pins (cert actuel + rotation suivante). Extraction : cf. mobile-build.md §2.

---

## 2. Secure storage (Android Keystore / iOS Keychain)

**Fichier** : `blancbleu_patient/lib/services/api_service.dart` (+ driver déjà
sur secure storage depuis M1).

Les données santé du profil patient (mobilité, médecin, mutuelle, contact
d'urgence, n° sécu) étaient stockées en clair dans `SharedPreferences`. Elles
sont désormais dans `FlutterSecureStorage` (chiffré par l'OS).

**Migration douce** : au read, on lit d'abord le secure store ; si absent, on
lit le legacy `SharedPreferences`, on le recopie chiffré, puis on supprime le
legacy. `clearSession` purge les deux. Aucune perte de session pour les users
déjà installés.

---

## 3. Logger no-op en release

**Fichier** : `packages/bb_core/lib/src/utils/logger.dart`

`BbLog.d/i/w/e`. En `kReleaseMode` :

- `d` (debug) et `i` (info) sont **strictement no-op** — rien dans logcat
  (`debugPrint` Flutter n'est PAS no-op, juste throttlé : insuffisant).
- `w` (warning) et `e` (error) restent (diagnostic store/MDM).

**Scrub automatique** : toute `Map` loggée voit ses clés sensibles remplacées
par `***` (récursif) : token, refreshToken, accessToken, fcmToken, password,
authorization, secret, apiKey, bearer, session, jwt.

Les handlers FCM (background + tap) ne loggent plus le `data` brut — seulement
`messageId` / `type`.

---

## 4. Observabilité — Sentry (opt-in, PII scrubbing)

**Fichiers** : `packages/bb_core/lib/src/observability/sentry_init.dart` +
`sentry_dio_interceptor.dart`

**Opt-in** : sans `--dart-define=SENTRY_DSN=...`, `runApp` est lancé sans
Sentry (dégradation gracieuse). Wrapping via `SentryInit.runWithSentry(...)`
dans les 2 `main.dart`.

**PII scrubbing obligatoire** (RGPD + données santé) :

| Vecteur           | Traitement                                                      |
| ----------------- | --------------------------------------------------------------- |
| `event.user`      | email / username / ip / name → `null`                           |
| `request.headers` | Authorization / Cookie / X-Api-Key / X-Auth-Token → `***`       |
| `request.cookies` | → `***`                                                         |
| `request.data`    | → `null` (jamais de body : peut contenir email/password/profil) |
| `event.extra`     | scrub récursif des clés sensibles (cf. liste ci-dessous)        |
| breadcrumbs       | `data` scrubbé récursivement                                    |

Clés scrubbées (au-delà des credentials) : email, phone, telephone, numerosecu,
nir, mobilite, medecin, mutuelle.

Options : `sendDefaultPii=false`, `attachScreenshot=false`,
`attachViewHierarchy=false`, `tracesSampleRate=0.2`.

**Breadcrumb réseau** (`SentryDioInterceptor`) : `{method, path, status_code}`
**uniquement** — jamais de body, jamais de headers. Niveau info (2xx) /
warning (4xx) / error (5xx).

---

## 5. Flavors & signing

- **Flavors** `dev` / `staging` / `prod` (Android) : installables en parallèle
  via `applicationIdSuffix`. Cf. mobile-build.md §1.
- **Signing release** : `key.properties` (gitignored) lu par `build.gradle` ;
  fallback debug key si absent. Aucun secret committé — template
  `key.properties.example`. `.gitignore` exclut `key.properties`, `*.keystore`,
  `*.jks`. Cf. mobile-build.md §4.
- **Obfuscation** : `--obfuscate --split-debug-info` en release ; symbols
  uploadés à Sentry pour symbolicate. Cf. mobile-build.md §3.

---

## 6. CI

`.github/workflows/mobile.yml` : analyze + test (bb_core) + build APK debug
(driver + patient, flavor dev) sur chaque PR/push mobile. Pas de signing en CI
(debug key) tant que les secrets keystore ne sont pas en GitHub Secrets.

---

## 7. Gestion des secrets (récap)

| Secret          | Où                                           | Committé ?                                       |
| --------------- | -------------------------------------------- | ------------------------------------------------ |
| Keystore (.jks) | hors-repo / `android/keystores/` gitignored  | ❌ jamais                                        |
| key.properties  | `android/key.properties` gitignored          | ❌ jamais                                        |
| SENTRY_DSN      | `--dart-define` au build / CI secret         | ❌ jamais                                        |
| SSL pins        | `--dart-define=SSL_PINS`                     | ⚠️ public-key hash, non sensible mais via define |
| Firebase config | `google-services.json` (par flavor possible) | ❌ gitignored                                    |

---

## 8. Hardening runtime (root/jailbreak) — statut

Détection root/jailbreak : **optionnelle**, non activée par défaut (voir §8 du
sprint M5). À évaluer selon le modèle de menace — pour une app de dispatching
ambulancier, le pinning + secure storage + obfuscation couvrent l'essentiel.
Si ajoutée, elle devra rester **non bloquante** (warning + télémétrie Sentry,
pas un hard-exit qui dégraderait l'accès en intervention d'urgence).
