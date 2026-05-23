"""
Génère un rapport markdown de qualité OCR à partir des fixtures dans
ai-service/tests/fixtures/pmt/.

Usage :
  python -m scripts.ocr_benchmark             # écrit docs/ocr-benchmark.md
  python -m scripts.ocr_benchmark --out path  # destination personnalisée
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = ROOT / "tests" / "fixtures" / "pmt"
DEFAULT_OUT  = ROOT.parent / "docs" / "ocr-benchmark.md"

# Réutilise la logique du test (sans la dépendance pytest)
from tests.test_ocr_quality import (  # noqa: E402
    CRITICAL_FIELDS, MIN_GLOBAL_F1,
    _extracted_value, _f1, _per_field_match,
)


def _list_annotated_fixtures():
    if not FIXTURES_DIR.exists():
        return []
    items = []
    for ann_path in sorted(FIXTURES_DIR.glob("*.annotations.json")):
        base = ann_path.name.removesuffix(".annotations.json")
        for ext in (".txt", ".pdf", ".jpg", ".jpeg", ".png", ".tiff"):
            fpath = FIXTURES_DIR / f"{base}{ext}"
            if fpath.exists():
                items.append((base, fpath, ann_path))
                break
    return items


def _extract(file_path: Path) -> Any:
    from services import pmt_extractor
    if file_path.suffix.lower() == ".txt":
        content = file_path.read_text(encoding="utf-8")
        # Patch local : remplace l'OCR pour les fixtures texte
        original = pmt_extractor.extraire_texte_complet
        pmt_extractor.extraire_texte_complet = lambda b, m: content
        try:
            return pmt_extractor.extraire_pmt(b"", "text/plain")
        finally:
            pmt_extractor.extraire_texte_complet = original
    mime = {
        ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".tiff": "image/tiff",
    }.get(file_path.suffix.lower(), "application/octet-stream")
    return pmt_extractor.extraire_pmt(file_path.read_bytes(), mime)


def run(out_path: Path) -> int:
    items = _list_annotated_fixtures()
    if not items:
        print(f"Aucune fixture annotée dans {FIXTURES_DIR} — rien à benchmarker.")
        return 0

    counters: dict[str, dict[str, int]] = {}
    per_fixture: list[dict] = []

    for base, fpath, ann_path in items:
        annot = json.loads(ann_path.read_text(encoding="utf-8"))
        response = _extract(fpath)
        row = {"fixture": base, "type": fpath.suffix, "fields": {}}
        for field, expected in annot.items():
            actual  = _extracted_value(response, field)
            outcome = _per_field_match(expected, actual)
            counters.setdefault(field, {"tp": 0, "fp": 0, "fn": 0, "tn": 0})
            counters[field][outcome] += 1
            row["fields"][field] = {"expected": expected, "actual": actual, "outcome": outcome}
        per_fixture.append(row)

    f1_by_field = {f: _f1(c["tp"], c["fp"], c["fn"]) for f, c in counters.items()}
    crit = {f: f1 for f, f1 in f1_by_field.items() if f in CRITICAL_FIELDS}
    global_f1 = round(sum(crit.values()) / max(1, len(crit)), 3) if crit else 0.0

    # ── Markdown ───────────────────────────────────────────────────────────────
    lines: list[str] = []
    lines.append("# OCR — Benchmark qualité par champ")
    lines.append("")
    lines.append(f"Généré le {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"Fixtures évaluées : **{len(items)}**")
    lines.append("")
    lines.append("## Résumé")
    lines.append("")
    lines.append(f"- **F1 global champs critiques** : `{global_f1:.3f}` (seuil minimal `{MIN_GLOBAL_F1}`)")
    lines.append(f"- Champs critiques : `{', '.join(sorted(CRITICAL_FIELDS))}`")
    lines.append("")
    lines.append("## F1 par champ")
    lines.append("")
    lines.append("| Champ | TP | FP | FN | F1 |")
    lines.append("|---|---:|---:|---:|---:|")
    for field, c in sorted(counters.items()):
        f1 = f1_by_field[field]
        flag = " ⚠️" if (field in CRITICAL_FIELDS and f1 < 0.6) else ""
        lines.append(f"| `{field}`{flag} | {c['tp']} | {c['fp']} | {c['fn']} | {f1:.3f} |")
    lines.append("")
    lines.append("## Détail par fixture")
    lines.append("")
    for row in per_fixture:
        lines.append(f"### {row['fixture']} ({row['type']})")
        lines.append("")
        lines.append("| Champ | Attendu | Extrait | Résultat |")
        lines.append("|---|---|---|---|")
        for field, info in row["fields"].items():
            exp = "" if info["expected"] is None else str(info["expected"])
            act = "" if info["actual"]   is None else str(info["actual"])
            emoji = {"tp": "✅", "fp": "❌", "fn": "⛔", "tn": "·"}[info["outcome"]]
            lines.append(f"| `{field}` | {exp} | {act} | {emoji} {info['outcome']} |")
        lines.append("")
    lines.append("## Légende")
    lines.append("")
    lines.append("- **TP** (true positive) : champ correctement extrait")
    lines.append("- **FP** (false positive) : champ extrait mais valeur incorrecte")
    lines.append("- **FN** (false negative) : champ attendu non extrait")
    lines.append("- **TN** (true negative) : champ absent dans l'annotation ET dans l'extraction")
    lines.append("")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Rapport écrit : {out_path}")
    print(f"F1 global champs critiques : {global_f1:.3f}")
    return 0 if global_f1 >= MIN_GLOBAL_F1 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    sys.exit(run(args.out))
