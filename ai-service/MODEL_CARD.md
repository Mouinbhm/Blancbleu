# BlancBleu — Model Card du microservice IA

> **Statut : POC (Proof of Concept) — NON DESTINÉ À LA PRODUCTION.**
>
> Ce document décrit ce que fait réellement le microservice `ai-service`, sur quelles
> données et avec quelles limites. Il a été écrit pour éviter le sur-marketing :
> ce qui est rule-based est appelé rule-based, ce qui est ML est appelé ML,
> et l'absence de données réelles est signalée explicitement.

---

## 1. Périmètre fonctionnel

| Module                     | Implémentation                            | Statut   |
| -------------------------- | ----------------------------------------- | -------- |
| `POST /dispatch/recommend` | **Système expert pondéré (rule-based)**   | Stable   |
| `POST /optimizer/predict`  | XGBoost entraîné sur données synthétiques | POC      |
| `POST /pmt/extract`        | Tesseract OCR + regex + spaCy             | Pré-prod |
| `POST /routing/optimize`   | Google OR-Tools (VRP)                     | Stable   |
| `GET  /ai/info`            | Renvoie ce document en JSON               | Stable   |
| `GET  /health`             | État du service et de ses dépendances     | Stable   |

**Aucun composant n'apprend en ligne.** Le scoring de dispatch est 100 %
heuristique (poids fixes par défaut, modifiables via payload). Le prédicteur
de durée est un modèle entraîné offline ; il ne se ré-entraîne pas en prod
sans un trigger manuel (`POST /optimizer/model/train`).

---

## 2. Prédicteur de durée — données d'entraînement

| Source       | Volume |
| ------------ | -----: |
| **Réelles**  |  **0** |
| Synthétiques |  1 500 |
| Split train  |  1 200 |
| Split test   |    300 |

Source : [`model/metrics.json`](model/metrics.json), champ `data_composition`.

La stratégie de split est `shuffled_cold_start` (mélange aléatoire — pas de
séparation par véhicule/chauffeur, ce qui peut surestimer les métriques si
des patterns par entité fuient entre train et test).

---

## 3. Métriques

Benchmark interne sur les **300 transports synthétiques** du split test
(seed reproductible). Modèle retenu : **XGBoost**.

| Modèle               |      MAE |      RMSE |        R² |      MAPE |
| -------------------- | -------: | --------: | --------: | --------: |
| Linear Regression    |    13.71 |     18.82 |     0.892 |    20.7 % |
| Random Forest        |     7.93 |     11.42 |     0.960 |    10.3 % |
| **XGBoost (retenu)** | **7.19** | **10.45** | **0.967** | **9.1 %** |

> **Ces métriques ne reflètent que la validation interne sur les données
> synthétiques** générées par notre simulateur. Elles ne disent **rien**
> de la performance sur des transports réels.

---

## 4. Limitations connues

### 4.1 Biais inconnu

Les données synthétiques ont été générées par un script (`scripts/`) avec
des distributions et règles métier _à dire d'expert_. Tout biais introduit
par ces hypothèses (saisonnalité, profils patient, géographie Alpes-Maritimes)
est par construction **inconnu et invisible** dans les métriques ci-dessus.

### 4.2 Pas de drift monitoring

Aucun système ne surveille la dérive du modèle (Evidently, Whylogs, ou
équivalent). Si la distribution des transports change en production
(nouveau type de véhicule, nouvelle zone, etc.), le modèle continuera
à produire des prédictions sans alerte.

### 4.3 Pas de feature store, pas de versioning d'expériences

L'entraînement n'est pas tracé dans un outil dédié (MLflow, W&B). Les
features sont reconstruites ad-hoc à chaque entraînement depuis le code
Python — pas de garantie de reproductibilité hors du commit Git.

### 4.4 Pas d'explicabilité contractualisée

SHAP est intégré au prédicteur mais la sortie n'est pas exposée par
contrat API au caller — l'explicabilité visible dans `/dispatch/recommend`
provient des **règles métier explicites**, pas du modèle ML.

### 4.5 Scoring dispatch : 100 % rule-based

Le module `/dispatch/recommend` est **un système expert pondéré**, pas un
modèle d'apprentissage automatique. Les 7 critères et leurs poids sont
définis dans le code (cf. [`services/dispatch_scorer.py`](services/dispatch_scorer.py),
`DEFAULT_SCORING_WEIGHTS`). Cela offre l'explicabilité totale et la
stabilité voulues, mais aucune capacité d'adaptation automatique.

---

## 5. Roadmap pour passage en production

Avant d'utiliser ce service comme aide à la décision en production, il
faudrait au minimum :

1. **Collecte de données réelles** — 6 mois de transports terminés
   (objectif : N ≥ 5 000 avec `dureeReelleMinutes` renseigné), couvrant
   au moins un cycle saisonnier complet.
2. **A/B test contrôlé** — comparer le modèle ML à la baseline heuristique
   (ETA = distance / 30 km·h) sur des transports réels, mesurer le gain
   de MAE et l'absence de biais sur sous-groupes (mobilité, motif, jour).
3. **Monitoring drift** — Evidently AI (open source) pour suivre
   distribution des features et erreur de prédiction au fil du temps.
4. **Versioning** — MLflow (ou DVC pour les données) pour tracer les
   expériences, paramètres et artefacts.
5. **Re-train automatisé** — pipeline trigger périodique (cron BullMQ),
   avec validation auto (gate sur MAE/R² minimum) avant promotion.
6. **Garde-fou métier** — fallback déterministe si le modèle prédit hors
   plage plausible (ex : > 4 h pour un transport intra-urbain).

---

## 6. Pourquoi le code reste en place

Ce POC reste embarqué dans le repository pour deux raisons :

- **Démonstration end-to-end** — l'architecture (collecte → entraînement
  → scoring → API → frontend) est fonctionnelle et utilisable pour montrer
  le flux complet.
- **Itération future** — quand les données réelles arriveront, l'ossature
  est prête à recevoir un vrai entraînement sans tout reconstruire.

**Il n'est PAS appelé en chemin critique de production.** Le dispatcher
humain reste l'autorité finale sur l'affectation véhicule/chauffeur, et
les ETA affichés à l'usager devraient venir d'OSRM (routage routier
déterministe), pas du prédicteur ML, tant que le point 1 de la roadmap
n'est pas atteint.

---

## 7. Pour les développeurs

- Toute modification du `DEFAULT_SCORING_WEIGHTS` doit être documentée
  dans le commit (le scoring affecte directement la priorisation des
  véhicules — pas de hot-fix silencieux).
- Le warning de [`metrics.json`](model/metrics.json) doit rester en place
  tant que `data_composition.real < 300`.
- L'endpoint `GET /ai/info` est la source de vérité runtime pour cette
  carte modèle — toute MAJ ici doit s'y refléter (même contenu).
