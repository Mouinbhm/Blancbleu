# Fixtures OCR PMT

Ce dossier contient les **scans PMT** utilisés par le benchmark de qualité OCR
(`tests/test_ocr_quality.py` et `scripts/ocr_benchmark.py`).

## Structure attendue

Pour chaque fichier de scan, un fichier d'annotations JSON du même nom :

```
fixture-001.pdf
fixture-001.annotations.json
fixture-002.jpg
fixture-002.annotations.json
mock-cerfa-01.txt              # texte pré-extrait (bypass OCR)
mock-cerfa-01.annotations.json
```

## Format des annotations

```json
{
  "patient_nom":    "MARTIN",
  "patient_prenom": "Jeanne",
  "rpps":           "10100123456",
  "medecin_nom":    "DUPONT",
  "datePrescription": "2026-01-15",
  "mobilite":       "ASSIS",
  "motif":          "Dialyse",
  "destination":    "CHU de Nice",
  "allerRetour":    true,
  "oxygene":        false,
  "brancardage":    false
}
```

Champs supportés (subset de `PMTExtraction`) :
`patient_nom`, `patient_prenom`, `patient_dateNaissance`, `rpps`,
`medecin_nom`, `datePrescription`, `mobilite`, `motif`, `destination`,
`type_transport`, `allerRetour`, `oxygene`, `brancardage`.

## ⚠️ RGPD — ne commit JAMAIS de données patient réelles

- `.pdf`, `.jpg`, `.jpeg`, `.png`, `.tiff` sont gitignored.
- Seuls les fichiers `.txt` (mock CERFA en clair, **données fictives**) et
  `.annotations.json` correspondants sont versionnés.
- Pour le benchmark réel, demande au métier des scans **anonymisés**.

## Mode `.txt` (mock OCR, exécuté en CI)

Le pipeline OCR est sauté pour les `.txt` : le contenu du fichier sert
directement de "texte post-OCR". Permet de tester la qualité de la pipeline
NLP / regex sans avoir besoin de Tesseract en CI.
