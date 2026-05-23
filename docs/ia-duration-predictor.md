# IA — Prédicteur de durée de transport

## Objectif

Prédire la **durée probable** d'un transport sanitaire (en minutes) à partir
de ses caractéristiques connues au moment de la planification. Sert d'aide à
la décision pour le dispatcher : estimer la fin du transport, organiser le
planning du véhicule pour les courses suivantes, prévenir le patient.

⚠️ **Le modèle ne prend AUCUNE décision médicale**. Il propose une estimation
horaire — le dispatcher reste seul responsable de l'organisation finale.

## Features utilisées

Liste figée dans `ai-service/model/duration_model_features.json` (sauvée à
chaque réentraînement pour garantir l'alignement entre training et inférence).

**Scalaires** :
- `distance_km` — Haversine entre adresses (calculé côté Node)
- `aller_retour` — 0/1
- `nb_patients` — défaut 1 (réservé pour futur)
- `experience_chauffeur` — défaut 0.5 (réservé pour futur)

**One-hot** :
- `mobilite_*` (ASSIS, FAUTEUIL_ROULANT, ALLONGE)
- `type_vehicule_*` (VSL, TPMR, AMBULANCE)
- `type_etablissement_*` (hopital_public, clinique_privee, centre_dialyse,
  domicile) — défaut `hopital_public` côté données réelles
- `motif_*` (Dialyse, Chimiotherapie, Consultation, Hospitalisation)

**Cycliques** (encodage trigonométrique pour les variables temporelles) :
- `heure_sin`, `heure_cos` (0..23 → cercle)
- `jour_sin`, `jour_cos` (0..6 → cercle)

**Engineered** :
- `est_heure_pointe` (heure ∈ {7,8,9,17,18,19})
- `est_lundi` (effet "rentrée de week-end")
- `distance_x_heure` (interaction distance × heure)

## ⚠️ Limite majeure assumée — données d'entraînement

À la **première mise en production**, le modèle est entraîné à 100 % sur des
**données synthétiques** générées par
`ai-service/data/generate_dataset.py`. Cette formule analytique pose la
durée comme :

```
duree = (distance / 30) * 60 * facteur_heure * facteur_jour
         + ajout_mobilite + ajout_etablissement
         + (× 2.1 si aller-retour) × (1 - 0.1 × experience_chauffeur)
         + bruit normal(0, 4)
```

Le XGBoost atteint un R² ≈ 0.97 et un MAE ≈ 7 min **sur cette même formule**.
**Ces métriques ne reflètent pas la performance réelle** ; elles montrent
juste que le modèle a appris la formule génératrice.

**Le seul moyen d'avoir des métriques honnêtes est de basculer sur des
données réelles.** C'est ce que fait le pipeline Sprint 4 :

1. À chaque transport terminé, `featureCollectorService` persiste un
   `TransportFeature` (features prédictibles + `dureeReelleMinutes`
   mesurée via `actualPickupTime` / `actualDropoffTime`).
2. `data.train_real.main()` pull ces données via
   `GET /api/ai/training-data` et entraîne sur l'union {réel + synthétique
   en complément}.
3. Le `metrics.json` produit indique systématiquement :
   ```json
   "data_composition":  { "real": N, "synthetic": M, "train_n": ..., "test_n": ... },
   "split_strategy":    "chronological_real" | "shuffled_cold_start" | "shuffled_low_real",
   "warning":           "<...>"  // tant que real < 300
   ```

## Stratégie de validation

**Split chronologique** dès que possible (`real ≥ 50` ET timestamps
disponibles) : les 80 % les plus anciens forment le train, les 20 % les
plus récents le test. **Pas de shuffle**.

Pourquoi ? Le shuffle introduit un *data leakage temporel* : si le modèle
voit des transports de mai 2026 pendant l'entraînement et qu'on le teste
sur des transports d'avril 2026, il a accès à des patterns du futur (saisons,
trafic, événements). Le split chronologique simule la vraie question :
"Avec ce que je sais aujourd'hui, suis-je capable de prédire demain ?"

Cold-start (real = 0) : on shuffle, c'est strictement un test de fit à la
formule synthétique. Le flag `split_strategy: "shuffled_cold_start"` le
documente sans détour.

## Explicabilité

À chaque entraînement, deux figures SHAP sont sauvées dans
`ai-service/model/` :

- `shap_summary.png` — beeswarm : impact de chaque feature sur la
  prédiction, par instance.
- `shap_importance.png` — bar chart : importance moyenne |SHAP| par
  feature (top-down).

Pour une prédiction individuelle, l'API renvoie les `contributions`
(top-5 features SHAP signées en minutes). Affiché dans la page AideIA.

## Déclencheurs de réentraînement

- **Manuel** : `POST /api/ai/model/retrain` (admin) → BullMQ → Python
  `data.train_real`. Visible dans la page AideIA + suivi via
  `GET /api/ai/model/status`.
- **Périodique** (à planifier dans un sprint futur) : 1×/semaine via le
  worker BullMQ — pour intégrer naturellement les nouvelles données.

## Roadmap (post-Sprint 4)

- [ ] Atteindre `real ≥ 300` (seuil "warning" levé)
- [ ] Suivi de la **dérive** (drift) : MAE rolling sur 30 derniers jours
- [ ] Ajout de features géocodées (densité urbaine, météo)
- [ ] Modèle par segment (urbain vs périurbain)
- [ ] A/B testing : exposer 50 % des prédictions au nouveau modèle, mesurer
  l'écart moyen avec la durée réelle
