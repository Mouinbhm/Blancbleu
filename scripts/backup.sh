#!/usr/bin/env bash
#
# Sauvegarde MongoDB — dump gzip horodaté + rétention 30 jours.
#
# Exécuté en boucle quotidienne par le service `backup` de
# docker-compose.prod.yml (image mongo:7, qui fournit mongodump).
# Peut aussi être lancé à la main :
#
#   MONGO_URI="mongodb://user:pass@host:27017/blancbleu?authSource=admin" \
#     BACKUP_DIR=./backups bash scripts/backup.sh
#
# RPO = 24h (un dump par jour). Voir docs/operations.md §6.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="${BACKUP_DIR}/backup.log"

mkdir -p "$BACKUP_DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') | $*" | tee -a "$LOG_FILE"
}

if [ -z "${MONGO_URI:-}" ]; then
  log "ERREUR : MONGO_URI non défini — abandon"
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="${BACKUP_DIR}/blancbleu_${TS}.archive"

log "Début du dump → ${ARCHIVE}"
if mongodump --uri="$MONGO_URI" --archive="$ARCHIVE" --gzip; then
  SIZE="$(du -h "$ARCHIVE" | cut -f1)"
  log "Dump OK (${SIZE})"
else
  log "ERREUR : mongodump a échoué — suppression de l'archive partielle"
  rm -f "$ARCHIVE"
  exit 1
fi

# Rétention : supprime les archives de plus de RETENTION_DAYS jours.
DELETED="$(find "$BACKUP_DIR" -name 'blancbleu_*.archive' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
log "Rétention ${RETENTION_DAYS}j : ${DELETED} archive(s) supprimée(s)"

log "Sauvegarde terminée"
