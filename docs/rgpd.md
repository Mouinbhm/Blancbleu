# RGPD — BlancBleu

Conformité au Règlement Général sur la Protection des Données (UE 2016/679).
**Données traitées** : données de santé (catégorie particulière, art. 9 RGPD).

> Note : ce document est un cadrage opérationnel à valider par un DPO.
> Il ne se substitue pas à l'analyse d'impact (AIPD) requise pour des données de santé.

---

## 1. Responsable de traitement

- **Raison sociale** : Ambulances Blanc Bleu *(à compléter)*
- **Adresse** : 59 Boulevard Madeleine, Nice
- **Représentant légal** : *(à compléter)*
- **DPO** : *(à désigner — obligatoire pour traitement de données de santé à grande échelle, art. 37 RGPD)*

---

## 2. Bases légales (art. 6 + art. 9 RGPD)

| Traitement | Base légale art. 6 | Base légale art. 9 |
|---|---|---|
| Réservation de transport sanitaire | Exécution d'un contrat (b) | Soins médicaux (h) |
| Facturation CPAM | Obligation légale (c) | Soins médicaux (h) |
| Audit log sécurité | Intérêt légitime (f) | — (pas de donnée santé dans logs) |
| Notifications email/push | Exécution du contrat (b) | — |
| Statistiques internes | Intérêt légitime (f) | Recherche en santé (j) si étendu |
| OCR PMT (extraction prescription) | Exécution du contrat (b) | Soins médicaux (h) |

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

| Type | Durée | Justification |
|---|---|---|
| Dossier patient actif | Durée de la relation + 5 ans | Code de la santé publique |
| Dossier patient inactif | 20 ans après dernier transport | Archivage médical (R.1112-7 CSP) |
| Factures | 10 ans | Code de commerce L123-22 |
| Prescription scannée (PMT) | Idem dossier patient | Pièce du dossier médical |
| Audit log sécurité | 12 mois | CNIL recommandation |
| Logs techniques (winston) | 30 jours | Debug + DLP |
| Compte personnel ex-employé | 5 ans après départ | Prescription prud'homale |
| Sessions JWT révoquées | 7 jours | Durée du refresh token |

Mise en œuvre : à automatiser via un job worker `gdprPurge` (à implémenter).

---

## 5. Droits des personnes (chap. III RGPD)

### Endpoints implémentés (`/api/gdpr/*`)

| Droit | Endpoint | Délai légal |
|---|---|---|
| Accès (art. 15) | `GET /api/gdpr/export` | 1 mois |
| Rectification (art. 16) | `PATCH /api/patients/:id` (par dispatcher) | 1 mois |
| Effacement (art. 17) | `DELETE /api/gdpr/account` | 1 mois |
| Limitation (art. 18) | demande manuelle au DPO | 1 mois |
| Portabilité (art. 20) | `GET /api/gdpr/export?format=json` | 1 mois |
| Opposition (art. 21) | demande manuelle au DPO | 1 mois |

### Anonymisation vs suppression

- **Suppression compte patient** → données identifiantes purgées, mais **traces transport
  conservées sous forme pseudonymisée** (obligation comptable + santé). Le lien avec une
  personne réelle disparaît.
- **Email du droit à l'effacement** : envoyer à `dpo@blancbleu.fr` *(à configurer)*.

---

## 6. Sécurité des données (art. 32 RGPD)

Voir [security.md](security.md) pour le détail technique.

Mesures clés RGPD :
- Chiffrement en base des champs sensibles (NIR, secrets 2FA) via AES-256-GCM.
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

| Sous-traitant | Données traitées | Localisation | DPA signé ? |
|---|---|---|---|
| Hébergeur infra (à définir : OVH, Scaleway, AWS Paris…) | Toutes | UE | À vérifier |
| Stripe (paiements) | Identité + montants | UE/US (clauses contractuelles) | Oui (DPA Stripe par défaut) |
| SMTP transactionnel (Gmail, Mailjet, Sendinblue…) | Email, contenu emails | UE selon fournisseur | À vérifier |
| Sentry (errors) | Logs techniques pseudonymisés | UE possible (sentry.io EU region) | DPA dispo |
| Mapbox / OSRM / data.gouv (géocodage) | Adresses (pas de PII patient direct) | Variable | À vérifier |

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

- DPO : `dpo@blancbleu.fr` *(à configurer)*
- Demandes RGPD utilisateurs : `gdpr@blancbleu.fr` *(à configurer)*
- CNIL : <https://www.cnil.fr/fr/plaintes>
