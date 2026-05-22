# Sprint 2 — Notes et compromis

## Étape 5 — Transactions Mongoose

### Side-effects post-commit (TODO sprint futur)

`_transition()` dans `server/services/transportLifecycle.js` émet toujours
les événements Socket.IO et programme les notifications **à l'intérieur** de
la fonction. Quand la transaction est annulée (rare — uniquement sur erreur
en cours d'écriture), ces side-effects ont déjà été émis.

Impact :
  - Le frontend peut recevoir un événement `transport:status_updated`
    qui ne correspond à aucun changement persistant.
  - Les notifications via `setImmediate(...notifyStatusChanged)` peuvent
    être déclenchées même si la transaction rollback.

Mitigation actuelle : les transactions ne rollback que sur des erreurs
réelles (validation, contrainte unique, perte de réseau pendant commit).
Dans le flux normal, aucun side-effect parasite.

Refactor propre à faire : séparer `_transition` en deux fonctions —
`_transitionDbWrites(session)` (dans la transaction) et
`_emitTransitionSideEffects(transport)` (après commit).

### Setup MongoDB en local (sans Docker)

Pour faire tourner les transactions sur ta machine sans Docker :

```bash
# Démarrer Mongo en replica set
mongod --replSet rs0 --dbpath ./data

# Dans un autre terminal, une seule fois :
mongosh --eval "rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:27017'}]})"
```

Côté `.env`, ajuste `MONGO_URI` :
```
MONGO_URI=mongodb://localhost:27017/blancbleu?replicaSet=rs0
```

Pour Docker Compose, le `mongo-init` one-shot s'en occupe automatiquement.

### Keyfile auto-généré dans docker-compose

Mongo refuse `--auth` + `--replSet` ensemble sans keyfile. Le `command:` du
service `mongo` génère un keyfile à la 1ère création (volume `mongo_keyfile`)
avec `openssl rand`. Ne pas committer ce keyfile : il vit dans le volume Docker.

## Étape 2 — GeoJSON sur Vehicle

### Bug Mongoose : `coordinates: [Number]` default = `[]`

Mongoose initialise par défaut tout champ Array à `[]`, ce qui produit un
GeoJSON Point invalide `{ type: "Point", coordinates: [] }` rejeté par
l'index 2dsphere. Solution appliquée dans `Vehicle.js` et `Transport.js` :
`coordinates: { type: [Number], default: undefined }`.
