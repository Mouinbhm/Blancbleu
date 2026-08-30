#!/bin/sh
# ══════════════════════════════════════════════════════════════════════════════
# BlancBleu — Entrypoint du conteneur server.
#
# Peuple la base au premier démarrage puis passe la main au processus demandé
# (CMD). Le seed est IDEMPOTENT : scripts/seed-if-empty.js ne fait rien si la
# base contient déjà des utilisateurs — indispensable, car seed.js vide les
# collections avant d'insérer.
#
#   AUTO_SEED=true   (défaut)  seed si la base est vide
#   AUTO_SEED=false            ne jamais seeder (positionné en prod)
#
# Le worker partage cette image : compose lui met AUTO_SEED=false pour que les
# deux conteneurs ne seedent pas en même temps au boot.
# ══════════════════════════════════════════════════════════════════════════════
set -e

if [ "${AUTO_SEED:-true}" = "true" ]; then
  node scripts/seed-if-empty.js || \
    echo "[entrypoint] seed ignoré (erreur non bloquante)"
fi

exec "$@"
