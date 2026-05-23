# Sprint 4 — Notes (non commité)

## Tests Python pré-existants en échec

Au démarrage du Sprint 4, ces tests échouent déjà sur `main` (vérifié par
checkout) :

  - `tests/test_ia.py::TestCompatibiliteMobilite::test_assis_vsl_score_optimal`
  - `tests/test_ia.py::TestCompatibiliteMobilite::test_fauteuil_tpmr_optimal`
  - `tests/test_ia.py::TestCompatibiliteMobilite::test_allonge_ambulance_obligatoire`
  - `tests/test_ia.py::TestCompatibiliteMobilite::test_civiere_ambulance_seule`
  - `tests/test_ia.py::TestCompatibiliteMobilite::test_ambulance_assis_sous_optimal`
  - `tests/test_ia.py::TestRecommandationDispatch::test_ambulance_assis_recommandation_score_25`

Cause : `COMPATIBILITE_MOBILITE` dans `dispatch_scorer.py` a des valeurs (ex: 100)
différentes de ce que les tests attendent (ex: 40). Les valeurs prod ont été
modifiées sans synchroniser les fixtures de test.

Action : sprint test cleanup OU lors de l'étape 7 (refacto dispatch_scorer)
quand on touche aux poids.

37 autres tests Python passent. 310 tests Node passent.

## Mémo Sprint 4

- `train_real.py` ne touche jamais au modèle si pas appelé. Il est sûr à
  importer (les imports lourds — joblib, sklearn, xgboost — sont à
  l'intérieur de `main`).
- Le pipeline tourne SANS Node (fallback synthétique 100 %). À tester avec
  vraies données en backfillant `TransportFeature` avant de relancer.

## Étape 5 — Images SHAP non servies (TODO)

Le sprint demande "Affiche les images SHAP" dans AideIA. Pas implémenté
dans Sprint 4 car ça nécessite :
  - Soit une route Python `GET /optimizer/model/shap/{kind}` + proxy Node
    `GET /api/ai/model/shap/:kind` (auth + cookie pour <img>)
  - Soit copier les PNG vers `client/public/shap/` au build

Action : sprint UI ultérieur. Les PNG sont dispo dans
`ai-service/model/shap_summary.png` et `shap_importance.png` (regénérés
à chaque retrain via `data.train_real`).