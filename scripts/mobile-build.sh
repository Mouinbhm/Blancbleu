#!/usr/bin/env bash
# Wrapper hôte : build d'une app Flutter dans le conteneur, avec les caches
# Gradle/pub persistés dans des volumes nommés (sinon ~10 min de retéléchargement
# à chaque run). Cf. Dockerfile.mobile.
#
#   ./scripts/mobile-build.sh <app> [flavor] [mode] [-- <args flutter>]
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/platform.sh
. "$REPO_ROOT/scripts/lib/platform.sh"

# Sous Git Bash : chemin hôte en forme Windows (C:/…) et conversion MSYS
# désactivée, sinon "-v /repo" devient "C:/Program Files/Git/repo".
docker_run() { bb_docker "$@"; }

docker_run run --rm \
  -v "$(bb_hostpath "$REPO_ROOT"):/repo" \
  -v blancbleu-gradle:/opt/gradle-cache \
  -v blancbleu-pub:/opt/pub-cache \
  blancbleu-mobile "$@"
