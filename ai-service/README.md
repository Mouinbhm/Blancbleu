# BlancBleu — Microservice de scoring de dispatch + prédicteur de durée (POC)

Microservice Python (FastAPI) pour le transport sanitaire non urgent.

> Pour la posture officielle du service (statut POC, données d'entraînement,
> métriques, limitations, roadmap production), voir [`MODEL_CARD.md`](MODEL_CARD.md).

**Port :** 5002
**Lancement :** `uvicorn main:app --host 0.0.0.0 --port 5002 --reload`

---

## Modules

| Module               | Route                      | Implémentation                          |
| -------------------- | -------------------------- | --------------------------------------- |
| Extraction PMT       | `POST /pmt/extract`        | Tesseract OCR + regex + spaCy           |
| Scoring dispatch     | `POST /dispatch/recommend` | **Système expert pondéré (rule-based)** |
| Prédicteur de durée  | `POST /optimizer/predict`  | XGBoost — **POC, données synthétiques** |
| Optimisation tournée | `POST /routing/optimize`   | Google OR-Tools (VRP)                   |
| Info modèle          | `GET  /ai/info`            | Renvoie le MODEL_CARD en JSON           |
| Santé                | `GET  /health`             | État du service et des modules          |

---

## Limitations actuelles

- **Le scoring de dispatch n'est pas du machine learning** — c'est une
  somme pondérée de 7 scores calculés par règles métier (`DEFAULT_SCORING_WEIGHTS`
  dans [`services/dispatch_scorer.py`](services/dispatch_scorer.py)). Pas
  d'apprentissage, pas d'inférence. Avantage : explicabilité totale.
- **Le prédicteur de durée est un POC** entraîné sur **1 500 transports
  synthétiques**, **zéro réels** (cf. [`model/metrics.json`](model/metrics.json)).
  Les métriques (MAE ≈ 7 min, R² ≈ 0.97) ne reflètent que la validation
  interne sur le test set synthétique — elles n'indiquent rien sur la
  performance en production.
- **Pas de monitoring drift** (ni Evidently, ni MLflow) — toute dérive
  passerait inaperçue.
- **Biais d'entraînement inconnu** : les données ont été générées par
  un script (`scripts/`) avec des règles métier _à dire d'expert_.
- **Le dispatcher humain reste l'autorité finale** sur l'affectation
  véhicule/chauffeur ; le scoring est une aide à la décision, pas un
  système autonome.

Roadmap pour passage en prod : cf. [`MODEL_CARD.md`](MODEL_CARD.md) §5.

---

## Installation

### 1. Prérequis Python

```bash
cd ai-service
pip install -r requirements.txt
```

### 2. Installation Tesseract OCR (Windows)

**Étape 1 — Installer l'exécutable**

Télécharger l'installeur depuis :  
https://github.com/UB-Mannheim/tesseract/wiki

Choisir : `tesseract-ocr-w64-setup-5.x.x.exe`

Installer dans le chemin par défaut :  
`C:\Program Files\Tesseract-OCR\`

**Étape 2 — Télécharger le fichier de langue française**

Le fichier `fra.traineddata` n'est **pas inclus** dans l'installeur de base.  
Il est **obligatoire** pour l'extraction des PMT.

Lancer le script fourni :

```bash
python scripts/download_tessdata.py
```

Ce script :

- Localise automatiquement le dossier `tessdata`
- Télécharge `fra.traineddata` (~4.8 Mo) et `eng.traineddata` (~4.1 Mo)
- Vérifie que les fichiers sont corrects

**Étape 3 — Vérifier l'installation**

```bash
tesseract --list-langs
```

Résultat attendu :

```
List of available languages (3):
eng
fra
osd
```

### 3. Installation spaCy (optionnel — améliore la détection de noms)

```bash
pip install spacy
python -m spacy download fr_core_news_sm
```

### 4. Installation OR-Tools (optionnel — optimisation de tournée)

```bash
pip install ortools
```

---

## Variables d'environnement

| Variable          | Valeur par défaut                         | Description                    |
| ----------------- | ----------------------------------------- | ------------------------------ |
| `TESSDATA_PREFIX` | `C:\Program Files\Tesseract-OCR\tessdata` | Dossier des fichiers de langue |
| `AI_PORT`         | `5002`                                    | Port d'écoute                  |

La variable `TESSDATA_PREFIX` est configurée automatiquement par le service si elle n'est pas définie.

---

## Dépannage

### Erreur : `Failed loading language 'fra'`

Le fichier `fra.traineddata` est absent du dossier tessdata.

**Solution :**

```bash
python scripts/download_tessdata.py
```

Puis redémarrer le microservice.

### Erreur : `tesseract is not installed or it's not in your PATH`

Tesseract n'est pas installé ou le chemin n'est pas correct.

**Vérifier :**

```bash
where tesseract
tesseract --version
```

Si absent, réinstaller depuis https://github.com/UB-Mannheim/tesseract/wiki

### Erreur 503 depuis le backend Node.js

Le microservice Python n'est pas démarré.

```bash
cd ai-service
uvicorn main:app --host 0.0.0.0 --port 5002 --reload
```

---

## Structure

```
ai-service/
├── main.py                    # Point d'entrée FastAPI
├── requirements.txt           # Dépendances Python
├── routes/
│   ├── pmt.py                 # Route /pmt/extract
│   ├── dispatch.py            # Route /dispatch/recommend
│   └── routing.py             # Route /routing/optimize
├── services/
│   └── pmt_extractor.py       # Pipeline OCR → regex → spaCy
├── utils/
│   ├── ocr_utils.py           # Tesseract + preprocessing image
│   └── regex_patterns.py      # Patterns d'extraction PMT
├── schemas/
│   └── pmt_schemas.py         # Modèles Pydantic
└── scripts/
    └── download_tessdata.py   # Téléchargement fra.traineddata
```
