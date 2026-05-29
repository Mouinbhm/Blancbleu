# RGPD — BlancBleu

Conformité au Règlement Général sur la Protection des Données (UE 2016/679).
**Données traitées** : données de santé (catégorie particulière, art. 9 RGPD).

> Note : ce document est un cadrage opérationnel à valider par un DPO.
> Il ne se substitue pas à l'analyse d'impact (AIPD) requise pour des données de santé.

---

## 1. Responsable de traitement

- **Raison sociale** : Ambulances Blanc Bleu _(à compléter)_
- **Adresse** : 59 Boulevard Madeleine, Nice
- **Représentant légal** : _(à compléter)_
- **DPO** : _(à désigner — obligatoire pour traitement de données de santé à grande échelle, art. 37 RGPD)_

---

## 2. Bases légales (art. 6 + art. 9 RGPD)

| Traitement                         | Base légale art. 6         | Base légale art. 9                |
| ---------------------------------- | -------------------------- | --------------------------------- |
| Réservation de transport sanitaire | Exécution d'un contrat (b) | Soins médicaux (h)                |
| Facturation CPAM                   | Obligation légale (c)      | Soins médicaux (h)                |
| Audit log sécurité                 | Intérêt légitime (f)       | — (pas de donnée santé dans logs) |
| Notifications email/push           | Exécution du contrat (b)   | —                                 |
| Statistiques internes              | Intérêt légitime (f)       | Recherche en santé (j) si étendu  |
| OCR PMT (extraction prescription)  | Exécution du contrat (b)   | Soins médicaux (h)                |

---

## 3. Catégories de données traitées

### Patients

- Identité : nom, prénom, date de naissance, sexe, n° de sécurité sociale (NIR).
- Contact : adresse, téléphone, email.
- Santé : mobilité (ASSIS / FAUTEUIL / ALLONGE / CIVIERE), besoin oxygène, accompagnement,
  motif transport (dialyse, chimio…), prescription médicale (PMT scannée).
- Financières : factures, statut de paiement, part CPAM / part patient, RIB
  (uniquement si paiement Stripe configuré).

### Personnel (chauffeurs, dispatcher, admin)

- Identité, contact, permis de conduire, qualifications (DEA, AFGSU…),
  planning, géolocalisation pendant les missions.

### Tiers techniques

- Logs serveur : IP, user-agent, requestId, userId (si auth).
- Audit : actions sensibles (voir [security.md](security.md)).

---

## 4. Durées de conservation

| Type                        | Durée                          | Justification                    |
| --------------------------- | ------------------------------ | -------------------------------- |
| Dossier patient actif       | Durée de la relation + 5 ans   | Code de la santé publique        |
| Dossier patient inactif     | 20 ans après dernier transport | Archivage médical (R.1112-7 CSP) |
| Factures                    | 10 ans                         | Code de commerce L123-22         |
| Prescription scannée (PMT)  | Idem dossier patient           | Pièce du dossier médical         |
| Audit log sécurité          | 12 mois                        | CNIL recommandation              |
| Logs techniques (winston)   | 30 jours                       | Debug + DLP                      |
| Compte personnel ex-employé | 5 ans après départ             | Prescription prud'homale         |
| Sessions JWT révoquées      | 7 jours                        | Durée du refresh token           |

Mise en œuvre : à automatiser via un job worker `gdprPurge` (à implémenter).

---

## 5. Droits des personnes (chap. III RGPD)

### Endpoints implémentés (`/api/gdpr/*`)

| Droit                   | Endpoint                                   | Délai légal |
| ----------------------- | ------------------------------------------ | ----------- |
| Accès (art. 15)         | `GET /api/gdpr/export`                     | 1 mois      |
| Rectification (art. 16) | `PATCH /api/patients/:id` (par dispatcher) | 1 mois      |
| Effacement (art. 17)    | `DELETE /api/gdpr/account`                 | 1 mois      |
| Limitation (art. 18)    | demande manuelle au DPO                    | 1 mois      |
| Portabilité (art. 20)   | `GET /api/gdpr/export?format=json`         | 1 mois      |
| Opposition (art. 21)    | demande manuelle au DPO                    | 1 mois      |

### Anonymisation vs suppression

- **Suppression compte patient** → données identifiantes purgées, mais **traces transport
  conservées sous forme pseudonymisée** (obligation comptable + santé). Le lien avec une
  personne réelle disparaît.
- **Email du droit à l'effacement** : envoyer à `dpo@blancbleu.fr` _(à configurer)_.

### Procédure d'anonymisation administrative (Art. 17 droit à l'oubli)

**Endpoint** : `POST /api/gdpr/patients/:id/anonymize` — accès `admin` ou
`dpo` (autorisation via `authorize("admin", "dpo")` dans la route).

**Body requis** :

```json
{ "confirmReason": "Demande RGPD écrite du patient datée du 2026-05-29" }
```

`confirmReason` est obligatoire, minimum 10 caractères — sert de double
confirmation contre les anonymisations accidentelles. La raison est tracée
dans `Patient.gdpr.anonymizationReason` ET dans `AuditLog`.

**Rate limit** : 3 anonymisations max / heure par utilisateur (en CI/test :
désactivé).

**Pré-conditions** :

- Le patient ne doit pas être déjà anonymisé (→ 409 `ALREADY_ANONYMIZED`).
- Aucun transport actif ne doit lui être lié — statut hors de la whitelist
  terminale `[COMPLETED, BILLED, PAID, CANCELLED]` (→ 409 `ACTIVE_TRANSPORTS`
  avec la liste des transports bloquants). Un transport `SCHEDULED`,
  `ASSIGNED`, `EN_ROUTE_TO_PICKUP`, etc. doit d'abord être terminé ou annulé.

**Effets (irréversibles)** :

| Cible                           | Champ                                                                       | Valeur après anonymisation        |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| `Patient`                       | `nom`, `prenom`                                                             | `"[ANONYMISÉ]"`                   |
|                                 | `email`                                                                     | `"anon-{userId}@anonymise.local"` |
|                                 | `telephone`                                                                 | `"0000000000"`                    |
|                                 | `dateNaissance`                                                             | `null`                            |
|                                 | `numeroSecu`, `numeroSecuHash`                                              | `""` / `null`                     |
|                                 | `adresse`, `contactUrgence`                                                 | objets vidés                      |
|                                 | `antecedents`, `allergies`, `notes`, `preferences`, `mutuelle`              | `""`                              |
|                                 | `actif`                                                                     | `false`                           |
|                                 | `gdpr.anonymized` + `anonymizedAt` + `anonymizedBy` + `anonymizationReason` | renseignés                        |
| `Transport.patient` (sub-doc)   | `nom`, `prenom`, `telephone`                                                | sentinels (cf. ci-dessus)         |
|                                 | `antecedents`, `allergies`, `notes`                                         | `""`                              |
|                                 | `dateNaissance`                                                             | `$unset`                          |
| `Facture` (champs dénormalisés) | `patientNom`, `patientPrenom`                                               | `"[ANONYMISÉ]"`                   |
|                                 | `patientNumeroSecu`                                                         | `""`                              |
| `AuditLog`                      | nouvelle entrée `PATIENT_ANONYMIZED`                                        | + acteur + raison + ressource     |

**Ce qui est CONSERVÉ** (obligations légales) : numéro de patient
(`numeroPatient`, clé de jointure), numéros et montants des factures, IDs
de transports, journal et statusLog. Le **lien avec une personne identifiée
n'existe plus** — seules les agrégations comptables et statistiques restent
exploitables.

**Audit + observabilité** : chaque anonymisation génère une ligne
`AuditLog` indexée par `action: "PATIENT_ANONYMIZED"`, exploitable pour
les rapports DPO trimestriels (cf. `GET /api/audit?action=PATIENT_ANONYMIZED`).

**Tests de non-régression** : 7 cas couverts dans
[`server/__tests__/integration/gdpr-anonymize.test.js`](../server/__tests__/integration/gdpr-anonymize.test.js)
(401/403/400/409 × 2/200 + idempotence stricte).

---

## 6. Sécurité des données (art. 32 RGPD)

Voir [security.md](security.md) pour le détail technique.

### 6.1 Chiffrement des données médicales at-rest (art. 9 RGPD)

**Algorithme** : AES-256-GCM (IV aléatoire 96 bits, tag d'authentification 128 bits).
Implémenté dans [server/utils/encryption.js](../server/utils/encryption.js). Clé maître
fournie via `ENCRYPTION_KEY` (32 bytes base64).

**Champs chiffrés** (donnée stockée = ciphertext, déchiffrement transparent via
hooks Mongoose `pre('save')` / `post('init')`) :

| Modèle         | Champs                                            | Notes                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Patient`      | `numeroSecu`, `antecedents`, `allergies`          | `numeroSecu` + hash HMAC-SHA256 séparé pour recherche. `antecedents` / `allergies` : `select: false`.                                                                                                                                      |
| `Transport`    | `patient.antecedents`, `patient.allergies`        | Sub-document, `select: false`. Chiffrement sur hooks du sub-schema.                                                                                                                                                                        |
| `Prescription` | `commentaireDispatcher`, `notes`                  | `select: false`.                                                                                                                                                                                                                           |
| `Personnel`    | `numeroPermis`, `salaireBrutEnc`, `salaireNetEnc` | `select: false`. Les `salaire*` Number en clair sont **conservés** pour les agrégations Mongo natives ; les shadow `*Enc` sont synchronisés au save. Dette : canonicaliser vers le chiffré uniquement en refondant comptabiliteController. |

**Lecture** : les controllers/services qui ont besoin de ces champs doivent les
forcer via `.select("+antecedents +allergies")` (ou path équivalent pour les
sub-docs). Sans select, Mongoose renvoie `undefined` — privacy par défaut.

**Migration des données existantes** :

```bash
# Backup OBLIGATOIRE avant migration
mongodump --uri "$MONGO_URI" --out backup-$(date +%Y%m%d)

# Migration idempotente (skip les valeurs déjà au format iv:tag:cipher b64)
ENCRYPTION_KEY=... MONGO_URI=... npm --prefix server run db:encrypt-medical
# ou avec --dry-run pour simuler
```

Le script [server/scripts/encrypt-medical-fields.js](../server/scripts/encrypt-medical-fields.js)
bypass les hooks Mongoose (utilise `Model.collection`) pour éviter le double
chiffrement, et détecte les valeurs déjà chiffrées via le pattern format.

**Test du round-trip** : [server/**tests**/integration/encryptionMedicalFields.test.js](../server/__tests__/integration/encryptionMedicalFields.test.js)
vérifie write → ciphertext en DB → read = plaintext (et idempotence du save).

### 6.2 Autres mesures

Mesures clés RGPD :

- Chiffrement en base des champs sensibles (cf. §6.1 ci-dessus).
- TLS obligatoire en prod (délégué reverse proxy).
- Authentification à deux facteurs pour rôles admin/dispatcher/superviseur.
- Audit log complet sur actions sensibles, conservé 12 mois.
- Sauvegardes chiffrées hors-site (voir [operations.md](operations.md)).
- Cloisonnement strict mongo / redis / network bridge docker.
- Aucune donnée patient envoyée vers un service tiers (OCR fait en local, IA dispatch en local).

---

## 7. Sous-traitants (art. 28)

Recenser ici tous les sous-traitants avec accès à des données personnelles. À mettre à jour
à chaque ajout de service externe.

| Sous-traitant                                           | Données traitées                     | Localisation                      | DPA signé ?                 |
| ------------------------------------------------------- | ------------------------------------ | --------------------------------- | --------------------------- |
| Hébergeur infra (à définir : OVH, Scaleway, AWS Paris…) | Toutes                               | UE                                | À vérifier                  |
| Stripe (paiements)                                      | Identité + montants                  | UE/US (clauses contractuelles)    | Oui (DPA Stripe par défaut) |
| SMTP transactionnel (Gmail, Mailjet, Sendinblue…)       | Email, contenu emails                | UE selon fournisseur              | À vérifier                  |
| Sentry (errors)                                         | Logs techniques pseudonymisés        | UE possible (sentry.io EU region) | DPA dispo                   |
| Mapbox / OSRM / data.gouv (géocodage)                   | Adresses (pas de PII patient direct) | Variable                          | À vérifier                  |

> Aucun appel API IA externe (OpenAI, Anthropic, etc.) : tout est local (FastAPI + Tesseract).

---

## 8. Transferts hors UE

Aucun transfert hors UE par défaut. Si Stripe traite via les US : couvert par les clauses
contractuelles types (CCT) et les dernières décisions DPF (Data Privacy Framework).
À évaluer pour chaque sous-traitant.

---

## 9. Cookies & traceurs (directive ePrivacy)

- **Cookies fonctionnels** : `bb_access`, `bb_refresh` — exemptés de consentement
  (strictement nécessaires).
- **Cookies analytiques** : aucun pour l'instant.
- **Cookies tiers** : aucun.

→ Pas de bandeau cookies requis tant qu'aucun cookie non-essentiel n'est posé.
À revoir si on ajoute GA / Matomo / Hotjar.

---

## 10. Violation de données (art. 33-34)

Procédure en cas de breach :

1. **T+0** : détection. Isoler le système concerné.
2. **T+1 h** : équipe sécurité avertie + DPO.
3. **T+24 h** : qualification — nature, ampleur, données concernées, risque pour les personnes.
4. **T+72 h** : si risque pour les personnes → notification CNIL (formulaire en ligne) + notification personnes concernées si risque élevé.
5. **T+1 sem** : post-mortem + plan de remédiation.

Tenir un registre interne des violations (même celles non notifiables).

---

## 11. AIPD (analyse d'impact)

Le traitement de données de santé à grande échelle est soumis à une AIPD obligatoire (art. 35).
À réaliser et tenir à jour. Template CNIL : <https://www.cnil.fr/fr/RGPD-analyse-impact-protection-des-donnees-aipd>.

---

## 12. Registre des traitements (art. 30)

Le registre doit lister chaque finalité de traitement, base légale, catégories de personnes,
de données, destinataires, durées de conservation, mesures de sécurité.

Template à maintenir : tableur ou outil dédié (Pridatect, OneTrust, Dastra…).

---

## Contacts

- DPO : `dpo@blancbleu.fr` _(à configurer)_
- Demandes RGPD utilisateurs : `gdpr@blancbleu.fr` _(à configurer)_
- CNIL : <https://www.cnil.fr/fr/plaintes>
