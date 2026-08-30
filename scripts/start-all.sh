#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BlancBleu — Démarrage de TOUTE la stack en une commande.
#
#   ./scripts/start-all.sh all              # TOUT : stack + monitoring + mobile
#   ./scripts/start-all.sh                  # dev  (docker-compose.yml)
#   ./scripts/start-all.sh prod             # prod (+ docker-compose.prod.yml)
#   ./scripts/start-all.sh dev --mobile     # + émulateur Android, APK installé
#   ./scripts/start-all.sh dev --monitoring # + Prometheus / Grafana / node-exporter
#   ./scripts/start-all.sh all --seed       # + jeu de données de démo
#   ./scripts/start-all.sh seed             # seed seul (stack déjà démarrée)
#   ./scripts/start-all.sh create-admin     # crée un compte admin
#   ./scripts/start-all.sh all --no-logs    # démarre puis rend la main
#   ./scripts/start-all.sh down             # arrêt (tout, émulateur compris)
#   ./scripts/start-all.sh logs             # logs suivis
#
# Par défaut le script reste attaché et affiche les logs de TOUS les services,
# préfixés par leur nom. Ctrl-C détache l'affichage : les conteneurs continuent
# de tourner (utiliser `down` pour les arrêter).
#
# Services : mongo, mongo-init, redis, clamav, server, worker, ia, client
#            (+ backup en prod ; + prometheus, grafana, node-exporter en monitoring)
#            (+ émulateur Android avec les APK driver ET patient en mode `all`)
#
# NOTE : le monitoring est chargé DANS LE MÊME projet compose que la stack —
# les deux fichiers déclarent chacun `blancbleu-net`. Lancés séparément, ils
# créeraient deux réseaux distincts et Prometheus ne pourrait pas scraper
# `server`. D'où le -f cumulé plutôt qu'un `compose up` séparé.
#
# Le script crée le .env racine au premier lancement s'il manque : docker
# compose lit CE fichier (pas server/.env ni ai-service/.env) et refuse de
# démarrer sans MONGO_USER / MONGO_PASSWORD / ENCRYPTION_KEY / AI_SERVICE_TOKEN.
# Les secrets déjà présents dans server/.env sont réutilisés pour que Node et
# Python partagent le même AI_SERVICE_TOKEN.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-dev}"
WITH_MOBILE=0
WITH_MONITORING=0
FOLLOW_LOGS=1          # par défaut on reste attaché aux logs de tous les services
WITH_SEED=0
for arg in "$@"; do
  [ "$arg" = "--mobile" ]     && WITH_MOBILE=1
  [ "$arg" = "--monitoring" ] && WITH_MONITORING=1
  [ "$arg" = "--no-logs" ]    && FOLLOW_LOGS=0
  [ "$arg" = "--seed" ]       && WITH_SEED=1
done

# `all` = tout ce que le projet sait démarrer.
if [ "$MODE" = "all" ]; then
  MODE=dev; WITH_MOBILE=1; WITH_MONITORING=1
fi

COMPOSE=(docker compose -f docker-compose.yml)
[ "$MODE" = "prod" ] && COMPOSE+=(-f docker-compose.prod.yml)
# Les services monitoring portent profiles:["monitoring"] : sans --profile,
# compose les ignore silencieusement.
if [ "$WITH_MONITORING" = "1" ]; then
  COMPOSE+=(-f docker-compose.monitoring.yml --profile monitoring)
fi

# ─── Actions courtes ─────────────────────────────────────────────────────────
case "$MODE" in
  down)
    # On cumule TOUS les fichiers pour que `down` supprime aussi les conteneurs
    # monitoring/prod même si `up` avait été lancé sans ces flags.
    docker compose -f docker-compose.yml \
      -f docker-compose.prod.yml \
      -f docker-compose.monitoring.yml --profile monitoring down
    docker rm -f blancbleu-emulator >/dev/null 2>&1 && echo "Émulateur arrêté." || true
    exit 0 ;;
  logs) "${COMPOSE[@]}" logs -f; exit 0 ;;
  ps)   "${COMPOSE[@]}" ps;     exit 0 ;;
  # `compose run` réutilise TOUTE la définition du service server (image, env,
  # réseau, dépendances) : pas de duplication de MONGO_URI/ENCRYPTION_KEY, et le
  # conteneur est supprimé après coup. Les scripts sont déjà dans l'image.
  seed)         exec "${COMPOSE[@]}" run --rm server npm run seed ;;
  create-admin) exec "${COMPOSE[@]}" run --rm server npm run create-admin ;;
  sync-indexes) exec "${COMPOSE[@]}" run --rm server npm run db:sync-indexes ;;
  mobile) exec "$REPO_ROOT/scripts/mobile-emulator.sh" up "${2:-driver}" "${3:-dev}" ;;
  dev|prod) ;;
  *) echo "usage: $0 [all|dev|prod|mobile|seed|create-admin|sync-indexes|down|logs|ps] [--mobile] [--monitoring] [--seed] [--no-logs]" >&2; exit 2 ;;
esac

# ─── .env racine ─────────────────────────────────────────────────────────────
# Source unique de vérité : généré/validé par un seul script, lui-même lu par
# docker compose, server/config/env.js et ai-service/main.py.
"$REPO_ROOT/scripts/setup-env.sh"

# ─── Prérequis monitoring ────────────────────────────────────────────────────
if [ "$WITH_MONITORING" = "1" ]; then
  # monitoring/metrics_token est bind-monté en FICHIER. S'il n'existe pas,
  # Docker crée un RÉPERTOIRE à sa place et Prometheus refuse de démarrer.
  if [ -d monitoring/metrics_token ]; then
    echo "  ! monitoring/metrics_token est un répertoire (créé par un run précédent) — suppression."
    rmdir monitoring/metrics_token 2>/dev/null || rm -rf monitoring/metrics_token
  fi
  if [ ! -f monitoring/metrics_token ]; then
    tok="$(grep -E '^METRICS_TOKEN=.+' .env | head -1 | cut -d= -f2- || true)"
    if [ -z "$tok" ] || [ "$tok" = "CHANGE_ME" ]; then
      tok="$(openssl rand -hex 32)"
      # Le serveur lit METRICS_TOKEN depuis l'env ; Prometheus lit le fichier.
      # Les deux doivent porter la MÊME valeur.
      if grep -qE '^METRICS_TOKEN=' .env; then
        sed -i "s|^METRICS_TOKEN=.*|METRICS_TOKEN=${tok}|" .env
      else
        echo "METRICS_TOKEN=${tok}" >> .env
      fi
      echo "  METRICS_TOKEN généré (.env + monitoring/metrics_token)."
    fi
    mkdir -p monitoring
    printf '%s' "$tok" > monitoring/metrics_token
    chmod 600 monitoring/metrics_token
  fi
fi

# ─── Prérequis prod ──────────────────────────────────────────────────────────
if [ "$MODE" = "prod" ]; then
  mkdir -p backups                       # sinon Docker le crée en root
  chmod +x scripts/backup.sh scripts/restore.sh 2>/dev/null || true
fi

# ─── Build + up ──────────────────────────────────────────────────────────────
echo "→ Build des images (server, worker, ia, client)…"
"${COMPOSE[@]}" build

echo "→ Démarrage de la stack ($MODE)…"
"${COMPOSE[@]}" up -d

echo
"${COMPOSE[@]}" ps

if [ "$WITH_SEED" = "1" ]; then
  echo
  echo "→ Seed du jeu de données de démo…"
  # Le serveur est déjà "healthy" ici, donc mongo + mongo-init le sont aussi.
  "${COMPOSE[@]}" run --rm server npm run seed || \
    echo "  ! seed en échec (voir ci-dessus) — la stack reste utilisable."
fi

if [ "$WITH_MOBILE" = "1" ]; then
  echo
  echo "→ Émulateur Android (build des APK si absents, puis install)…"
  "$REPO_ROOT/scripts/mobile-emulator.sh" up driver dev
  # Les deux apps ont des applicationId distincts : elles cohabitent sur le
  # même émulateur. `install` réutilise le conteneur déjà démarré.
  "$REPO_ROOT/scripts/mobile-emulator.sh" install patient dev || \
    echo "  ! app patient non installée (voir le log ci-dessus) — driver reste utilisable."
fi

# Les ports viennent du .env : setup-env.sh en choisit un LIBRE si celui par
# défaut est déjà pris sur la machine. On les relit donc au lieu de les coder.
port_of() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2-; }
cat <<EOF

  Front    http://localhost:$(port_of CLIENT_PORT)
  API      http://localhost:$(port_of SERVER_PORT)     (health : /api/health)
  IA       http://localhost:$(port_of IA_PORT)     (docs : /docs)
  Mobile   http://localhost:6080     (émulateur : apps driver + patient)
  Grafana  http://localhost:$(port_of GRAFANA_PORT)      (admin/admin par défaut)
  Prom.    http://localhost:$(port_of PROMETHEUS_PORT)

  ClamAV télécharge sa base de signatures au premier boot : `server` peut
  rester "starting" plusieurs minutes, et `client` l'attend. C'est normal.

  Arrêt : ./scripts/start-all.sh down
EOF

# ─── Logs de tous les services ───────────────────────────────────────────────
# `logs -f` multiplexe la sortie de TOUS les conteneurs du projet, chaque ligne
# préfixée par le service. --tail=30 évite de rejouer tout l'historique.
# `exec` : Ctrl-C sort proprement du suivi sans arrêter la stack.
if [ "$FOLLOW_LOGS" = "1" ]; then
  echo "  Logs de tous les services — Ctrl-C détache (les conteneurs continuent)."
  echo
  exec "${COMPOSE[@]}" logs -f --tail=30
fi

