# OCR — Benchmark qualité par champ

Généré le 2026-05-23T14:54:58.875755+00:00
Fixtures évaluées : **2**

## Résumé

- **F1 global champs critiques** : `0.600` (seuil minimal `0.6`)
- Champs critiques : `medecin_nom, mobilite, patient_nom, rpps, type_transport`

## F1 par champ

| Champ | TP | FP | FN | F1 |
|---|---:|---:|---:|---:|
| `allerRetour` | 2 | 0 | 0 | 1.000 |
| `brancardage` | 1 | 1 | 0 | 0.667 |
| `datePrescription` | 1 | 1 | 0 | 0.667 |
| `destination` | 1 | 1 | 0 | 0.667 |
| `medecin_nom` ⚠️ | 0 | 1 | 1 | 0.000 |
| `mobilite` | 2 | 0 | 0 | 1.000 |
| `motif` | 2 | 0 | 0 | 1.000 |
| `oxygene` | 1 | 1 | 0 | 0.667 |
| `patient_nom` ⚠️ | 0 | 2 | 0 | 0.000 |
| `patient_prenom` | 0 | 2 | 0 | 0.000 |
| `rpps` | 2 | 0 | 0 | 1.000 |
| `type_transport` | 2 | 0 | 0 | 1.000 |

## Détail par fixture

### mock-cerfa-01 (.txt)

| Champ | Attendu | Extrait | Résultat |
|---|---|---|---|
| `patient_nom` | MARTIN | PRESCRIPTION | ❌ fp |
| `patient_prenom` | Jeanne | PRESCRIPTION MEDICALE | ❌ fp |
| `rpps` | 10100123456 | 10100123456 | ✅ tp |
| `medecin_nom` | DUPONT |  | ⛔ fn |
| `datePrescription` | 15/01/2026 | 12/03/1948 | ❌ fp |
| `type_transport` | VSL | TypeTransportAutorise.VSL | ✅ tp |
| `mobilite` | ASSIS | MobilitePatient.ASSIS | ✅ tp |
| `motif` | Dialyse | Dialyse | ✅ tp |
| `destination` | Centre de dialyse Saint-Roch, Nice | Centre de dialyse Saint-Roch | ❌ fp |
| `allerRetour` | True | True | ✅ tp |
| `oxygene` | False | True | ❌ fp |
| `brancardage` | False | True | ❌ fp |

### mock-cerfa-02 (.txt)

| Champ | Attendu | Extrait | Résultat |
|---|---|---|---|
| `patient_nom` | LEROY | PRESCRIPTION | ❌ fp |
| `patient_prenom` | Marc | PRESCRIPTION MEDICALE | ❌ fp |
| `rpps` | 10100987654 | 10100987654 | ✅ tp |
| `medecin_nom` | BERNARD | BERNARD
RPPS | ❌ fp |
| `datePrescription` | 22/02/2026 | 22/02/2026 | ✅ tp |
| `type_transport` | AMBULANCE | TypeTransportAutorise.AMBULANCE | ✅ tp |
| `mobilite` | ALLONGE | MobilitePatient.ALLONGE | ✅ tp |
| `motif` | Chimiothérapie | Chimiothérapie | ✅ tp |
| `destination` | Hôpital Pasteur, Nice | Hôpital Pasteur, Nice | ✅ tp |
| `allerRetour` | True | True | ✅ tp |
| `oxygene` | True | True | ✅ tp |
| `brancardage` | True | True | ✅ tp |

## Légende

- **TP** (true positive) : champ correctement extrait
- **FP** (false positive) : champ extrait mais valeur incorrecte
- **FN** (false negative) : champ attendu non extrait
- **TN** (true negative) : champ absent dans l'annotation ET dans l'extraction
