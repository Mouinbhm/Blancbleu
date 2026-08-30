#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BlancBleu — Génère et valide le .env RACINE (source unique de vérité).
#
#   ./scripts/setup-env.sh            # crée s'il manque, complète, valide
#   ./scripts/setup-env.sh --check    # valide seulement (ne modifie rien)
#
# Ce fichier est lu par :
#   - docker compose               (docker-compose*.yml)
#   - le backend Node              (server/config/env.js)
#   - le microservice Python       (ai-service/main.py)
#
# server/.env et ai-service/.env restent possibles pour des surcharges locales
# et gagnent sur la racine, mais ne sont plus obligatoires : plus rien n'est à
# recopier d'un fichier à l'autre.
#
# Idempotent : relancer ne régénère JAMAIS un secret déjà posé.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/platform.sh
. "$REPO_ROOT/scripts/lib/platform.sh"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

# Variables sans lesquelles docker compose refuse de démarrer (déclarées ':?').
REQUIRED=(MONGO_USER MONGO_PASSWORD ENCRYPTION_KEY AI_SERVICE_TOKEN)

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Valeur réelle d'une clé (vide si absente, vide ou placeholder).
real_value() {
  local key="$1" file="${2:-.env}"
  [ -f "$file" ] || return 0
  local line; line="$(grep -E "^${key}=" "$file" | head -1 || true)"
  local val="${line#*=}"
  case "$val" in ""|CHANGE_ME*|"<"*) return 0 ;; esac
  printf '%s' "$val"
}

# Pose une clé (remplace la ligne existante). On supprime puis on réécrit :
# robuste aux valeurs contenant / + = (base64) qui casseraient un sed.
set_env() {
  local key="$1" val="$2"
  if [ -f .env ]; then
    grep -v "^${key}=" .env > .env.tmp 2>/dev/null || true
    mv .env.tmp .env
  fi
  printf '%s=%s\n' "$key" "$val" >> .env
}

# Pose une valeur seulement si la clé n'en a pas déjà une (idempotence).
default_env() {
  local key="$1" val="$2"
  [ -n "$(real_value "$key")" ] || { set_env "$key" "$val"; echo "  + $key généré"; }
}

# ─── Validation ──────────────────────────────────────────────────────────────
validate() {
  local rc=0 missing=()
  for k in "${REQUIRED[@]}"; do
    [ -n "$(real_value "$k")" ] || missing+=("$k")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "ERREUR : variables requises absentes/vides : ${missing[*]}" >&2
    rc=1
  fi
  if grep -qE '^[A-Z_]+=(CHANGE_ME|<)' .env 2>/dev/null; then
    echo "ERREUR : placeholders non remplacés :" >&2
    grep -nE '^[A-Z_]+=(CHANGE_ME|<)' .env | sed 's/^/  /' >&2
    rc=1
  fi

  # Le token service-to-service doit être identique partout, sinon les appels
  # Node → Python repartent en 401 (cf. ai-service/utils/auth.py).
  local root_tok; root_tok="$(real_value AI_SERVICE_TOKEN)"
  for f in server/.env ai-service/.env; do
    local other; other="$(real_value AI_SERVICE_TOKEN "$f")"
    if [ -n "$other" ] && [ "$other" != "$root_tok" ]; then
      echo "ATTENTION : AI_SERVICE_TOKEN de $f diffère de la racine." >&2
      echo "            $f gagne en local (surcharge) mais PAS dans Docker →" >&2
      echo "            les deux environnements ne se comporteront pas pareil." >&2
    fi
  done
  return $rc
}

if [ "$CHECK_ONLY" = "1" ]; then
  [ -f .env ] || { echo "ERREUR : .env racine absent. Lance ./scripts/setup-env.sh" >&2; exit 1; }
  validate && echo "✓ .env valide"
  exit $?
fi

# ─── Création / complétion ───────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "→ .env racine absent — création depuis .env.example"
  [ -f .env.example ] && cp .env.example .env || : > .env

  # Reprendre ce qui existe déjà en local pour ne pas invalider une install
  # en cours (surtout AI_SERVICE_TOKEN et ENCRYPTION_KEY : changer cette
  # dernière rend ILLISIBLES les champs médicaux déjà chiffrés en base).
  for src in server/.env ai-service/.env; do
    [ -f "$src" ] || continue
    n=0
    for k in $(grep -oE '^[A-Z_]+=' "$src" | tr -d '='); do
      v="$(real_value "$k" "$src")"
      if [ -n "$v" ] && [ -z "$(real_value "$k")" ]; then set_env "$k" "$v"; n=$((n+1)); fi
    done
    [ "$n" -gt 0 ] && echo "  $n variables reprises de $src"
  done
else
  echo "→ .env racine présent — complétion des valeurs manquantes"
fi

# Formats imposés par le code :
#   ENCRYPTION_KEY = 32 octets base64 (AES-256-GCM, cf. utils/crypto)
#   JWT_SECRET     = 64 caractères hex
default_env MONGO_USER       "blancbleu"
default_env MONGO_PASSWORD   "$(openssl rand -hex 24)"
default_env JWT_SECRET       "$(openssl rand -hex 32)"
default_env ENCRYPTION_KEY   "$(openssl rand -base64 32)"
default_env AI_SERVICE_TOKEN "$(openssl rand -hex 32)"
default_env ADMIN_PASSWORD   "$(openssl rand -base64 18)"
default_env METRICS_TOKEN    "$(openssl rand -hex 32)"

# Ces deux-là ne servent qu'au dev local hors Docker : dans les conteneurs,
# compose reconstruit les URI vers les services `mongo` / `redis`.
default_env MONGO_URI "mongodb://127.0.0.1:27017/blancbleu"
default_env REDIS_URL "redis://127.0.0.1:6379"

# ─── Ports publiés sur l'hôte ────────────────────────────────────────────────
# Beaucoup de postes font déjà tourner redis-server, mongod ou apache2 : le
# bind échoue alors avec "address already in use" et toute la stack s'arrête.
# On choisit donc un port LIBRE par service. Ça ne change RIEN aux échanges
# entre conteneurs : ceux-ci passent par blancbleu-net (mongo:27017,
# redis:6379…), jamais par les ports hôte.
# bb_port_busy (scripts/lib/platform.sh) : ss sous Linux, netstat sous
# Windows/macOS. `ss` seul répondait « libre » sur les postes sans iproute2,
# et on retombait sur un port déjà pris.
port_busy() { bb_port_busy "$1"; }

# Premier port libre à partir de $2 ; ne touche pas une valeur déjà fixée.
pick_port() {
  local key="$1" want="$2" p="$2" tries=0
  if [ -n "$(real_value "$key")" ]; then return 0; fi
  while port_busy "$p" && [ "$tries" -lt 40 ]; do
    p=$((p+1)); tries=$((tries+1))
  done
  set_env "$key" "$p"
  if [ "$p" != "$want" ]; then
    echo "  ! port $want occupé → $key=$p"
  fi
}

pick_port MONGO_PORT         27017
pick_port REDIS_PORT          6379
pick_port SERVER_PORT         5000
pick_port IA_PORT             5002
pick_port CLIENT_PORT           80
pick_port PROMETHEUS_PORT     9090
pick_port GRAFANA_PORT        3001
pick_port NODE_EXPORTER_PORT  9100

# CORS : le front doit être déclaré sur le port réellement publié, sinon le
# navigateur bloque les appels à l'API.
_client_port="$(real_value CLIENT_PORT)"
_client_url="http://localhost${_client_port:+:$_client_port}"
[ "$_client_port" = "80" ] && _client_url="http://localhost"
set_env CLIENT_URL      "$_client_url"
set_env ALLOWED_ORIGINS "$_client_url"

chmod 600 .env

validate
echo "✓ .env racine prêt (source unique — server/ et ai-service/ le lisent aussi)"
