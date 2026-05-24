# Auto-dispatch HITL — guide

## Philosophie

**L'IA propose, l'humain dispose.** L'auto-dispatch n'est jamais une boîte
noire : tout transport éligible passe par une file de validation visible par
le dispatcher, et la branche "assignation effective sans validation" est
opt-in, traçable et soumise à plusieurs garde-fous.

## Vue d'ensemble du flux

```
Transport SCHEDULED
        │
        ▼ (si DispatchConfig.autoDispatch.enabled)
   queue AUTODISPATCH (BullMQ)
        │
        ▼  autoDispatchWorker.processAutoDispatchJob
        │
   ┌────┴─────── garde-fous skip ────────────┐
   │   • config.enabled rechecké runtime    │
   │   • statut != SCHEDULED                │
   │   • transport.vehicule != null         │
   │   • reco pending déjà existante        │
   │   • aucun véhicule disponible          │
   │   • IA indisponible (PAS de fallback)  │
   └────────────────────────────────────────┘
        │
        ▼  appel aiClient.recommanderDispatch
        ▼  persistance DispatchRecommendation (source=ia)
        ▼  autoDispatchService.evaluerEligibilite()
        │
   ┌────┴───── 8 règles d'éligibilité ──────┐
   │  1. statut SCHEDULED                  │
   │  2. pas déjà assigné                   │
   │  3. mobilité ASSIS/FAUTEUIL_ROULANT   │
   │     (jamais ALLONGE/CIVIERE)          │
   │  4. score ≥ scoreThreshold (def. 80)  │
   │  5. vehicleTypeMatch === 100          │
   │  6. aucun risque bloquant             │
   │  7. vehiculeId défini                  │
   │  8. départ > now + 30 min              │
   └────────────────────────────────────────┘
        │
   ┌────┴────────────────┐
   │   éligible ?         │
   └────┬─────────────┬───┘
        ▼ non         ▼ oui
  reco rejected   ┌──┴──────────────────────────┐
  (raisons        │ requireApproval ?           │
  loggées)        └──┬───────────────────────┬──┘
                     ▼ true (défaut)        ▼ false
              reco pending →           assignerVehicule
              file dispatcher           + AUDIT
              + socket event            AUTO_DISPATCH_ASSIGNED
                                        + reco accepted
                                        + socket event auto_assigned
                                        (rollback en pending si throw)
```

## Configuration

Tout est dans `DispatchConfig.autoDispatch` (singleton MongoDB `_id: default`) :

```js
{
  enabled:         false,  // OFF par défaut (rien ne se déclenche)
  scoreThreshold:  80,     // min 50, max 100
  requireApproval: true,   // ON par défaut (validation humaine obligatoire)
}
```

Édition via :
- **UI** : `/admin/dispatch-config` (rôle admin). Section "Auto-dispatch HITL".
- **API** : `PUT /api/ai/dispatch/config` body `{ autoDispatch: { enabled, scoreThreshold, requireApproval } }`.

## Modes de fonctionnement

### Mode HITL (défaut, recommandé)

`enabled: true, requireApproval: true`

- À chaque transport SCHEDULED, le worker pousse une proposition `pending`.
- Le dispatcher voit la file dans `/auto-dispatch` (badge ambre dans la sidebar).
- Le dispatcher peut **Valider** (assigne via `assignerVehicule`), **Modifier**
  (redirection vers fiche transport pré-remplie), ou **Rejeter** (raison requise).
- Toutes les actions sont auditées (`AUTO_DISPATCH_PROPOSAL`, `AUTO_DISPATCH_REJECTED`).

### Mode auto-assignation (avancé)

`enabled: true, requireApproval: false`

- Le worker assigne **directement** le véhicule sans intervention humaine.
- Audit `AUTO_DISPATCH_ASSIGNED` (origine SYSTÈME) tracé dans tous les cas.
- Si `assignerVehicule` throw → la reco est **rabattue en pending** pour qu'un
  humain prenne le relais.
- **Garde-fous toujours actifs** : mobilité ALLONGE/CIVIERE exclue, score
  insuffisant exclu, IA indisponible → skip (pas de fallback).
- Bandeau d'avertissement rouge visible dans l'UI admin.

## Garde-fous critiques

1. **Re-check `config.enabled` au runtime** : si l'admin désactive
   l'auto-dispatch après que le job a été poussé, le worker skip.
2. **Idempotence stricte** : le job utilise `jobId: autodispatch:{transportId}`,
   le worker refuse de créer une reco si une est déjà `pending` pour ce
   transport.
3. **Pas de fallback Node** : si le microservice IA est indisponible, le
   worker skip (on préfère ne rien faire plutôt qu'assigner sur un scoring
   local moins fiable).
4. **Audit non silencieux** : toute assignation effective déclenche un
   `AUTO_DISPATCH_ASSIGNED` (origine `SYSTÈME`). Recherchable via
   `GET /api/audit?action=AUTO_DISPATCH_ASSIGNED`.
5. **Mobilité bloquante** : ALLONGE/CIVIERE ne passent **jamais** en
   auto-dispatch, quel que soit le score ou la config.
6. **Délai minimum** : 30 min avant le départ — laisse du temps pour réviser.
7. **Match véhicule parfait** : `vehicleTypeMatch === 100` (pas de compromis
   sur le type — un patient ASSIS sur AMBULANCE n'est pas auto-dispatché).

## Test & démo

```bash
# 1. Activer auto-dispatch (mode HITL par défaut)
curl -X PUT http://localhost:5000/api/ai/dispatch/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch":{"enabled":true,"scoreThreshold":80,"requireApproval":true}}'

# 2. Planifier un transport éligible (mobilité ASSIS, date > +30 min)
curl -X PATCH http://localhost:5000/api/transports/$ID/schedule \
  -H "Authorization: Bearer $TOKEN"

# 3. Une proposition devrait apparaître dans /auto-dispatch (badge sidebar incrémenté)
# 4. Valider depuis l'UI ou via API :
curl -X POST http://localhost:5000/api/ai/dispatch/auto/$REC_ID/accept \
  -H "Authorization: Bearer $TOKEN"
```

## Tests automatisés

- `__tests__/unit/autoDispatchService.test.js` — 22 tests des règles d'éligibilité.
- `__tests__/integration/autoDispatchWorker.test.js` — 13 tests du worker (skip
  paths, 2 modes, rollback).
- `__tests__/integration/autoDispatchController.test.js` — 10 tests des routes
  HTTP (queue, accept, reject).

## Audit & métriques

| Action | Origine | Quand |
|---|---|---|
| `AUTO_DISPATCH_ASSIGNED` | SYSTÈME | Assignation effective sans validation humaine |
| `AUTO_DISPATCH_PROPOSAL` | HUMAIN  | Dispatcher valide une proposition HITL |
| `AUTO_DISPATCH_REJECTED` | HUMAIN  | Dispatcher rejette une proposition (raison loggée) |

Compteur Prometheus `dispatch_recommendations_total{source="ia"}` mesure le
volume de recos générées.

## Limites connues

- Le worker n'est démarré que si Redis est dispo (sinon stub no-op).
- Si Redis tombe entre le push du job et son exécution, la proposition est
  perdue — le transport reste en SCHEDULED non assigné (un dispatcher peut
  toujours assigner manuellement).
- Pas de retry sur IA-indisponible (skip immédiat). À ajuster si la dispo IA
  fluctue.
