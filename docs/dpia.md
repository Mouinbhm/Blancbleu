# Analyse d'impact relative à la protection des données (AIPD / DPIA)

> Document de cadrage interne — **à valider par un Délégué à la Protection
> des Données (DPO)** avant mise en production.
>
> **Statut** : version v1.0 — projet de fin d'études (POC).
> **Référence légale** : art. 35 RGPD (UE 2016/679) + délibération CNIL
> 2018-326. Une AIPD est **obligatoire** pour le traitement à grande échelle
> de données de santé (catégorie particulière, art. 9 RGPD).
>
> **Dernière révision** : voir l'historique git de ce fichier.

---

## A. Description du traitement

### A.1 Finalité

Organisation et facturation des **transports sanitaires non urgents** (VSL,
TPMR, ambulance) : dialyse, chimiothérapie, hospitalisations, consultations
spécialisées, sorties d'hospitalisation. Le service couvre la prise de
rendez-vous, le dispatch véhicule/chauffeur, le suivi temps réel du transport,
la production des pièces de facturation CPAM et le paiement du ticket
modérateur.

### A.2 Catégories de personnes concernées

| Catégorie                          | Volumétrie estimée                   | Notes                                     |
| ---------------------------------- | ------------------------------------ | ----------------------------------------- |
| **Patients**                       | quelques milliers / an en cible prod | mineurs et personnes vulnérables incluses |
| **Chauffeurs / ambulanciers**      | dizaines                             | salariés ou intérimaires                  |
| **Dispatcher / régulation**        | poignée                              | équipe interne                            |
| **Comptables**                     | poignée                              | accès facturation uniquement              |
| **Administrateurs / superviseurs** | 1-2                                  | accès complet (rôle critique)             |
| **DPO**                            | 1 (à désigner)                       | accès lecture + actions RGPD              |

### A.3 Catégories de données

| Catégorie                      | Champs concrets                                                                                              | Source                         | Sensibilité                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| **Identité**                   | nom, prénom, dateNaissance, email, téléphone                                                                 | Patient/User                   | Personnelle                                                                     |
| **Adresse**                    | rue, ville, codePostal, lat/lng                                                                              | Patient/Transport              | Personnelle                                                                     |
| **Identifiants assurance**     | numéro de sécurité sociale (NIR), caisse, mutuelle                                                           | Patient                        | **NIR = donnée à caractère particulier** (loi Informatique et Libertés art. 30) |
| **Données médicales (art. 9)** | antécédents, allergies, mobilité, oxygène, brancardage, motif transport, prescription médicale (PMT scannée) | Patient/Transport/Prescription | **Catégorie particulière**                                                      |
| **Localisation**               | positions GPS du véhicule pendant le transport                                                               | Vehicle/Transport              | Personnelle (indirecte)                                                         |
| **Données financières**        | montants, statut paiement, identifiants Stripe (PaymentIntent), pas de PAN/CVV                               | Facture                        | Personnelle                                                                     |
| **Données salariales**         | salaireBrut, salaireNet du personnel (chiffrés en shadow)                                                    | Personnel                      | Personnelle                                                                     |
| **Données de connexion**       | sessions JWT, IPs, user-agent, audit log                                                                     | RefreshToken/AuditLog          | Personnelle                                                                     |

### A.4 Bases légales

Pour chaque finalité, base art. 6 + base art. 9 si donnée de santé :

| Finalité                                                              | Base art. 6                                               | Base art. 9                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Organisation du transport sanitaire                                   | **(b)** Exécution d'un contrat                            | **(h)** Médecine préventive ou du travail, diagnostics médicaux, prise en charge sanitaire ou sociale |
| Facturation CPAM + tiers payant                                       | **(c)** Obligation légale                                 | (h)                                                                                                   |
| Conservation factures 10 ans                                          | **(c)** Obligation légale (art. L123-22 Code de commerce) | —                                                                                                     |
| Création du dossier patient mobile (consentement à la collecte santé) | **(b)** Exécution du contrat                              | **(a)** Consentement explicite (case à cocher dédiée, traçable dans `Patient.consentHistory`)         |
| Audit log sécurité                                                    | **(f)** Intérêt légitime (sécurité du SI)                 | — (pas de donnée santé dans les logs)                                                                 |
| Statistiques internes pseudonymisées                                  | (f)                                                       | (j) Recherche en santé (si étude formalisée)                                                          |
| Push notifications patient                                            | (b)                                                       | —                                                                                                     |
| OCR de la prescription médicale                                       | (b)                                                       | (h)                                                                                                   |

---

## B. Durées de conservation

Voir aussi `docs/rgpd.md` §4 pour le détail complet.

| Catégorie                   | Durée active                     | Archivage                         | Justification                                           |
| --------------------------- | -------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Facture                     | 10 ans glissants                 | —                                 | Art. L123-22 Code de commerce                           |
| Transport (entité métier)   | 5 ans après le dernier transport | —                                 | Tarification CPAM contestable jusqu'à 3 ans + marge     |
| Dossier patient actif       | Durée de la relation             | + 3 ans inactif                   | Reprise possible d'un transport CPAM dans les 3 ans     |
| Dossier patient archivé     | —                                | 20 ans après le dernier transport | Archivage médical (art. R.1112-7 CSP)                   |
| Prescription scannée (PMT)  | Idem dossier patient             | Idem                              | Pièce du dossier médical                                |
| Audit log (sécurité)        | 90 jours                         | —                                 | TTL automatique côté Mongo + recommandation CNIL        |
| Logs techniques Winston     | 30 jours                         | —                                 | Debug + dette opérationnelle                            |
| Sessions / refresh tokens   | 7 jours                          | —                                 | Durée de vie du refresh, révocation par `jti` au logout |
| Backups quotidiens chiffrés | 30 jours                         | + bascule mensuelle 12 mois       | RPO 24h, RTO 4h (cf. operations.md)                     |

**Mise en œuvre** : un worker `gdprPurge` à planifier (BullMQ cron) doit
purger les données dont la durée est expirée et générer un AuditLog
`GDPR_PURGE` par batch.

---

## C. Mesures de sécurité techniques

### C.1 Chiffrement

| Couche                    | Mesure                                                            | Détail                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **At rest — application** | AES-256-GCM                                                       | `numeroSecu`, `antecedents`, `allergies`, `commentaireDispatcher`, `notes`, `numeroPermis`, sub-doc `Transport.patient.{antecedents,allergies}` + shadow `salaireBrutEnc/salaireNetEnc`. Clé `ENCRYPTION_KEY` 32 bytes base64 hors repo. Cf. [`server/utils/encryption.js`](../server/utils/encryption.js) et `docs/rgpd.md` §6.1. |
| **At rest — DB**          | TLS Mongo + chiffrement disque côté hébergeur                     | Mongo Atlas : encryption-at-rest standard. Self-hosted : LUKS sur le volume.                                                                                                                                                                                                                                                       |
| **En transit — public**   | TLS 1.3 obligatoire                                               | Reverse proxy Nginx avec ciphers modernes. HSTS activé.                                                                                                                                                                                                                                                                            |
| **En transit — mobile**   | TLS 1.3 + SSL pinning SPKI                                        | `packages/bb_core/.../ssl_pinning.dart` — pinning public-key (résiste au renouvellement). Cf. `docs/mobile-security.md`.                                                                                                                                                                                                           |
| **Backups**               | Chiffrés côté hébergeur + clé de chiffrement applicative déportée | Restauration testée trimestriellement (à formaliser).                                                                                                                                                                                                                                                                              |

### C.2 Authentification & autorisation

- **JWT** signé HS256, durée de vie 15 min (access) + 7 jours (refresh).
- **Refresh rotation** : single-flight, révocation par `jti` au logout (cf.
  `server/models/RefreshToken.js`).
- **Cookies httpOnly** (`bb_access`, `bb_refresh`) en plus du header
  `Authorization: Bearer` pour les apps mobiles.
- **2FA TOTP optionnel** pour les rôles admin / superviseur / dispatcher
  (`server/services/twoFactorService.js`).
- **bcryptjs rounds=12** sur tous les mots de passe.
- **RBAC strict** via middleware `authorize(...roles)` — refus 403 si rôle
  non autorisé.

### C.3 Défense en profondeur

- **Rate limiting** Express + Redis (cf. `server/middleware/rateLimiter.js`)
  avec règles spécifiques sur `/api/auth/login`, `/api/gdpr/me`,
  `/api/gdpr/patients/:id/anonymize`.
- **Sanitization** : `express-mongo-sanitize` (anti NoSQL injection) +
  `xss` middleware (anti XSS sur les inputs persistés).
- **Helmet** : CSP stricte, HSTS, no-sniff, frame-ancestors deny.
- **Validation Joi** sur les payloads des endpoints sensibles.
- **Audit log centralisé** (`AuditLog`) sur actions à risque : login,
  logout, export RGPD, anonymisation, modif rôle, suppression dossier.
- **Pre-commit** Husky + lint-staged (ESLint + Prettier) — lint job CI
  bloquant.

### C.4 Observabilité

- **Sentry** (opt-in via DSN) avec `beforeSend` qui scrub PII : email,
  password, token, antécédents, allergies, numéroSécu, etc. Cf.
  `server/utils/sentry.js` et `bb_core/.../sentry_init.dart`.
- **Prometheus** `/metrics` protégé par `X-Metrics-Token` — pas de PII
  dans les métriques.
- **Request ID** corrélé via AsyncLocalStorage (cf.
  `server/middleware/requestContext.js`).

---

## D. Mesures organisationnelles

- **RBAC strict** : 6 rôles distincts (`patient`, `chauffeur`,
  `dispatcher`, `comptable`, `admin`, `dpo` — `dpo` à ajouter à
  l'enum `User.role` à la désignation). Aucun cumul implicite.
- **Privacy par défaut** : les champs `antecedents`, `allergies`,
  `numeroSecuHash`, `salaire*Enc`, `numeroPermis` ont `select: false` —
  le code doit explicitement les demander (`.select("+champ")`). Limite
  les fuites par UI ou export accidentel.
- **Journalisation des accès aux dossiers médicaux** :
  `Patient.accessHistory[]` enregistre chaque consultation
  (userId + rôle + raison + timestamp).
- **Procédure d'anonymisation effective** documentée et testée
  (cf. `docs/rgpd.md` §6.2 + 7/7 tests d'intégration). Endpoint admin
  protégé par double confirmation (`confirmReason` requis, ≥ 10 chars).
- **Désignation d'un DPO** : à formaliser avant production. Coordonnées
  publiées sur la page mentions légales et dans le footer.
- **Sensibilisation des opérateurs** : session annuelle obligatoire
  pour dispatchers et admins. Manuel `docs/security.md` à signer.
- **Procédure violation de données** : voir `docs/rgpd.md` §10
  (notification CNIL dans 72h si risque).

---

## E. Risques identifiés et mesures de mitigation

Échelle CNIL : **gravité** × **vraisemblance** ∈ {Négligeable, Limité, Important, Maximal}.

| #   | Risque                                                     | Gravité   | Vraisemblance     | Mitigation                                                                                                                                                   |
| --- | ---------------------------------------------------------- | --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Exfiltration de la base de données                         | Important | Limité            | Chiffrement at-rest AES-256-GCM sur champs sensibles + chiffrement volume + accès BDD restreint (IP allowlist + creds rotés) + backups chiffrés + audit BDD. |
| R2  | Compromission d'un token JWT                               | Important | Limité            | Durée 15 min (access), 7 jours (refresh), révocation par `jti`, rotation à chaque refresh, single-flight. SSL pinning mobile.                                |
| R3  | Compromission d'un compte admin                            | Maximal   | Limité            | 2FA TOTP obligatoire à activer pour admin (hors POC), bcrypt rounds=12, lockout après 5 échecs, audit log de tout login admin.                               |
| R4  | Injection PMT malveillant (XSS / RCE via upload PDF/image) | Important | Limité            | Validation MIME stricte + magic bytes + taille max 10 MB + ClamAV en P11.1 (à venir). Stockage hors webroot. Sanitization du texte OCR avant persistance.    |
| R5  | Accès illégitime au dossier d'un patient par un opérateur  | Limité    | Limité            | `Patient.accessHistory` enregistre chaque consultation. Détection d'anomalie (alerte si > N consultations/jour par un user) à mettre en place.               |
| R6  | Fuite de données via les logs (Sentry, Winston)            | Limité    | Limité            | `BbLog` no-op en release + scrub des clés sensibles + Sentry `beforeSend` scrub PII + pas de body request dans les logs.                                     |
| R7  | Transfert hors UE non maîtrisé (FCM, Sentry US)            | Important | Important         | SCC en place (DPA Google + Sentry). À documenter dans le registre. Sentry EU region activable (à valider).                                                   |
| R8  | Perte de contrôle d'un sous-traitant (Stripe, FCM)         | Limité    | Négligeable       | DPA signés, audit annuel, plan de migration documenté (architecture découplée — Stripe et FCM sont gracefully dégradables).                                  |
| R9  | Anonymisation incomplète (sub-doc Transport en clair)      | Important | Limité            | Procédure d'anonymisation effective documentée + 7 tests d'intégration vérifient le nettoyage des sub-docs `Transport.patient.antecedents/allergies`.        |
| R10 | Hébergement non-HDS                                        | Maximal   | Important si prod | Voir `docs/rgpd.md` §13 — bascule HDS obligatoire avant production. Le POC actuel n'héberge pas de données de santé réelles.                                 |

---

## F. Sous-traitants (registre détaillé)

Voir aussi `docs/rgpd.md` §7 (vue synthèse) et
`docs/registre-traitements.md`.

| Sous-traitant                                              | Données traitées                                                                                | Localisation                                        | Encadrement juridique                                                          | Statut DPA                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| **MongoDB Atlas** (cible prod)                             | Toutes données patient + transport + facture                                                    | UE (région `eu-west-1` Paris ou `eu-west-2` Dublin) | ISO 27001, SOC 2 Type II, certif RGPD. Pas de transfert hors UE configuré.     | DPA Atlas par défaut, à signer formellement. |
| **MongoDB self-hosted** (POC)                              | Idem                                                                                            | Localisation maîtrisée (Docker on-premise)          | Pas de sous-traitant — responsabilité directe.                                 | N/A                                          |
| **Stripe**                                                 | Identité patient + montants + email + PaymentIntent. **Aucune donnée carte stockée côté nous.** | UE/US (Standard Contractual Clauses + DPF)          | PCI-DSS Level 1, certif RGPD.                                                  | DPA Stripe inclus dans CGU, à archiver.      |
| **Firebase FCM** (Google)                                  | Identifiant FCM device + payload notif (titre, body — pas de donnée santé)                      | États-Unis                                          | SCC (Standard Contractual Clauses) signées via DPA Google Cloud. À documenter. | DPA Google Cloud — à valider.                |
| **Sentry** (observabilité)                                 | Logs techniques pseudonymisés (requestId, route, erreur) — PII scrubbée.                        | Région EU configurable (sentry.io EU).              | DPA Sentry disponible. SCC si fallback US.                                     | À signer.                                    |
| **OSRM** (routage)                                         | Adresses (anonymisées avant envoi : pas de patientId)                                           | Self-hosted ou service public                       | Aucun PII direct.                                                              | N/A                                          |
| **BAN / data.gouv.fr**                                     | Adresses à géocoder                                                                             | France                                              | Service public, pas de sous-traitance commerciale.                             | N/A                                          |
| **SMTP transactionnel** (à choisir : OVH, Mailjet, Brevo…) | Email + contenu emails RGPD                                                                     | UE selon fournisseur                                | Prefer fournisseur EU.                                                         | À signer après sélection.                    |

**Aucun appel API IA externe** (OpenAI, Anthropic, etc.). Tout traitement IA
est local (FastAPI + Tesseract + XGBoost). Cf. `ai-service/MODEL_CARD.md`.

---

## G. Droits des personnes — mise en œuvre opérationnelle

| Droit                                  | Endpoint / procédure                                                                                                              | Délai légal | Statut                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| **Information** (art. 13-14)           | Mentions légales + politique de confidentialité (à publier sur le site)                                                           | —           | À publier                             |
| **Accès** (art. 15)                    | `GET /api/gdpr/export` (utilisateur authentifié)                                                                                  | 1 mois      | ✅ Implémenté                         |
| **Rectification** (art. 16)            | `PATCH /api/patients/:id` via dispatcher après vérif identité                                                                     | 1 mois      | ✅ Implémenté                         |
| **Effacement** (art. 17) — self        | `DELETE /api/gdpr/me` (confirmation par mot de passe)                                                                             | 1 mois      | ✅ Implémenté                         |
| **Effacement** (art. 17) — admin / DPO | `POST /api/gdpr/patients/:id/anonymize` (confirmReason ≥ 10 chars, rôle admin/dpo)                                                | 1 mois      | ✅ Implémenté + 7 tests d'intégration |
| **Limitation** (art. 18)               | Demande manuelle au DPO → flag `gdpr.processingRestricted` (à ajouter) + exclusion des traitements automatisés                    | 1 mois      | À implémenter                         |
| **Portabilité** (art. 20)              | `GET /api/gdpr/export` (format JSON exploitable)                                                                                  | 1 mois      | ✅ Implémenté                         |
| **Opposition** (art. 21)               | Demande manuelle au DPO → désactivation des traitements basés sur intérêt légitime (statistiques, notifications non-essentielles) | 1 mois      | À implémenter (flag `gdpr.objected`)  |
| **Décisions automatisées** (art. 22)   | L'auto-dispatch IA est **human-in-the-loop** — un dispatcher valide systématiquement. Aucune décision purement automatisée.       | —           | ✅ By design                          |

### G.1 Procédure de demande RGPD

1. Demande reçue à `gdpr@blancbleu.fr` ou via le formulaire en ligne.
2. **Vérification d'identité** : pièce d'identité + selfie (purgés après
   traitement).
3. **Qualification** par le DPO (≤ 5 jours) — type de droit, urgence,
   recevabilité.
4. **Exécution** technique (≤ 25 jours) — endpoints listés ci-dessus ou
   procédure manuelle.
5. **Réponse au demandeur** dans les 30 jours calendaires, prolongeable
   de 2 mois en cas de complexité (notification motivée).
6. **Traçabilité** : `AuditLog` action `GDPR_RIGHT_EXERCISED`.

### G.2 Représentation du DPO

> **À désigner.** La désignation est **obligatoire** pour le traitement à
> grande échelle de données de santé (art. 37 RGPD). Coordonnées à
> publier dans les mentions légales avant ouverture prod.

---

## Annexes

- `docs/rgpd.md` — cadrage RGPD opérationnel
- `docs/registre-traitements.md` — registre art. 30
- `docs/security.md` — détail technique sécurité
- `docs/mobile-security.md` — sécurité apps Flutter
- `docs/operations.md` — DRP, backups, monitoring
- `server/services/patientGdprService.js` — implémentation des droits
- `server/__tests__/integration/gdpr-anonymize.test.js` — preuves de non-régression
