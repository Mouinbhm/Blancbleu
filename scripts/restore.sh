#!/usr/bin/env bash
#
# Restauration MongoDB depuis une archive produite par backup.sh.
#
# ⚠️  DESTRUCTIF : --drop supprime les collections existantes avant restore.
#
# Usage (depuis l'hôte, via le conteneur backup) :
#
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
#     exec backup bash /restore.sh blancbleu_20260531_020000.archive
#
# Ou en local :
#   MONGO_URI="mongodb://user:pass@host:27017/blancbleu?authSource=admin" \
#     BACKUP_DIR=./backups bash scripts/restore.sh blancbleu_20260531_020000.archive
#
# RTO cible = 2h (cf. docs/operations.md §6). Tester mensuellement sur une
# base jetable.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
ARCHIVE_NAME="${1:-}"

if [ -z "$ARCHIVE_NAME" ]; then
  echo "Usage : restore.sh <nom_archive>"
  echo "Archives disponibles :"
  ls -1t "${BACKUP_DIR}"/blancbleu_*.archive 2>/dev/null || echo "  (aucune)"
  exit 1
fi

ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "ERREUR : archive introuvable : ${ARCHIVE_PATH}"
  exit 1
fi

if [ -z "${MONGO_URI:-}" ]; then
  echo "ERREUR : MONGO_URI non défini — abandon"
  exit 1
fi

echo "⚠️  Restauration DESTRUCTIVE depuis ${ARCHIVE_PATH} (--drop)."
echo "    Cible : ${MONGO_URI%%\?*}"
# Garde-fou : exiger CONFIRM=yes pour éviter un drop accidentel.
if [ "${CONFIRM:-}" != "yes" ]; then
  echo "    Relancer avec CONFIRM=yes pour exécuter réellement."
  exit 2
fi

echo "Restauration en cours..."
mongorestore --uri="$MONGO_URI" --archive="$ARCHIVE_PATH" --gzip --drop
echo "Restauration terminée."
