# Bugs / odeurs trouvés pendant l'analyse de `Factures.jsx`

> **Non corrigés** (contrainte : refactor pur). À traiter séparément après le
> refactor si tu valides.

## B1 — Injection HTML potentielle dans `ModalImpression` (l.129-592)

`handlePrint` (l.130) construit une fenêtre d'impression via
`win.document.write(...)` en interpolant `facture.numero` et le contenu
`#facture-print-content` (`innerHTML`). Si `numero`, le motif ou les notes
contiennent du HTML/script, il est exécuté dans la fenêtre ouverte.

- **Gravité** : faible (données serveur, pas saisie libre arbitraire ; mais les
  notes de facture peuvent être éditées).
- **Fix suggéré** : échapper les valeurs ou utiliser une lib d'impression
  (react-to-print) au lieu de `document.write`.

## B2 — `factureImprimer` : state possiblement mort (l.1552)

`const [factureImprimer, setFactureImprimer] = useState(null);` est déclaré mais
je n'ai pas trouvé son usage dans le JSX rendu (le modal d'aperçu semble monté
via `factureDetail`/un autre chemin). À confirmer pendant l'extraction du tableau.

- **Gravité** : nulle (code mort) si confirmé.
- **Fix suggéré** : supprimer le state + son setter s'il est réellement inutilisé.

## B3 — Accès non gardés aux sous-champs `compta` dans les exports

`exportDSN` (l.1783) et `exportRapport` (l.1794) vérifient `if (!compta) return`
mais accèdent ensuite directement à `compta.charges.salaires`,
`compta.urssaf.cotisationsSalariales`, etc. Si le dashboard renvoie un `compta`
partiel (champ manquant), `TypeError` à l'export.

- **Gravité** : faible-moyenne (dépend de la robustesse du backend
  `/comptabilite/dashboard`).
- **Fix suggéré** : optional chaining + valeurs par défaut (`compta.charges?.salaires ?? 0`).

## B4 — Perf : recalculs non mémoïsés (l.1646, 1838, 1844+)

`filtered`, `totalFiltre`, `barData`, `doughnutData`, `barOptions`,
`doughnutOptions` sont recréés à chaque render. Sur une liste de 100 factures +
2 graphiques, coût non négligeable.

- **Gravité** : perf mineure.
- **Fix suggéré** : `useMemo` (prévu en Phase 5 du refactor).

## B5 — `exportCSV` n'échappe pas les guillemets (l.1779)

Les valeurs CSV sont entourées de `"` mais les `"` internes ne sont pas doublés
(`""`). Un motif ou nom patient contenant `"` casse la colonne CSV.

- **Gravité** : faible (rare en pratique).
- **Fix suggéré** : `String(v).replace(/"/g, '""')` avant interpolation.
