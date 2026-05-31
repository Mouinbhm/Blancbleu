# Registre des activités de traitement (art. 30 RGPD)

> Document à tenir à jour à chaque modification d'une finalité, d'un
> sous-traitant ou d'une catégorie de données. Version réduite — le registre
> complet sera tenu dans un outil dédié (Pridatect, OneTrust, Dastra…) après
> désignation du DPO.
>
> **Responsable de traitement** : Ambulances Blanc Bleu — _coordonnées à
> compléter, cf. `docs/rgpd.md` §1._
>
> **DPO** : à désigner avant mise en production.

---

## T1. Organisation des transports sanitaires

| Champ                       | Valeur                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Prise de rendez-vous, dispatch véhicule/chauffeur, exécution et suivi en temps réel du transport sanitaire non urgent.                                |
| **Catégories de personnes** | Patients (dont mineurs et personnes vulnérables), chauffeurs/ambulanciers, dispatchers.                                                               |
| **Catégories de données**   | Identité, contact, adresse, mobilité, équipements requis (oxygène, brancardage), motif transport (donnée santé art. 9), localisation GPS du véhicule. |
| **Destinataires internes**  | Dispatcher (planning), chauffeur (mission affectée), admin (supervision), comptable (lecture seule pour facturation).                                 |
| **Destinataires externes**  | OSRM (adresses uniquement, sans patientId), BAN/data.gouv.fr (adresses).                                                                              |
| **Transferts hors UE**      | Aucun.                                                                                                                                                |
| **Base légale art. 6**      | (b) Exécution du contrat.                                                                                                                             |
| **Base légale art. 9**      | (h) Prise en charge sanitaire.                                                                                                                        |
| **Durée de conservation**   | Transport : 5 ans après le transport ; archivage médical 20 ans (R.1112-7 CSP).                                                                       |
| **Mesures de sécurité**     | RBAC + audit log + chiffrement at-rest sur antécédents/allergies + TLS 1.3 + SSL pinning mobile.                                                      |

---

## T2. Facturation et tiers payant CPAM

| Champ                       | Valeur                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Production de factures CPAM, encaissement du ticket modérateur via Stripe, suivi des impayés.                                                                             |
| **Catégories de personnes** | Patients, comptables.                                                                                                                                                     |
| **Catégories de données**   | Identité, numéro de sécurité sociale (NIR), montants, IBAN si paiement SEPA, IDs Stripe (`PaymentIntent`, `Charge`). **Aucune donnée carte (PAN/CVV) stockée chez nous.** |
| **Destinataires internes**  | Comptable, admin.                                                                                                                                                         |
| **Destinataires externes**  | Stripe (paiement, sous-traitant).                                                                                                                                         |
| **Transferts hors UE**      | Stripe : UE/US (SCC + DPF).                                                                                                                                               |
| **Base légale art. 6**      | (c) Obligation légale (Code de la sécurité sociale + Code de commerce).                                                                                                   |
| **Base légale art. 9**      | (h) — uniquement le motif transport et la prestation, pas les détails médicaux.                                                                                           |
| **Durée de conservation**   | **10 ans** glissants (art. L123-22 Code de commerce).                                                                                                                     |
| **Mesures de sécurité**     | NIR chiffré AES-256-GCM + hash HMAC pour recherche, audit log sur toute action `INVOICE_*`, accès comptable limité au scope financier (privacy filter).                   |

---

## T3. Dossier médical patient

| Champ                       | Valeur                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Constitution et tenue du dossier patient pour assurer la continuité des soins (antécédents, allergies, prescriptions).                                   |
| **Catégories de personnes** | Patients.                                                                                                                                                |
| **Catégories de données**   | Antécédents, allergies, mobilité, contact d'urgence, médecin traitant, mutuelle, prescription médicale (PMT scannée). **Catégorie particulière art. 9.** |
| **Destinataires internes**  | Dispatcher (vue résumée), chauffeur (vue mission limitée — pas d'antécédents), admin (vue complète sur demande tracée), DPO.                             |
| **Destinataires externes**  | Aucun. OCR PMT en local (Tesseract + spaCy, pas d'envoi externe).                                                                                        |
| **Transferts hors UE**      | Aucun.                                                                                                                                                   |
| **Base légale art. 6**      | (b) Exécution du contrat de transport.                                                                                                                   |
| **Base légale art. 9**      | (h) Prise en charge sanitaire **+** (a) Consentement explicite à la création du dossier (case dédiée mobile, traçable dans `Patient.consentHistory`).    |
| **Durée de conservation**   | Active : durée de la relation + 3 ans inactif. Archivage : 20 ans (R.1112-7 CSP).                                                                        |
| **Mesures de sécurité**     | Chiffrement at-rest AES-256-GCM (antécédents, allergies, PMT), `select: false` par défaut, journalisation `Patient.accessHistory` à chaque consultation. |

---

## T4. Authentification et gestion des comptes

| Champ                       | Valeur                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Création de comptes utilisateurs, authentification, gestion des sessions et 2FA.                                                                    |
| **Catégories de personnes** | Patients (compte mobile), chauffeurs (compte mobile), dispatchers/admin (compte web).                                                               |
| **Catégories de données**   | Email, mot de passe (bcrypt rounds=12), secret TOTP chiffré, backup codes hashés, refresh tokens (`jti`), IP de connexion, user-agent.              |
| **Destinataires internes**  | Admin (création de comptes).                                                                                                                        |
| **Destinataires externes**  | Aucun.                                                                                                                                              |
| **Transferts hors UE**      | Aucun.                                                                                                                                              |
| **Base légale art. 6**      | (b) Exécution du contrat.                                                                                                                           |
| **Base légale art. 9**      | — (pas de donnée santé).                                                                                                                            |
| **Durée de conservation**   | Compte actif : durée de la relation. Refresh token : 7 jours, révocation par `jti` au logout. Compte ex-employé : 5 ans (prescription prud'homale). |
| **Mesures de sécurité**     | bcrypt rounds=12, 2FA TOTP (obligatoire admin), rate limiter `/auth/login`, audit log de toute connexion admin.                                     |

---

## T5. Notifications transactionnelles

| Champ                       | Valeur                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Notifier le patient des changements de statut de son transport et le chauffeur des nouvelles missions.                              |
| **Catégories de personnes** | Patients, chauffeurs.                                                                                                               |
| **Catégories de données**   | Adresse email, numéro de téléphone, token FCM device, contenu de la notif (titre, body — **pas de donnée santé** dans le payload).  |
| **Destinataires internes**  | —                                                                                                                                   |
| **Destinataires externes**  | Firebase FCM (Google), SMTP transactionnel (fournisseur à choisir).                                                                 |
| **Transferts hors UE**      | FCM : États-Unis (SCC via DPA Google Cloud).                                                                                        |
| **Base légale art. 6**      | (b) Exécution du contrat (notifications essentielles : assignation, arrivée chauffeur).                                             |
| **Base légale art. 9**      | — (les notifs ne contiennent jamais de donnée santé, cf. mobile-security.md §4).                                                    |
| **Durée de conservation**   | Token FCM : durée de la session de l'app. Logs d'envoi : 90 jours.                                                                  |
| **Mesures de sécurité**     | Canal critique séparé pour `transport_assigned` et `shift_forced_end`. Payload scrubé par `Sentry.beforeSend` si remonté en erreur. |

---

## T6. Audit & journalisation sécurité

| Champ                       | Valeur                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Tracer les actions sensibles (login, exports, anonymisations, modifications de rôle) pour la sécurité du SI et la conformité. |
| **Catégories de personnes** | Tous utilisateurs authentifiés.                                                                                               |
| **Catégories de données**   | userId, rôle, action, ressource, timestamp, IP, requestId. **Pas de donnée santé dans les logs.**                             |
| **Destinataires internes**  | DPO, admin (lecture), équipe sécurité.                                                                                        |
| **Destinataires externes**  | Aucun (logs locaux). Sentry pour les erreurs uniquement, avec scrub PII.                                                      |
| **Transferts hors UE**      | Sentry : EU region à activer ; fallback US sous SCC.                                                                          |
| **Base légale art. 6**      | (f) Intérêt légitime (sécurité du SI).                                                                                        |
| **Base légale art. 9**      | —                                                                                                                             |
| **Durée de conservation**   | 90 jours (TTL Mongo) — recommandation CNIL.                                                                                   |
| **Mesures de sécurité**     | Index hashé sur `userId`, accès limité au DPO et admin, immuable (pas d'UPDATE/DELETE applicatif).                            |

---

## T7. Recrutement et gestion du personnel

| Champ                       | Valeur                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalité**                | Tenue du registre du personnel ambulancier, planification des shifts, calcul de la paie.                                                          |
| **Catégories de personnes** | Chauffeurs, ambulanciers, dispatchers, admin.                                                                                                     |
| **Catégories de données**   | Identité, contact, numéro de permis (chiffré), certifications (DEA, AFGSU), salaire brut/net (Number en clair pour agrégations + shadow chiffré). |
| **Destinataires internes**  | RH / admin, comptable (paie).                                                                                                                     |
| **Destinataires externes**  | Aucun à ce jour (à compléter si externalisation paie).                                                                                            |
| **Transferts hors UE**      | Aucun.                                                                                                                                            |
| **Base légale art. 6**      | (b) Exécution du contrat de travail + (c) Obligation légale (déclarations sociales).                                                              |
| **Base légale art. 9**      | —                                                                                                                                                 |
| **Durée de conservation**   | Pendant l'emploi + 5 ans (prescription prud'homale + obligations comptables).                                                                     |
| **Mesures de sécurité**     | RBAC `admin` + `comptable` uniquement, `select: false` sur numéroPermis et salaire shadow, audit sur modification salaire.                        |

---

## Synthèse — flux de données critiques

| Flux                   | Direction      | Données                                         | Protocole                   | Encadrement               |
| ---------------------- | -------------- | ----------------------------------------------- | --------------------------- | ------------------------- |
| Mobile patient ↔ API   | bidirectionnel | Identité, RDV, position GPS (suivi)             | HTTPS TLS 1.3 + SSL pinning | Cookies httpOnly + Bearer |
| Mobile chauffeur → API | upstream       | Position GPS, statut mission, signature patient | HTTPS + WS                  | idem                      |
| API → Stripe           | upstream       | NIR (hash), montant, email                      | HTTPS                       | DPA Stripe                |
| API → FCM              | upstream       | Token device + payload sans PII santé           | HTTPS                       | DPA Google + SCC          |
| API → Sentry           | upstream       | Logs scrubés (pas de PII)                       | HTTPS                       | DPA + scrub `beforeSend`  |
| API → OSRM/BAN         | upstream       | Adresses sans patientId                         | HTTPS                       | Service public            |
| Backups → cold storage | upstream       | Dump Mongo chiffré                              | scp/rsync TLS               | À formaliser              |

---

## Mise à jour

| Date       | Auteur           | Modification                   |
| ---------- | ---------------- | ------------------------------ |
| 2026-05-29 | Équipe BlancBleu | Version v1.0 — création (POC). |
