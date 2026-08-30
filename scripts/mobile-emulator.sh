#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BlancBleu — Émulateur Android conteneurisé (utiliser l'app depuis le navigateur)
#
#   ./scripts/mobile-emulator.sh up [driver|patient] [flavor]   démarre + installe
#   ./scripts/mobile-emulator.sh install [driver|patient] [flavor]
#   ./scripts/mobile-emulator.sh logs | shell | down
#
# L'app s'utilise dans le navigateur : http://localhost:6080
#
# ── Réseau ───────────────────────────────────────────────────────────────────
# L'app pointe par défaut sur http://10.0.2.2:5000 — l'alias "machine hôte" de
# l'émulateur Android. Dans un conteneur, 10.0.2.2 désigne le CONTENEUR, pas la
# vraie machine. On lance donc avec --network host : 10.0.2.2 retombe alors sur
# l'hôte réel et le backend Node local reste joignable sans rebuild.
# Alternative (réseau bridge) : rebuild l'APK avec
#   --dart-define=API_URL=http://172.17.0.1:5000
#
# ── Deux modes selon l'OS ────────────────────────────────────────────────────
# CONTENEUR (Linux uniquement) : émulateur dans Docker, vu dans le navigateur.
#   Exige /dev/kvm, --privileged, et --network host — or `--network host` n'est
#   supporté que par le moteur Docker Linux ; Docker Desktop (Windows/macOS)
#   l'ignore en silence et l'app ne joindrait jamais l'API.
#
# NATIF (Windows / macOS, ou Linux sans KVM) : on installe l'APK sur un
#   émulateur/appareil déjà lancé sur la machine (Android Studio, `flutter
#   emulators --launch`, ou un téléphone en USB) via `adb` de l'hôte. Là,
#   10.0.2.2 pointe bien sur la machine : la config par défaut de l'app marche.
#
# ── Prérequis ────────────────────────────────────────────────────────────────
# Mode conteneur : /dev/kvm. Mode natif : `adb` dans le PATH + un appareil
# visible dans `adb devices`.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/platform.sh
. "$REPO_ROOT/scripts/lib/platform.sh"

CONTAINER=blancbleu-emulator
IMAGE=budtmo/docker-android:emulator_11.0

MODE_NATIF=0
ACTION="${1:-up}"
APP="${2:-driver}"
FLAVOR="${3:-dev}"

case "$APP" in
  driver)  APP_DIR="blancbleu_driver";  PKG="com.blancbleu.blancbleu_driver" ;;
  patient) APP_DIR="blancbleu_patient"; PKG="fr.blancbleu.blancbleu_patient" ;;
  *) echo "app inconnue : '$APP' (attendu : driver | patient)" >&2; exit 2 ;;
esac
[ "$FLAVOR" != "prod" ] && PKG="${PKG}.${FLAVOR}"

find_apk() {
  find "$REPO_ROOT/$APP_DIR/build/app/outputs/flutter-apk" \
       -name "app-${FLAVOR}-*.apk" 2>/dev/null | head -1
}

adb_in() { docker exec "$CONTAINER" adb "$@"; }

wait_for_boot() {
  echo "Attente du boot de l'émulateur (peut prendre 1–3 min)…"
  for _ in $(seq 1 90); do
    if docker exec "$CONTAINER" adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -q 1; then
      echo "Émulateur prêt."
      return 0
    fi
    sleep 5
  done
  echo "ERREUR : l'émulateur n'a pas fini de démarrer." >&2
  echo "Logs : ./scripts/mobile-emulator.sh logs" >&2
  return 1
}

install_apk() {
  local apk; apk="$(find_apk)"
  if [ -z "$apk" ]; then
    echo "Aucun APK '$FLAVOR' pour $APP_DIR — build (peut prendre ~10 min au 1er run)…"
    "$REPO_ROOT/scripts/mobile-build.sh" "$APP" "$FLAVOR" debug
    apk="$(find_apk)"
  fi
  if [ -z "$apk" ]; then
    echo "ERREUR : le build n'a produit aucun APK '$FLAVOR' pour $APP_DIR." >&2
    return 2
  fi
  echo "Installation : $(basename "$apk")"

  if [ "$MODE_NATIF" = "1" ]; then
    adb install -r -t "$apk"
    echo "Lancement de $PKG…"
    adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
    echo
    echo "  ▶  App lancée sur l'émulateur/appareil connecté."
    return 0
  fi

  bb_docker cp "$apk" "$CONTAINER:/tmp/app.apk"
  adb_in install -r -t /tmp/app.apk
  echo "Lancement de $PKG…"
  adb_in shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
  echo
  echo "  ▶  App disponible sur  http://localhost:6080"
}

# Mode natif : l'émulateur tourne sur la machine, pas dans Docker.
require_native_device() {
  if ! command -v adb >/dev/null 2>&1; then
    echo "ERREUR : \`adb\` introuvable dans le PATH." >&2
    echo "  Installe les Android platform-tools, ou ajoute au PATH :" >&2
    echo "    Windows : %LOCALAPPDATA%\\Android\\Sdk\\platform-tools" >&2
    echo "    macOS   : ~/Library/Android/sdk/platform-tools" >&2
    return 1
  fi
  if ! adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
    echo "ERREUR : aucun émulateur/appareil détecté (\`adb devices\` vide)." >&2
    echo "  Démarre un émulateur Android Studio, ou :  flutter emulators --launch <id>" >&2
    return 1
  fi
  return 0
}

case "$ACTION" in
  up)
    # Mode conteneur seulement si Linux ET KVM : ailleurs, --network host est
    # ignoré et /dev/kvm n'existe pas.
    if bb_supports_host_network && [ -e /dev/kvm ]; then
      MODE_NATIF=0
    else
      MODE_NATIF=1
      echo "OS $(bb_os) — émulateur conteneurisé indisponible, passage en mode NATIF."
      echo "  (l'APK sera installé sur l'émulateur/appareil déjà lancé sur la machine)"
      require_native_device || exit 1
      install_apk
      exit $?
    fi
    # Images requises — on les prepare pour que la commande soit autonome.
    if ! docker image inspect blancbleu-mobile >/dev/null 2>&1; then
      echo "Image de build absente — construction…"
      docker build -f "$REPO_ROOT/Dockerfile.mobile" -t blancbleu-mobile "$REPO_ROOT"
    fi
    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
      echo "Image émulateur absente — pull (~12 Go, plusieurs minutes)…"
      docker pull "$IMAGE"
    fi
    if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      echo "Conteneur '$CONTAINER' déjà présent — suppression."
      docker rm -f "$CONTAINER" >/dev/null
    fi
    echo "Démarrage de l'émulateur…"
    docker run -d --name "$CONTAINER" \
      --privileged \
      --device /dev/kvm \
      --network host \
      -e EMULATOR_DEVICE="Samsung Galaxy S10" \
      -e WEB_VNC=true \
      -e APPIUM=false \
      "$IMAGE" >/dev/null
    wait_for_boot
    install_apk
    ;;
  install)
    if bb_supports_host_network && [ -e /dev/kvm ] && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      MODE_NATIF=0
    else
      MODE_NATIF=1
      require_native_device || exit 1
    fi
    install_apk ;;
  logs)    docker logs -f "$CONTAINER" ;;
  shell)   docker exec -it "$CONTAINER" bash ;;
  down)    docker rm -f "$CONTAINER" >/dev/null && echo "Émulateur arrêté." ;;
  *) echo "action inconnue : '$ACTION' (up | install | logs | shell | down)" >&2; exit 2 ;;
esac
