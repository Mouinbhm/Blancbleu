# Analyse — `client/src/pages/Factures.jsx` (2581 LOC)

> Phase 1 du refactor. **Aucune modification de code n'a été faite.** Ce rapport
> sert à valider la stratégie (option A vs B) avant d'exécuter la Phase 2.

## ⚠️ Découverte majeure — le fichier est mal nommé

`Factures.jsx` n'est **pas** une page de factures avec un peu de compta : c'est un
**dashboard Comptabilité** dont la liste de factures n'est qu'une section parmi
huit. Preuves :

- **Ligne 1946** : le `<h1>` de la page est littéralement `Comptabilité`, sous-titre
  « Finances & Facturation CPAM ».
- **`Layout.jsx:31`** : l'entrée de nav `/factures` porte le label **« Comptabilité »**
  avec l'icône `account_balance_wallet`.
- **`Layout.jsx:48`** : titre de page mappé `"/factures": "Comptabilité — Finances & Facturation"`.
- **Poids du code** : 53 références à `compta` contre 21 à la liste de factures.
- Le `compta` (dashboard) est tissé dans **toute** la vue (header, KPIs, 2 graphiques,
  charges, URSSAF, récap annuel). La table de factures est insérée au milieu
  (lignes 2309-2491).

→ Conséquence directe sur le choix de stratégie (section C).

---

## A. Inventaire structurel

### A.1 Imports (lignes 1-21)

| Origine                           | Imports                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| **React**                         | `useState, useEffect, useRef, useCallback` (l.1)                                                  |
| **Interne — services**            | `api` (défaut) + `factureService, transportService, paymentService, comptabiliteService` (l.2-7)  |
| **Interne — hooks**               | `useSocket` (l.8)                                                                                 |
| **Interne — composants**          | `FactureRowSkeleton` depuis `components/ui/Skeleton` (l.9)                                        |
| **Lib externe — Chart.js**        | `Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend` (l.10-18) |
| **Lib externe — react-chartjs-2** | `Bar, Doughnut` (l.19)                                                                            |

`ChartJS.register(...)` au top-level (l.21) — effet de module.

> Note : **pas de React Query** dans ce fichier (0 `useQuery`/`useMutation`). Tout
> passe par des `useEffect` + appels services axios directs. Le projet a pourtant
> `@tanstack/react-query` (utilisé ailleurs, cf. `hooks/queries/`).

### A.2 Constantes top-level

| Const                  | Ligne | Nature                                |
| ---------------------- | ----- | ------------------------------------- |
| `MOIS_LABELS`          | 37    | 12 mois abrégés (compta/charts)       |
| `MOIS_NOMS`            | 51    | 12 mois complets (compta)             |
| `ANNEES`               | 65    | `[2024..2027]` (sélecteur compta)     |
| `STATUTS`              | 67    | options filtre statut facture         |
| `STATUT_STYLE`         | 80    | map statut → classes Tailwind + label |
| `PAYMENT_STATUS_STYLE` | 92    | map paymentStatus Stripe → style      |
| `MOTIFS_FAC`           | 751   | motifs transport (modal création)     |
| `TYPES_VEH`            | 759   | `["VSL","TPMR","AMBULANCE"]`          |
| `MODES_PAI`            | 760   | modes de paiement                     |
| `inputF`               | 768   | classe Tailwind champ input           |
| `labelF`               | 770   | classe Tailwind label                 |

### A.3 Sous-composants définis hors fonction principale

| Composant              | Lignes    | LOC     | Domaine                          | Cible                             |
| ---------------------- | --------- | ------- | -------------------------------- | --------------------------------- |
| `ModalImpression`      | 129-592   | **464** | Factures (aperçu/impression PDF) | `modals/` — **à découper** (>300) |
| `ChargesDetail`        | 593-750   | 158     | Comptabilité (détail charges)    | `Comptabilite/components/`        |
| `ToastContainer`       | 773-798   | 26      | Commun (UI)                      | `components/` partagé             |
| `ConfirmToast`         | 799-822   | 24      | Commun (UI)                      | `components/` partagé             |
| `ModalNouvelleFacture` | 823-1197  | **375** | Factures (création)              | `modals/` — **à découper** (>300) |
| `ModalDetailFacture`   | 1198-1540 | **343** | Factures (détail/édition)        | `modals/` — **à découper** (>300) |

### A.4 Fonctions helpers hors fonction principale

| Helper            | Ligne | Rôle                                           |
| ----------------- | ----- | ---------------------------------------------- |
| `fmtDate`         | 24    | date → `fr-FR`                                 |
| `fmtMontant`      | 25    | nombre → `"x,xx €"` (toLocaleString)           |
| `fmtEur`          | 27    | nombre → `Intl.NumberFormat` currency EUR      |
| `patientNom`      | 30    | extrait nom patient (patientId ou transportId) |
| `downloadBlob`    | 106   | télécharge un blob PDF                         |
| `downloadCsvBlob` | 116   | télécharge un blob CSV                         |

### A.5 Sections visuelles du render (fonction principale)

| Section                                             | Lignes    | Domaine                             |
| --------------------------------------------------- | --------- | ----------------------------------- |
| Toasts + Confirm + 3 modals montées                 | 1906-1941 | mixte                               |
| Header `<h1>Comptabilité</h1>` + 6 boutons export   | 1943-1996 | **Compta** (titre) + exports mixtes |
| Section A — sélecteur période (mois/année)          | 1998-2039 | Compta                              |
| Section F — alertes                                 | 2040-2081 | Compta                              |
| Section B — KPI cards (CA, encaissé, résultat net…) | 2082-2142 | Compta                              |
| Section C — graphiques Bar + Doughnut               | 2143-2168 | Compta                              |
| Section D — charges + URSSAF                        | 2169-2261 | Compta                              |
| Filtres & recherche factures                        | 2262-2302 | Factures                            |
| Sous-titre section factures                         | 2303-2308 | Factures                            |
| **Tableau factures**                                | 2309-2491 | Factures                            |
| Section E — récap annuel (CA/charges/résultat)      | 2493-2578 | Compta                              |

→ La liste de factures occupe **~180 lignes au milieu de ~590 lignes de JSX**, le
reste est de la comptabilité.

---

## B. Inventaire fonctionnel (fonction principale `Factures`, l.1541-2581)

### B.1 `useState` (15)

| State             | Ligne | Domaine                        |
| ----------------- | ----- | ------------------------------ |
| `moisActuel`      | 1543  | Compta (période)               |
| `anneeActuelle`   | 1544  | Compta (période)               |
| `factures`        | 1547  | Factures                       |
| `stats`           | 1548  | Factures (KPI liste)           |
| `loading`         | 1549  | Factures                       |
| `search`          | 1550  | Factures (filtre)              |
| `filterStatut`    | 1551  | Factures (filtre)              |
| `factureImprimer` | 1552  | Factures (modal impression)    |
| `actionId`        | 1553  | Factures (ligne en action)     |
| `modalNouvelle`   | 1554  | Factures (modal création)      |
| `factureDetail`   | 1555  | Factures (modal détail)        |
| `toasts`          | 1556  | Commun                         |
| `confirmPay`      | 1557  | Factures                       |
| `compta`          | 1560  | **Compta** (tout le dashboard) |
| `comptaLoading`   | 1561  | Compta                         |

### B.2 `useEffect` (3)

| Effect                      | Ligne | Deps                          | Cleanup             | Rôle                             |
| --------------------------- | ----- | ----------------------------- | ------------------- | -------------------------------- |
| socket `facture:updated`    | 1582  | `[subscribe, addToast]`       | ✅ `unsub`          | maj live facture payée           |
| chargement factures + stats | 1603  | `[filterStatut]`              | ✅ `cancelled` flag | `factureService.getAll/getStats` |
| chargement compta dashboard | 1626  | `[moisActuel, anneeActuelle]` | ✅ `cancelled` flag | `GET /comptabilite/dashboard`    |

Tous ont cleanup correct. Deps cohérentes.

### B.3 `useCallback` / `useMemo`

| Hook                           | Ligne | Note                                                            |
| ------------------------------ | ----- | --------------------------------------------------------------- |
| `addToast` (useCallback)       | 1563  | deps `[]`                                                       |
| `reloadFactures` (useCallback) | 1569  | deps `[filterStatut]`                                           |
| **`filtered`**                 | 1646  | ⚠️ recalcul **non mémoïsé** (`factures.filter`) à chaque render |
| `totalFiltre`                  | 1838  | reduce non mémoïsé                                              |
| `barData/doughnutData/...`     | 1844+ | objets chart recréés à chaque render                            |

### B.4 Hooks personnalisés

- `useSocket()` → `{ subscribe }` (l.1581).

### B.5 useQuery / useMutation

**Aucun.** Données chargées par `useEffect` + services axios :

- `factureService.getAll(params)` / `.getStats()` → `/api/factures`
- `factureService.updateStatut/delete/downloadPdf/downloadReceipt/recalculateAmounts`
- `comptabiliteService.exportInvoicesCsv()/exportPaymentsCsv()`
- `api.get("/comptabilite/dashboard", { params })`

### B.6 Handlers (taille)

| Handler                    | Ligne | LOC | Domaine                   |
| -------------------------- | ----- | --- | ------------------------- |
| `handleStatut`             | 1658  | 13  | Factures                  |
| `handleDelete`             | 1672  | 18  | Factures                  |
| `handleDownloadPdf`        | 1690  | 9   | Factures                  |
| `handleDownloadReceipt`    | 1699  | 13  | Factures                  |
| `handleRecalculateAmounts` | 1712  | 23  | Factures                  |
| `handleExportInvoicesCsv`  | 1735  | 10  | Compta                    |
| `handleExportPaymentsCsv`  | 1745  | 11  | Compta                    |
| `exportCSV`                | 1756  | 26  | mixte (factures filtrées) |
| `exportDSN`                | 1783  | 11  | **Compta** (URSSAF)       |
| `exportRapport`            | 1794  | 33  | **Compta**                |
| `_downloadCSV`             | 1828  | 9   | Commun                    |

### B.7 Modals (state d'ouverture)

| Modal                      | State déclencheur                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ModalImpression` (aperçu) | `factureImprimer` (note : monté via `factureDetail`? à vérifier — `factureImprimer` l.1552 semble inutilisé dans le render visible) |
| `ModalNouvelleFacture`     | `modalNouvelle`                                                                                                                     |
| `ModalDetailFacture`       | `factureDetail`                                                                                                                     |
| `ConfirmToast`             | `confirmPay`                                                                                                                        |

### B.8 Actions bulk

**Aucune action bulk** (pas de sélection multiple de factures). Les boutons
d'export agissent sur l'ensemble filtré, pas sur une sélection.

---

## C. Séparation des domaines & recommandation

### C.1 Code FACTURES (liste, détail, création, paiement, annulation)

- States : `factures, stats, loading, search, filterStatut, actionId, modalNouvelle, factureDetail, confirmPay`
- Effects : socket + chargement factures
- Handlers : `handleStatut, handleDelete, handleDownloadPdf/Receipt, handleRecalculateAmounts`
- Composants : `ModalNouvelleFacture, ModalDetailFacture, ModalImpression`, table + filtres
- Helpers : `patientNom`, `STATUT_STYLE`, `PAYMENT_STATUS_STYLE`, `STATUTS`, `MOTIFS_FAC`, `TYPES_VEH`, `MODES_PAI`

### C.2 Code COMPTABILITÉ (recap, CA, charges, résultat, exports)

- States : `moisActuel, anneeActuelle, compta, comptaLoading`
- Effect : chargement `/comptabilite/dashboard`
- Handlers : `exportDSN, exportRapport, handleExportInvoicesCsv, handleExportPaymentsCsv`
- Composants : `ChargesDetail`, KPIs, graphiques Bar/Doughnut, récap annuel, sélecteur période
- Helpers : `MOIS_LABELS, MOIS_NOMS, ANNEES`, `fmtEur`, formules reduce CA/charges/résultat

### C.3 Code COMMUN

- `fmtDate, fmtMontant, fmtEur` (formatters) — **dupliqués ailleurs**, cf. section D
- `ToastContainer, ConfirmToast` (UI)
- `_downloadCSV, downloadBlob, downloadCsvBlob`

### C.4 Recommandation : **⚠️ ni A ni B tels quels — voir nuance**

La consigne suppose « page Factures avec un peu de compta ». La réalité est
**l'inverse** : `/factures` EST la page Comptabilité, la liste de factures en est
un widget. Trois lectures possibles :

- **Option A (tabs)** — découperait artificiellement un dashboard cohérent en
  deux onglets alors que l'utilisateur veut tout voir d'un coup (KPIs + factures
  sur le même écran). ❌ casserait l'UX actuelle.
- **Option B (2 pages /factures + /comptabilite)** — telle qu'écrite, elle
  suppose que `/factures` reste la liste et `/comptabilite` devient le dashboard.
  Mais ici c'est `/factures` qui est **déjà** le dashboard (h1 + nav = Comptabilité).
  Inverser créerait une rupture d'URL/nav.
- **Option B' (recommandée)** — **séparation B, mais en respectant la réalité** :
  1. La page montée sur `/factures` devient `pages/Comptabilite/` (dashboard :
     KPIs, période, charges, URSSAF, graphiques, récap annuel, exports compta).
     **La route `/factures` continue de pointer dessus** (zéro changement d'URL,
     zéro changement de nav — respecte la contrainte « ne pas toucher App.jsx
     mapping /factures »).
  2. La **liste de factures** + ses modals (création/détail/impression) sont
     extraites en composants réutilisables sous `pages/Comptabilite/components/`
     - `modals/`, et restent affichées dans le dashboard (section table).
  3. **Optionnel & à valider avec toi** : exposer aussi une page `/factures-liste`
     dédiée si tu veux une vraie page liste autonome. Par défaut **je ne crée pas
     de nouvelle route** (la contrainte interdit d'ajouter à la nav sans accord).

> En clair : l'éclatement modulaire (hooks/components/modals/utils) est identique
> à l'option B, mais le dossier principal s'appelle `Comptabilite/` car c'est la
> vérité métier, et `/factures` y est redirigé sans rien casser. Si tu préfères
> garder le dossier nommé `Factures/` pour coller à l'URL, c'est un simple choix
> de nommage — dis-moi.

**Ma recommandation : Option B' (séparation modulaire, dossier `Comptabilite/`,
route `/factures` inchangée).** À défaut, **Option A** (tabs) est le 2e choix le
moins risqué côté UX. L'option B « stricte » (déplacer la liste hors de
`/factures`) est déconseillée car elle change l'UX d'une page que les comptables
utilisent comme dashboard unique.

---

## D. Duplications détectées

| Élément                                              | Dans Factures.jsx | Ailleurs                                                                | Action                                                           |
| ---------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `fmtEur`/`fmtEuro` (currency EUR)                    | l.27              | `FleetDashboard.jsx:52` (`fmtEuro`), `PatientDetail.jsx:12` (`fmtEuro`) | **Centraliser** dans `utils/formatters.js` + migrer les 3 usages |
| `fmtDate`                                            | l.24              | `FleetDashboard.jsx:46`, `PatientDetail.jsx:8`                          | Centraliser dans `utils/formatters.js`                           |
| `fmtDatetime`                                        | —                 | `FleetDashboard.jsx:49`, `PatientDetail.jsx:10`                         | À inclure dans formatters partagés                               |
| `STATUT_STYLE`, `PAYMENT_STATUS_STYLE`, `MOTIFS_FAC` | l.80/92/751       | non trouvés ailleurs                                                    | extraire vers `constants/` (factures)                            |
| `ToastContainer`/`ConfirmToast`                      | l.773/799         | existe-t-il un système toast global ? à vérifier                        | réutiliser si présent, sinon extraire                            |

> Pas de `client/src/utils/` ni `client/src/constants/` aujourd'hui — à créer
> (la consigne le prévoit).

---

## E. Risques identifiés

| #   | Risque                                                                                               | Gravité             | Détail                                                                       |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| R1  | `filtered`, `totalFiltre`, `barData`, `doughnutData` non mémoïsés                                    | Perf (mineur)       | recalcul à chaque render — `useMemo` recommandé en Phase 5                   |
| R2  | `ModalImpression` (464 LOC) génère du HTML via `window.open` + `document.write` + `innerHTML`        | Sécurité (faible)   | injection si `facture.numero`/notes non échappés ; **bug noté, pas corrigé** |
| R3  | `factureImprimer` (state l.1552) semble déclaré mais jamais utilisé dans le render                   | Code mort potentiel | à confirmer pendant l'extraction — **noté**                                  |
| R4  | 3 composants > 300 LOC (`ModalImpression` 464, `ModalNouvelleFacture` 375, `ModalDetailFacture` 343) | Structurel          | devront être sous-découpés pour respecter la contrainte <300                 |
| R5  | Aucun hook conditionnel détecté                                                                      | ✅ RAS              | conforme règles React                                                        |
| R6  | Aucun `eslint-disable`/`exhaustive-deps` supprimé                                                    | ✅ RAS              | bonne base                                                                   |
| R7  | Tous les `useEffect` ont cleanup (`cancelled`/`unsub`)                                               | ✅ RAS              | pas de fuite/race évidente                                                   |
| R8  | `exportRapport`/`exportDSN` accèdent `compta.charges.x`/`compta.urssaf.x` sans garde profonde        | Robustesse          | `if (!compta) return` présent mais pas sur sous-champs — **noté**            |

→ Détails bugs dans `tmp/factures-bugs-found.md`.

---

## Synthèse chiffrée

- **2581 LOC** → 6 sous-composants (dont 3 > 300 LOC) + 1 fonction principale 1040 LOC.
- Domaine **Comptabilité dominant** (53 refs `compta` vs 21 factures ; h1 + nav = Comptabilité).
- **0 React Query**, **0 action bulk**, **3 useEffect** (cleanup OK), **15 useState**.
- **3 formatters dupliqués** sur 2 autres pages → centralisation prioritaire.
- Test infra **présente** : `test-utils.jsx` (`renderWithProviders` avec QueryClient + MemoryRouter) déjà OK.

## ⏸️ EN ATTENTE DE TA VALIDATION

Avant la Phase 2, confirme la stratégie :

1. **Option B' (recommandée)** : éclatement modulaire, dossier `pages/Comptabilite/`,
   liste factures en sous-composants, **route `/factures` inchangée**.
2. **Option A** : une page, deux onglets « Comptabilité » / « Factures ».
3. **Option B stricte** : 2 routes distinctes (implique toucher la nav → tu dois m'autoriser).

Et le **nommage du dossier** : `Comptabilite/` (vérité métier) ou `Factures/`
(coller à l'URL) ?
