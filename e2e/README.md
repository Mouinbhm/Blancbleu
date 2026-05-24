# Tests E2E Playwright — BlancBleu

3 specs critiques :

- `auth.spec.js` — login OK / login KO / redirection privée
- `transport-lifecycle.spec.js` — création via wizard, navigation détail
- `dispatch-ai.spec.js` — génération recommandation IA + affichage score

## Prérequis (à faire UNE FOIS)

```bash
# Depuis la racine du repo
npm install                       # installe @playwright/test
npx playwright install chromium   # télécharge le binaire Chromium (~150 MB)
```

## Lancer la stack avant les tests

### Option A — Docker Compose (recommandé)

```bash
docker compose up -d
# Attendre que tout soit healthy (~40s)
docker compose ps
```

### Option B — Manuel (dev iteration)

Dans 4 terminaux séparés :

```bash
# 1. Mongo (avec replica set rs0 pour les transactions Sprint 2)
docker run -d --name mongo -p 27017:27017 mongo:7.0 --replSet rs0 --bind_ip_all
docker exec mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'

# 2. (Optionnel) Redis pour Sprint 2
docker run -d --name redis -p 6379:6379 redis:7-alpine

# 3. Backend Node
cd server && npm run dev

# 4. AI Python
cd ai-service && uvicorn main:app --port 5002

# 5. Frontend React
cd client && npm start
```

## Seeder les données de démo

L'app doit avoir au moins :
- 1 compte dispatcher (email `dispatcher@blancbleu.fr`, mot de passe
  `dispatcher1234` — surchargeable via `E2E_DISPATCHER_EMAIL` /
  `E2E_DISPATCHER_PASSWORD`)
- Au moins 1 transport SCHEDULED pour le test dispatch

Le script seed du repo crée tout :

```bash
cd server && npm run seed
```

## Lancer les tests

```bash
# Depuis la racine
npm run e2e

# Spec spécifique
npm run e2e -- e2e/auth.spec.js

# Mode UI interactive
npx playwright test --ui --config=e2e/playwright.config.js

# Mode headed (voir le navigateur)
npx playwright test --headed --config=e2e/playwright.config.js
```

## Variables d'environnement

- `E2E_BASE_URL` (def: `http://localhost:3000`) — URL du frontend
- `E2E_DISPATCHER_EMAIL` / `E2E_DISPATCHER_PASSWORD`
- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`

## Comportements connus

- Les specs **skippent** si le compte test a 2FA activé (le test n'inclut
  pas la saisie d'un code TOTP). Désactiver le 2FA sur le compte test ou
  ajouter un wrapper qui lit `process.env.E2E_TOTP_SECRET` pour générer
  le code (sprint futur).
- Le test wizard crée un transport réel — si la base est partagée, le
  data restera. Utiliser une base de test pour les runs CI.
- En CI, le job E2E est marqué `continue-on-error: true` (voir Sprint 5
  step 8) tant que la stack n'est pas stable en environnement de pipeline.
