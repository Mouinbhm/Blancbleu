#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BlancBleu — Entrypoint de l'image de build mobile (cf. Dockerfile.mobile).
#
#   build-mobile <app> [flavor] [mode] [-- <args flutter supplémentaires>]
#
#     app     driver | patient
#     flavor  dev | staging | prod          (défaut : dev)
#     mode    debug | release | appbundle   (défaut : debug)
#
# Exemples :
#   build-mobile driver dev debug
#   build-mobile patient prod release -- --dart-define=SENTRY_DSN=https://...
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP="${1:-driver}"
FLAVOR="${2:-dev}"
MODE="${3:-debug}"
shift $(( $# < 3 ? $# : 3 )) || true
[ "${1:-}" = "--" ] && shift || true
EXTRA=("$@")

case "$APP" in
  driver)  APP_DIR="blancbleu_driver"  ;;
  patient) APP_DIR="blancbleu_patient" ;;
  *) echo "app inconnue : '$APP' (attendu : driver | patient)" >&2; exit 2 ;;
esac

case "$FLAVOR" in dev|staging|prod) ;; *)
  echo "flavor inconnu : '$FLAVOR' (attendu : dev | staging | prod)" >&2; exit 2 ;;
esac

# `flutter build apk --debug` et `--release` produisent un APK ; `appbundle`
# produit un AAB (Play Store), toujours en release.
case "$MODE" in
  debug)     BUILD_ARGS=(apk --debug)     ;;
  release)   BUILD_ARGS=(apk --release)   ;;
  appbundle) BUILD_ARGS=(appbundle --release) ;;
  *) echo "mode inconnu : '$MODE' (attendu : debug | release | appbundle)" >&2; exit 2 ;;
esac

if [ ! -d "/repo/$APP_DIR" ]; then
  echo "ERREUR : /repo/$APP_DIR introuvable." >&2
  echo "Monter la racine du repo :  docker run --rm -v \"\$PWD:/repo\" ..." >&2
  exit 2
fi

echo "──────────────────────────────────────────────────────────────────────"
echo " app=$APP_DIR  flavor=$FLAVOR  mode=$MODE"
echo " flutter : $(flutter --version | head -1)"
echo " java    : $(java -version 2>&1 | head -1)"
echo "──────────────────────────────────────────────────────────────────────"

# bb_core est un package path: partagé — récupérer ses deps d'abord, sinon le
# pub get de l'app échoue sur la dépendance locale.
#
# Ses modèles sont generes (json_serializable / freezed) et les *.g.dart sont
# gitignores (cf. packages/bb_core/.gitignore) : sans build_runner, la
# compilation Dart casse sur "Method not found: '_$XFromJson'". La codegen doit
# donc tourner AVANT le build de l'app.
if [ -d /repo/packages/bb_core ]; then
  (
    cd /repo/packages/bb_core
    flutter pub get
    echo "── codegen bb_core (build_runner) ──"
    dart run build_runner build --delete-conflicting-outputs
  )
fi

cd "/repo/$APP_DIR"
flutter pub get
flutter build "${BUILD_ARGS[@]}" \
  --flavor "$FLAVOR" \
  --dart-define=FLAVOR="$FLAVOR" \
  ${EXTRA[@]+"${EXTRA[@]}"}

echo
echo "Artefacts produits :"
find build/app/outputs -name "*.apk" -o -name "*.aab" 2>/dev/null | sed 's/^/  /' || true
