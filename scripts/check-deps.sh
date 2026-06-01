#!/usr/bin/env bash
#
# Audit local des dépendances — même check que .github/workflows/security.yml,
# à lancer avant de pousser ou pour investiguer une alerte.
#
#   bash scripts/check-deps.sh
#
# Sortie non-zéro si une vuln high/critical est trouvée côté server ou python
# (client/flutter sont informatifs). Voir docs/security.md §6.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

bold() { printf "\n\033[1m%s\033[0m\n" "$*"; }

# ── Backend Node (bloquant) ───────────────────────────────────────────────────
bold "[1/4] npm audit — server (high/critical = échec)"
if (cd "$ROOT/server" && npm audit --audit-level=high); then
  echo "  OK server"
else
  echo "  ✗ vulnérabilités high/critical côté server"
  FAIL=1
fi

# ── Frontend React (informatif) ───────────────────────────────────────────────
bold "[2/4] npm audit — client (informatif)"
(cd "$ROOT/client" && npm audit --audit-level=high) || \
  echo "  ⚠ vulnérabilités côté client (CRA legacy — informatif)"

# ── Microservice IA Python (bloquant si pip-audit présent) ────────────────────
bold "[3/4] pip-audit — ai-service"
if command -v pip-audit >/dev/null 2>&1; then
  if (cd "$ROOT/ai-service" && pip-audit -r requirements.txt); then
    echo "  OK ai-service"
  else
    echo "  ✗ vulnérabilités côté ai-service"
    FAIL=1
  fi
else
  echo "  ⚠ pip-audit non installé (pip install pip-audit) — skip"
fi

# ── Apps Flutter (informatif) ─────────────────────────────────────────────────
bold "[4/4] flutter pub outdated (informatif)"
if command -v flutter >/dev/null 2>&1; then
  for app in blancbleu_driver blancbleu_patient; do
    echo "  → $app"
    (cd "$ROOT/$app" && flutter pub outdated || true)
  done
else
  echo "  ⚠ flutter non installé — skip"
fi

bold "Résultat"
if [ "$FAIL" -ne 0 ]; then
  echo "✗ Audit échoué — corriger les vulns high/critical (cf. docs/security.md §6)."
  exit 1
fi
echo "✓ Aucune vulnérabilité bloquante détectée."
