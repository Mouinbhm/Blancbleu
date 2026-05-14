# Dispatch Intelligent et Scoring IA — BlancBleu

## Objectif

Le module de dispatch IA assiste le dispatcher dans le choix du véhicule et du chauffeur le plus adapté à chaque transport sanitaire. Il produit un **score 0-100** pour chaque candidat, accompagné d'explications lisibles, de risques identifiés et d'une liste de candidats exclus.

**Le dispatcher reste seul responsable** de la décision finale. L'IA ne peut ni assigner ni confirmer un transport automatiquement.

---

## Architecture

```
Node.js (aiController.js)
  │
  ├── aiDispatchService.js   ← enrichissement candidats (planning, ponctualité)
  ├── planningLoadService.js ← charge planning par conducteur / véhicule
  ├── driverPerformanceService.js ← historique ponctualité 90 jours
  │
  └── aiClient.js ──────────► FastAPI Python (port 5002)
                                └── dispatch_scoring_service.py
                                      └── DispatchScorer.score()
```

Le microservice Python reçoit la liste des candidats enrichis et calcule le score pondéré multi-critères. Il retourne la recommandation avec explications et la liste des exclus.

---

## Critères de scoring

| # | Critère | Poids | Description |
|---|---------|-------|-------------|
| 1 | `distance` | **25 %** | Distance GPS entre la position du véhicule et l'adresse de départ (formule Haversine). Pénalité progressive au-delà de 5 km. |
| 2 | `driverAvailability` | **20 %** | Disponibilité du chauffeur : statut, planning du jour, absence de chevauchement. |
| 3 | `vehicleTypeMatch` | **20 %** | Compatibilité entre le type de véhicule (VSL / TPMR / Ambulance) et la mobilité du patient. Un score de 0 exclut automatiquement le candidat. |
| 4 | `planningLoad` | **15 %** | Charge de la journée — nombre de missions et chevauchements détectés. Favorise les véhicules moins chargés. |
| 5 | `traffic` | **10 %** | Pénalité aux heures de pointe (7-9h et 17-19h) — estimation heuristique. |
| 6 | `medicalPriority` | **5 %** | Urgence médicale du transport (URGENCE > URGENT > NORMAL). Favorise les ressources disponibles pour les cas critiques. |
| 7 | `punctualityHistory` | **5 %** | Taux de ponctualité du chauffeur sur les 90 derniers jours (≥90 % → 100 pts, ≥75 % → 80, ≥55 % → 60, ≥40 % → 40, sinon 20). |

---

## Formule de scoring

```
Score(candidat) = Σ (poids_i × score_i)   pour i ∈ {1..7}

Avec :
  poids_distance            = 0.25
  poids_driverAvailability  = 0.20
  poids_vehicleTypeMatch    = 0.20
  poids_planningLoad        = 0.15
  poids_traffic             = 0.10
  poids_medicalPriority     = 0.05
  poids_punctualityHistory  = 0.05
  Σ poids = 1.00
```

Chaque score partiel est dans [0, 100]. Le score global est arrondi à l'entier le plus proche.

---

## Matrice de compatibilité véhicule / mobilité patient

| Mobilité patient | VSL | TPMR | Ambulance |
|------------------|-----|------|-----------|
| Assis            | 100 | 85   | 60        |
| Fauteuil roulant | 0   | 100  | 50        |
| Allongé          | 0   | 0    | 100       |
| Civière          | 0   | 0    | 100       |

Un score `vehicleTypeMatch = 0` exclut le candidat de la recommandation (retourné dans `excludedCandidates`).

---

## Exemple de réponse IA

```json
{
  "bestRecommendation": {
    "vehiculeId": "664abc...",
    "chauffeurId": "664def...",
    "vehicleName": "VSL-03",
    "driverName": "Jean Dupont",
    "score": 82,
    "criteriaScores": {
      "distance": 91,
      "driverAvailability": 100,
      "vehicleTypeMatch": 100,
      "planningLoad": 80,
      "traffic": 50,
      "medicalPriority": 60,
      "punctualityHistory": 80
    },
    "explanation": [
      "Véhicule à 2.1 km du lieu de prise en charge",
      "Chauffeur disponible, aucun chevauchement planning",
      "VSL compatible avec mobilité ASSIS"
    ],
    "risks": [
      "Heure de départ en période de pointe (08h30)"
    ],
    "warnings": []
  },
  "recommendations": [...],
  "excludedCandidates": [
    { "vehiculeId": "...", "reason": "Type AMBULANCE incompatible avec mobilité ASSIS (score 0)" }
  ],
  "summary": {
    "totalCandidates": 5,
    "scoredCandidates": 4,
    "excludedCandidates": 1
  }
}
```

---

## Rôle du dispatcher

1. **Génère** la recommandation via le bouton "Recommandation IA" dans le détail du transport.
2. **Consulte** le score, les explications et les risques.
3. **Accepte** la recommandation → le véhicule et le chauffeur sont pré-remplis pour assignation.
4. **Rejette** avec une raison → la recommandation est archivée, le dispatcher choisit manuellement.

Toutes les actions sont tracées dans l'`AuditLog` (actions `AI_DISPATCH_*`).

---

## Fallback si le microservice IA est indisponible

Si le service Python (port 5002) est inaccessible, Node.js bascule sur un fallback simple :
- Les véhicules compatibles avec la mobilité du patient sont filtrés.
- Ils sont triés par proximité GPS si les coordonnées sont disponibles, sinon par ordre alphabétique.
- La réponse indique `"fallbackUsed": true` et `"source": "fallback_node"`.
- Un avertissement est affiché au dispatcher.

---

## Limites du modèle

- **Pas de trafic temps réel** : le critère `traffic` est une heuristique basée sur l'heure de départ, non une API de navigation.
- **Pas d'apprentissage automatique** : les pondérations sont fixes. Elles peuvent être ajustées dans `DEFAULT_SCORING_WEIGHTS` de `dispatch_scorer.py`.
- **Données GPS manquantes** : si les coordonnées de départ ou du véhicule sont absentes, le score `distance` est neutre (50) et un warning est émis.
- **Historique limité** : la ponctualité est calculée sur 90 jours glissants. Un nouveau chauffeur obtient un score neutre (50).
- **Pas de validation automatique** : l'IA ne peut jamais confirmer, assigner ou modifier le statut d'un transport.

---

## Perspectives d'amélioration

- Intégration d'une API trafic temps réel (Google Maps / HERE)
- Apprentissage des pondérations par retour d'expérience (ML supervisé)
- Score de satisfaction patient basé sur les retours post-transport
- Optimisation de tournée multi-véhicule (algorithme VRP)
- Prise en compte des contraintes médicales avancées (oxygène, brancardage, accompagnateur)

---

## Fichiers concernés

### Backend Node.js
| Fichier | Rôle |
|---------|------|
| `server/controllers/aiController.js` | Orchestration, sauvegarde `aiDispatch`, audit |
| `server/services/aiClient.js` | Appel HTTP au microservice Python |
| `server/services/planningLoadService.js` | Calcul charge planning par conducteur/véhicule |
| `server/services/driverPerformanceService.js` | Score ponctualité chauffeur (90 jours) |
| `server/models/Transport.js` | Sous-document `aiDispatch` |
| `server/models/AuditLog.js` | Actions `AI_DISPATCH_*` |
| `server/routes/ai.js` | Routes `/api/ai/dispatch/*` |
| `server/routes/transports.js` | Routes `/:id/ai-recommendation/accept|reject` |

### Microservice Python (port 5002)
| Fichier | Rôle |
|---------|------|
| `ai-service/services/dispatch_scorer.py` | Scoring multi-critères (7 critères) |
| `ai-service/schemas/dispatch_schemas.py` | Schémas Pydantic requête/réponse |

### Frontend React
| Fichier | Rôle |
|---------|------|
| `client/src/pages/TransportDetail.jsx` | Composant `SectionDispatchIA` (score, explications, accept/reject) |
| `client/src/pages/NouveauTransport.jsx` | Option "Lancer recommandation IA après création" |
| `client/src/pages/AideIA.jsx` | Onglet dispatch : `SectionPedagogique` (7 critères, formule, matrice) |
| `client/src/services/api.js` | `aiService.recommanderDispatch`, `accepterRecommandation`, `refuserRecommandation` |

---

## Commandes de démarrage

```bash
# 1. Microservice IA Python
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 5002

# 2. Serveur Node.js
cd server
npm install
npm run dev

# 3. Frontend React
cd client
npm install
npm start
```

## Variables d'environnement requises

```env
# server/.env
AI_SERVICE_URL=http://localhost:5002
MONGODB_URI=mongodb://localhost:27017/blancbleu
JWT_SECRET=...
```
