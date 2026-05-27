# Mobile build & release — BlancBleu

Sprint M5. Procédure de build pour les 2 apps Flutter (`blancbleu_driver`,
`blancbleu_patient`), avec flavors `dev` / `staging` / `prod`, signing release,
obfuscation, et upload des symbols à Sentry.

---

## 1. Flavors

Trois environnements, installables en parallèle sur un même device grâce à
`applicationIdSuffix` :

| flavor    | driver applicationId                     | patient applicationId                    |
| --------- | ---------------------------------------- | ---------------------------------------- |
| `dev`     | `com.blancbleu.blancbleu_driver.dev`     | `fr.blancbleu.blancbleu_patient.dev`     |
| `staging` | `com.blancbleu.blancbleu_driver.staging` | `fr.blancbleu.blancbleu_patient.staging` |
| `prod`    | `com.blancbleu.blancbleu_driver`         | `fr.blancbleu.blancbleu_patient`         |

Le `versionName` reçoit aussi un suffixe (`-dev`, `-staging`) sauf en prod.

### Run / debug par flavor

```bash
# driver dev (default si rien d'autre n'est fourni cote dart)
flutter run --flavor dev --dart-define=FLAVOR=dev

# patient staging contre l'API de staging
flutter run --flavor staging \
  --dart-define=FLAVOR=staging \
  --dart-define=API_BASE=https://staging-api.blancbleu.fr
```

> **Important** : le flag Gradle `--flavor` et la variable Dart `FLAVOR`
> sont **deux choses différentes**. Le premier choisit le bloc gradle
> (applicationId, versionNameSuffix). La seconde est lue par
> `SentryInit.runWithSentry(flavor: ...)` pour tagger les events. Garder
> les deux alignés.

---

## 2. SSL pinning : config par flavor

Le pinning SPKI est défini dans `packages/bb_core/lib/src/network/ssl_pinning.dart`.

- **`dev`** : pins vides ou serveur en HTTP → pinning **désactivé** (le
  serveur local n'a pas de cert public stable). Aucun risque, c'est le
  comportement voulu (`buildPinnedAdapter` retourne `null`).
- **`staging` / `prod`** : pins fournis via `--dart-define=SSL_PINS=<base64,base64>`
  et appliqués si l'URL est `https://`.

Extraction du SPKI SHA-256 base64 d'un certificat public :

```bash
openssl x509 -in cert.pem -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl base64
```

Toujours configurer **au moins 2 pins** : le certificat actuel + celui de la
prochaine rotation (sinon le renouvellement du cert casse l'app en prod).

---

## 3. Sentry : DSN + symbols

### DSN injection

```bash
flutter build apk \
  --flavor prod \
  --release \
  --dart-define=FLAVOR=prod \
  --dart-define=SENTRY_DSN=https://xxx@sentry.io/yyy
```

Sans `SENTRY_DSN`, l'app boot sans Sentry (dégradation gracieuse — cf.
`packages/bb_core/lib/src/observability/sentry_init.dart`).

### Obfuscation + symbols

Indispensable en release pour rendre les stack traces du release illisibles
sans les symbols, **et** pour que Sentry puisse les symbolicate :

```bash
flutter build apk \
  --flavor prod \
  --release \
  --obfuscate \
  --split-debug-info=build/symbols/prod \
  --dart-define=FLAVOR=prod \
  --dart-define=SENTRY_DSN=...
```

Puis upload des symbols à Sentry (CLI `sentry-cli` à installer) :

```bash
sentry-cli debug-files upload \
  --org blancbleu \
  --project blancbleu-driver \
  build/symbols/prod
```

---

## 4. Release signing (Android)

### Génération de la keystore (à faire UNE fois par app)

```bash
keytool -genkey -v \
  -keystore blancbleu_driver.jks \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias blancbleu_driver
```

⚠️ **Stocker la keystore dans un coffre-fort** (1Password, vault, gestion
secrets entreprise). La perdre = impossibilité de publier une MAJ sur le
Play Store. Une keystore différente par app (`driver` et `patient` sont 2
apps distinctes côté Google Play).

### Câblage local

```bash
# 1. Copier la keystore quelque part hors-repo (ou repo/android/keystores/, gitignored)
mkdir -p blancbleu_driver/android/keystores
cp ~/.keystores/blancbleu_driver.jks blancbleu_driver/android/keystores/

# 2. Copier le template
cp blancbleu_driver/android/key.properties.example \
   blancbleu_driver/android/key.properties

# 3. Editer key.properties avec les vraies valeurs (mots de passe, alias, chemin)
#    -> gitignored, ne sera jamais committe
```

### Build release signé

```bash
flutter build appbundle \
  --flavor prod \
  --release \
  --obfuscate \
  --split-debug-info=build/symbols/prod \
  --dart-define=FLAVOR=prod \
  --dart-define=SENTRY_DSN=...
```

→ `build/app/outputs/bundle/prodRelease/app-prod-release.aab` (à uploader sur
le Play Console). Si `key.properties` est absent, le build fallback sur la
debug key (utile pour `flutter run --release` local de validation).

---

## 5. iOS (pas couvert ce sprint)

Les flavors iOS (schemes Xcode + `Runner.xcconfig` par flavor) seront ajoutés
quand on aura un environnement Mac/Xcode. La couche Dart (`--dart-define`)
fonctionne déjà indépendamment ; seul le wrapping natif manque.

---

## 6. Matrice de build (récap)

| Flavor    | API_BASE                           | SENTRY_DSN | SSL_PINS | Signing |
| --------- | ---------------------------------- | ---------- | -------- | ------- |
| `dev`     | `http://localhost:5000` ou LAN     | optionnel  | vide     | debug   |
| `staging` | `https://staging-api.blancbleu.fr` | requis     | requis   | release |
| `prod`    | `https://api.blancbleu.fr`         | requis     | requis   | release |

---

## 7. CI

`.github/workflows/mobile.yml` lance analyze + test + build debug sur chaque
PR/push (cf. `docs/mobile-security.md` pour la stratégie complète). Le signing
release reste **local-only** tant que les secrets keystore ne sont pas
configurés en GitHub Secrets.
