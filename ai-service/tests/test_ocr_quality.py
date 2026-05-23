"""
Benchmark de qualité OCR / extraction PMT.

Pour chaque fixture trouvée dans tests/fixtures/pmt/ accompagnée d'un
`<name>.annotations.json`, calcule la qualité de chaque champ extrait
(precision, recall, F1 globalisés) en comparant l'extraction au gold
standard.

Mode `.txt` (CI-safe) : le texte du fichier sert directement de "texte
post-OCR" (monkey-patch de `extraire_texte_complet`) — pas besoin de
Tesseract en CI.

Mode `.pdf`/`.jpg` : OCR réel via Tesseract — exécuté manuellement avec
des scans anonymisés.

Skip propre si aucune fixture annotée (le dossier est vide en clone frais).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "pmt"

# Champs critiques pour le seuil d'assertion final
CRITICAL_FIELDS = {"patient_nom", "rpps", "medecin_nom", "type_transport", "mobilite"}

# Seuil minimal de F1 global sur les champs critiques
MIN_GLOBAL_F1 = 0.60


def _list_annotated_fixtures():
    """Liste les fixtures dont l'annotation JSON existe."""
    if not FIXTURES_DIR.exists():
        return []
    items = []
    for ann_path in sorted(FIXTURES_DIR.glob("*.annotations.json")):
        base = ann_path.name.removesuffix(".annotations.json")
        # Trouver le fichier d'entrée associé (txt, pdf, jpg, png, tiff)
        for ext in (".txt", ".pdf", ".jpg", ".jpeg", ".png", ".tiff"):
            fpath = FIXTURES_DIR / f"{base}{ext}"
            if fpath.exists():
                items.append((base, fpath, ann_path))
                break
    return items


def _normalize(v: Any) -> Any:
    """Normalisation pour comparaison : strip, lowercase pour str, bool natif."""
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip().lower()
    return v


def _extract_one(file_path: Path, monkeypatch):
    """
    Appelle extraire_pmt(). Si le fichier est un .txt, on monkey-patche l'OCR
    pour retourner le contenu directement (pas de Tesseract requis).
    """
    from services import pmt_extractor

    if file_path.suffix.lower() == ".txt":
        content = file_path.read_text(encoding="utf-8")
        monkeypatch.setattr(pmt_extractor, "extraire_texte_complet", lambda b, m: content)
        return pmt_extractor.extraire_pmt(b"", "text/plain")

    # Cas .pdf/.image : OCR réel
    return pmt_extractor.extraire_pmt(
        file_path.read_bytes(),
        _mimetype_for(file_path),
    )


def _mimetype_for(p: Path) -> str:
    ext = p.suffix.lower()
    return {
        ".pdf":  "application/pdf",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".tiff": "image/tiff",
    }.get(ext, "application/octet-stream")


def _extracted_value(response, field: str) -> Any:
    """Mapping nom de champ annotation → valeur dans PMTExtractionResponse."""
    e = response.extraction
    table = {
        "patient_nom":          e.patient.nom,
        "patient_prenom":       e.patient.prenom,
        "patient_dateNaissance": e.patient.dateNaissance,
        "rpps":                 e.medecin.rpps,
        "medecin_nom":          e.medecin.nom,
        "datePrescription":     e.datePrescription,
        "type_transport":       e.typeTransportAutorise,
        "mobilite":             e.mobilite,
        "motif":                e.motif,
        "destination":          e.destination,
        "allerRetour":          e.allerRetour,
        "oxygene":              e.oxygene,
        "brancardage":          e.brancardage,
    }
    return table.get(field)


def _per_field_match(expected: Any, actual: Any) -> str:
    """tp (correct) / fp (faux positif) / fn (omis) / tn (vide attendu, vide trouvé)."""
    exp_n = _normalize(expected)
    act_n = _normalize(actual)
    exp_present = exp_n not in (None, "")
    act_present = act_n not in (None, "")

    if not exp_present and not act_present:
        return "tn"
    if exp_present and act_present:
        return "tp" if exp_n == act_n else "fp"  # mauvaise valeur = fp pour ce champ
    if exp_present and not act_present:
        return "fn"
    return "fp"  # expected None mais quelque chose extrait


def _f1(tp: int, fp: int, fn: int) -> float:
    if tp + fp == 0 or tp + fn == 0:
        return 0.0 if tp == 0 else 0.0
    p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    return 0.0 if (p + r) == 0 else round(2 * p * r / (p + r), 3)


# ── pytest ─────────────────────────────────────────────────────────────────────

def test_ocr_quality_benchmark(monkeypatch):
    items = _list_annotated_fixtures()
    if not items:
        pytest.skip("Aucune fixture annotée dans tests/fixtures/pmt/ — benchmark skip")

    # Agrégation par champ : counters tp/fp/fn
    counters: dict[str, dict[str, int]] = {}
    per_fixture: list[dict] = []

    for base, fpath, ann_path in items:
        annot = json.loads(ann_path.read_text(encoding="utf-8"))
        response = _extract_one(fpath, monkeypatch)

        fixture_report = {"fixture": base, "fields": {}}
        for field, expected in annot.items():
            actual = _extracted_value(response, field)
            outcome = _per_field_match(expected, actual)
            counters.setdefault(field, {"tp": 0, "fp": 0, "fn": 0, "tn": 0})
            counters[field][outcome] += 1
            fixture_report["fields"][field] = {
                "expected": expected, "actual": actual, "outcome": outcome,
            }
        per_fixture.append(fixture_report)

    # Calcul F1 par champ
    f1_by_field = {f: _f1(c["tp"], c["fp"], c["fn"]) for f, c in counters.items()}

    # Affichage lisible
    print("\n" + "=" * 60)
    print(f"OCR quality benchmark — {len(items)} fixture(s)")
    print("=" * 60)
    print(f"{'Champ':<24} {'TP':>4} {'FP':>4} {'FN':>4} {'F1':>8}")
    print("-" * 60)
    for field, c in sorted(counters.items()):
        f1 = f1_by_field[field]
        print(f"{field:<24} {c['tp']:>4} {c['fp']:>4} {c['fn']:>4} {f1:>8.3f}")

    # Score global sur les champs critiques
    crit = {f: f1 for f, f1 in f1_by_field.items() if f in CRITICAL_FIELDS}
    global_f1 = round(sum(crit.values()) / max(1, len(crit)), 3) if crit else 0.0
    print("-" * 60)
    print(f"F1 global (champs critiques) : {global_f1:.3f} (seuil >= {MIN_GLOBAL_F1})")
    print("=" * 60 + "\n")

    assert global_f1 >= MIN_GLOBAL_F1, (
        f"F1 global champs critiques = {global_f1:.3f} < seuil {MIN_GLOBAL_F1}. "
        f"Détail par champ : {f1_by_field}"
    )
