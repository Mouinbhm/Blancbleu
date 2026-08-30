#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BlancBleu — Compatibilité multi-OS pour les scripts.
#
# À sourcer :  . "$(dirname "${BASH_SOURCE[0]}")/lib/platform.sh"
#
# Les scripts tournent sous Linux, macOS, et sous Windows via Git Bash ou WSL2.
# Ce fichier isole les trois points qui diffèrent réellement :
#   1. détection de l'OS
#   2. test « ce port est-il occupé ? »  (ss n'existe pas partout)
#   3. chemins passés à `docker -v`      (Git Bash réécrit les chemins absolus)
# ══════════════════════════════════════════════════════════════════════════════

# ─── 1. OS ───────────────────────────────────────────────────────────────────
# linux | macos | windows  (windows = Git Bash / MSYS ; WSL est vu comme linux
# et se comporte comme tel, y compris pour /dev/kvm.)
bb_os() {
  case "$(uname -s)" in
    Linux*)                  echo linux ;;
    Darwin*)                 echo macos ;;
    MINGW*|MSYS*|CYGWIN*)    echo windows ;;
    *)                       echo unknown ;;
  esac
}

bb_is_windows() { [ "$(bb_os)" = "windows" ]; }

# ─── 2. Ports ────────────────────────────────────────────────────────────────
# `ss` est propre à Linux (iproute2) : sous Git Bash il n'existe pas, et un
# `ss | grep` échouait silencieusement en répondant « port libre » — on
# repartait alors sur le port par défaut, déjà pris, et le bind échouait.
# `netstat -an` existe sous Windows, macOS et la plupart des Linux.
bb_port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]" && return 0 || return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    # Windows : "  TCP    0.0.0.0:6379   0.0.0.0:0   LISTENING"
    # macOS   : "tcp4  0  0  *.6379   *.*   LISTEN"
    netstat -an 2>/dev/null | grep -iE "[:.]${port}[[:space:]].*(LISTEN|LISTENING)" \
      && return 0 || return 1
  fi
  # Dernier recours : on ne sait pas → on suppose libre (le bind tranchera).
  return 1
}

# ─── 3. Chemins pour Docker ──────────────────────────────────────────────────
# Sous Git Bash, MSYS convertit les chemins de type /repo en C:/Program Files/…
# dans les arguments : `-v "$PWD:/repo"` devient inutilisable. Deux mesures :
#   - MSYS_NO_PATHCONV=1 désactive la réécriture (cf. bb_docker) ;
#   - le chemin HÔTE doit être en forme Windows (C:/Users/…), pas /c/Users/….
bb_hostpath() {
  local p="$1"
  if bb_is_windows && command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"      # -m : C:/Users/… (slashes avant, compris par Docker)
  else
    printf '%s' "$p"
  fi
}

# Appelle docker en neutralisant la conversion de chemins MSYS.
bb_docker() {
  if bb_is_windows; then
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker "$@"
  else
    docker "$@"
  fi
}

# ─── Divers ──────────────────────────────────────────────────────────────────
# `--network host` n'est supporté QUE par le moteur Docker Linux. Sous Docker
# Desktop (Windows/macOS) il est ignoré en silence : un conteneur qui compte
# dessus pour joindre l'hôte échoue sans message clair.
bb_supports_host_network() { [ "$(bb_os)" = "linux" ]; }
