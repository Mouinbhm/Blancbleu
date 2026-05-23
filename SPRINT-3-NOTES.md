# Sprint 3 — Notes (non commité)

## Warnings ESLint pré-existants (à traiter dans un sprint futur)

Au début du Sprint 3, le build CRA passait avec ces warnings non-bloquants
(deviennent bloquants si `CI=true`). Ils ne proviennent PAS de Sprint 3 :

- `client/src/pages/Factures.jsx:1` — `useRef` importé, non utilisé
- `client/src/pages/Factures.jsx:2` — `paymentService` importé, non utilisé
- `client/src/pages/FleetDashboard.jsx:49` — `fmtDatetime` assigné, non utilisé
- `client/src/pages/PrescriptionValidation.jsx:34` — `CHAMP_LABELS` non utilisé
- `client/src/pages/SuiviEnDirect/index.jsx:51` — `useEffect` missing deps (`map`, `positions`)
- `client/src/pages/TransportDetail.jsx:407` — `criteriaScores` non utilisé
- `client/src/pages/TransportDetail.jsx:632` — `modalVehicle`/`setModalVehicle` non utilisés
- `client/src/pages/TransportDetail.jsx:994` — `vehiculesCompatibles` non utilisé
- `client/src/pages/TwoFactorSetup.jsx:6` — `pendingTempToken` non utilisé
- `client/src/pages/Login.jsx` — `connected` non utilisé

Action : Sprint 6 (cleanup) ou en passant lors de refactos ciblés.

L'étape 6 (refactor TransportDetail) éliminera les warnings de ce fichier.

## Test `App.test.js` pré-existant en échec

`client/src/App.test.js` (gitignored localement) contient un test qui attend
`STATUT_CONFIG.length === 12` mais le module `StatutBadge.jsx` actuel n'a
pas exactement 12 entrées. Pré-existant. Non lié à Sprint 3.

Action : fixer le count attendu OU compléter STATUT_CONFIG dans un sprint
cleanup. Pour Sprint 3, on l'ignore.

## Étape 6 — Refactor TransportDetail : flows non migrés

L'orchestrator Sprint 3 est volontairement minimal (50 LoC vs 2064). Sont
ABSENTS de la nouvelle page mais existent toujours côté backend :

  - Boutons d'action lifecycle complets (en route, à bord, terminer, etc.)
    Le `TransportHeader` n'expose que "Annuler" — les autres transitions
    sont déclenchées par les apps mobiles (driver) ou via API directe.
  - Modal "Attente patient" / "Retour base" / "Facturation CPAM" avec
    sélection de prescription.
  - Export PDF mission (bouton dans le header).

Sprint suivant : exposer un panneau "Actions dispatcher" qui affiche les
transitions disponibles selon le statut courant (table ACTIONS_PAR_STATUT
de l'ancien fichier).

Le test visuel manuel n'a pas été fait (`npm start` non lancé) — à valider
avant merge.

## Étape 7 — NouveauTransport wizard : features reportées

Fonctionnalités du formulaire original non portées dans le wizard Sprint 3 :

  - **AdresseAutocomplete BAN** : le composant utilisait l'API
    `api-adresse.data.gouv.fr` pour suggérer adresses + GPS. Remplacé par
    de simples inputs texte. Sans GPS, l'estimation tarifaire ne marche pas
    et l'IA dispatch utilise un fallback dégradé. À ré-intégrer.
  - **Estimation tarifaire en direct** (`transportService.estimerTarif`) :
    le panneau de récap n'affiche plus l'estimation. À ajouter dans
    `StepRecap` quand AdresseAutocomplete sera de retour (GPS requis).
  - **PatientSelector** (recherche patient existant à la volée) : seul le
    flux `?patientId=…` depuis la fiche patient pré-remplit le wizard.
    L'utilisateur ne peut pas chercher un patient existant depuis le step
    Patient — il doit retaper les infos.
  - **Calcul des occurrences récurrentes** (`calculerOccurrences`) : pas
    d'aperçu visuel ("Cela créera X transports les Lun, Mer…") dans le
    Step Recap. Juste la sélection des jours.

Action : sprint UX dédié pour rétablir ces aides au remplissage.

## Étape 8 — Skeletons page-level non posés

`AppErrorBoundary` global est en place dans `index.js`. Les panneaux de
`TransportDetail` exposent déjà leurs propres skeletons via les hooks
TanStack Query (cf. étape 6).

PAS migrés vers `<Skeleton />` :

  - `Dashboard.jsx` : KpiCard affiche "…" pendant `loading` au lieu d'un
    bloc squelette. Migration React Query + Skeleton à faire.
  - `Transports.jsx` : aucun squelette pendant le chargement de la liste.
    À porter sur 5 lignes squelette.

Action : sprint UX cleanup OU lors de la migration React Query de ces
deux pages (étape future).
