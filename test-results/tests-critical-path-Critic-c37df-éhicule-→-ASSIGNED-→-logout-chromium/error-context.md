# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\critical-path.spec.js >> Critical path dispatcher >> login → liste → ouvre transport SCHEDULED → assigne véhicule → ASSIGNED → logout
- Location: e2e\tests\critical-path.spec.js:52:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('transport-card').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByTestId('transport-card').first()

```

```yaml
- complementary:
    - text: airport_shuttle Ambulances Blanc Bleu
    - paragraph: NICE · TRANSPORT SANITAIRE
    - navigation:
        - paragraph: Opérations
        - link "dashboard Tableau de bord":
            - /url: /dashboard
        - link "directions_car Transports 2":
            - /url: /transports
        - link "smart_toy Auto-dispatch 1":
            - /url: /auto-dispatch
        - link "calendar_month Planning":
            - /url: /planning
        - link "location_on Suivi en direct":
            - /url: /suivi-en-direct
        - link "local_fire_department Heatmap":
            - /url: /carte-analytique
        - link "schedule Shifts":
            - /url: /shifts
        - link "personal_injury Patients":
            - /url: /patients
        - paragraph: Gestion
        - link "airport_shuttle Flotte":
            - /url: /flotte
        - link "badge Personnel":
            - /url: /personnel
        - link "account_balance_wallet Comptabilité":
            - /url: /factures
        - link "psychology Aide IA":
            - /url: /aide-ia
    - text: location_on 59 BD MADELEINE, NICE call 04 93 00 00 00 MD
    - paragraph: Marie Dupont
    - paragraph: "SHIFT: 00:00:14"
    - button "logout"
    - text: notifications_off Notifications bloquées — autorisez-les dans les paramètres du navigateur TEMPS RÉEL ACTIF
- banner:
    - heading "Transports — Gestion des transports" [level=1]
    - paragraph: Ambulances Blanc Bleu · Nice, Alpes-Maritimes
    - text: jeu. 28 mai 2026
    - button "Notifications": notifications 2
    - text: MD
- main:
    - heading "Transports" [level=1]
    - paragraph: 0 transport(s)
    - button "add Nouveau transport"
    - textbox "Rechercher un patient…"
    - combobox:
        - option "Tous les statuts" [selected]
        - option "Demandé"
        - option "Confirmé"
        - option "Planifié"
        - option "Assigné"
        - option "Chauffeur accepté"
        - option "Chauffeur refusé"
        - option "En route"
        - option "Sur place"
        - option "Patient à bord"
        - option "Arrivé destination"
        - option "Attente sur place"
        - option "Retour base"
        - option "Terminé"
        - option "Facturation en cours"
        - option "Facturé CPAM"
        - option "Payé"
        - option "Annulé"
        - option "Non présenté"
        - option "Reprogrammé"
        - option "Échec"
    - combobox:
        - option "Tous les motifs" [selected]
        - option "Dialyse"
        - option "Chimiothérapie"
        - option "Radiothérapie"
        - option "Consultation"
        - option "Hospitalisation"
        - option "Sortie hospitalisation"
        - option "Rééducation"
        - option "Analyse"
        - option "Autre"
    - combobox:
        - option "Tous les types" [selected]
        - option "VSL"
        - option "Ambulance"
        - option "TPMR"
    - textbox
    - text: directions_car
    - paragraph: Aucun transport trouvé
    - button "Créer un transport"
- button "forum"
- button "Open Tanstack query devtools":
    - img
```

# Test source

```ts
  1   | /**
  2   |  * BlancBleu — E2E critical path (dispatcher).
  3   |  *
  4   |  * Stratégie de stabilité :
  5   |  *   - Login + navigation + logout : via UI (data-testid, pas de selecteurs
  6   |  *     fragiles).
  7   |  *   - Création/assignation : via API REST de Playwright (`request`) — la
  8   |  *     création par le wizard 5-étapes a un taux de flake non négligeable
  9   |  *     (validation, OCR, race conditions sur le contexte React) ; l'objectif
  10  |  *     critique est de prouver que le pipeline auth→liste→assignation→statut
  11  |  *     fonctionne, pas de tester le wizard lui-même.
  12  |  *
  13  |  * Pré-requis (assuré par le seed standard `npm --prefix server run seed`) :
  14  |  *   - utilisateur dispatcher@blancbleu.fr / dispatcher123
  15  |  *   - au moins 1 véhicule Disponible
  16  |  *   - au moins 1 transport en statut SCHEDULED
  17  |  */
  18  |
  19  | const { test, expect } = require("@playwright/test");
  20  | const { TEST_USERS } = require("../fixtures/auth");
  21  |
  22  | const SCHEDULED_STATUS = "SCHEDULED";
  23  | const ASSIGNED_STATUS = "ASSIGNED";
  24  |
  25  | async function loginViaUi(page) {
  26  |   const { email, password } = TEST_USERS.dispatcher;
  27  |   await page.goto("/login");
  28  |   await page.getByTestId("login-email").fill(email);
  29  |   await page.getByTestId("login-password").fill(password);
  30  |   await page.getByTestId("login-submit").click();
  31  |   // Le 2FA n'est PAS activé sur le compte dispatcher seedé — on attend
  32  |   // directement /dashboard. Si 2FA était requis, le test échouerait clairement
  33  |   // (et il faudrait désactiver 2FA sur le compte E2E plutôt que d'ajouter un
  34  |   // skip ici qui masquerait des régressions auth).
  35  |   await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  36  | }
  37  |
  38  | async function logoutViaUi(page) {
  39  |   // 2 boutons logout possibles (sidebar collapsed / expanded) — on prend
  40  |   // le premier visible.
  41  |   const logoutButton = page.getByTestId("logout-button").first();
  42  |   const logoutAvatar = page.getByTestId("logout-avatar").first();
  43  |   if (await logoutButton.isVisible().catch(() => false)) {
  44  |     await logoutButton.click();
  45  |   } else {
  46  |     await logoutAvatar.click();
  47  |   }
  48  |   await page.waitForURL(/\/login/, { timeout: 10_000 });
  49  | }
  50  |
  51  | test.describe("Critical path dispatcher", () => {
  52  |   test("login → liste → ouvre transport SCHEDULED → assigne véhicule → ASSIGNED → logout", async ({
  53  |     page,
  54  |     request,
  55  |   }) => {
  56  |     // ── 1. LOGIN UI ──────────────────────────────────────────────────────
  57  |     await loginViaUi(page);
  58  |     expect(page.url()).toContain("/dashboard");
  59  |
  60  |     // ── 2. LISTE TRANSPORTS ──────────────────────────────────────────────
  61  |     await page.goto("/transports");
  62  |     // Attend qu'au moins une carte transport apparaisse — le seed garantit ≥1
  63  |     // transport SCHEDULED. data-testid="transport-card" ajouté côté React.
> 64  |     await expect(page.getByTestId("transport-card").first()).toBeVisible({
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  65  |       timeout: 15_000,
  66  |     });
  67  |
  68  |     // Sélectionne un transport SCHEDULED (data-transport-statut sur la card).
  69  |     const scheduledCard = page
  70  |       .locator(`[data-testid="transport-card"][data-transport-statut="${SCHEDULED_STATUS}"]`)
  71  |       .first();
  72  |     await expect(scheduledCard).toBeVisible({ timeout: 10_000 });
  73  |
  74  |     const transportNumero = await scheduledCard.getAttribute("data-transport-numero");
  75  |     expect(transportNumero).toMatch(/^TRS-/);
  76  |
  77  |     // ── 3. OUVRE LE DÉTAIL ───────────────────────────────────────────────
  78  |     await scheduledCard.click();
  79  |     await page.waitForURL(/\/transports\/[0-9a-f]{24}/, { timeout: 10_000 });
  80  |
  81  |     // Le numéro du transport doit apparaître quelque part sur la page de détail.
  82  |     await expect(page.getByText(transportNumero)).toBeVisible({ timeout: 10_000 });
  83  |
  84  |     // Extrait l'ID Mongo de l'URL pour les appels API.
  85  |     const match = page.url().match(/\/transports\/([0-9a-f]{24})/);
  86  |     expect(match).not.toBeNull();
  87  |     const transportId = match[1];
  88  |
  89  |     // ── 4. ASSIGNATION VIA API (stable, déterministe) ────────────────────
  90  |     // Les cookies httpOnly du login UI sont déjà dans le context Playwright,
  91  |     // donc `request` les ré-utilise automatiquement. On récupère un véhicule
  92  |     // "Disponible" puis on POST l'assignation via le contrôleur Express.
  93  |     const vehiclesRes = await request.get("/api/vehicles?statut=Disponible&limit=10");
  94  |     expect(vehiclesRes.ok()).toBeTruthy();
  95  |     const vehiclesBody = await vehiclesRes.json();
  96  |     const vehicles = vehiclesBody.vehicles || vehiclesBody;
  97  |     expect(Array.isArray(vehicles)).toBeTruthy();
  98  |     expect(vehicles.length).toBeGreaterThan(0);
  99  |     const vehiculeId = vehicles[0]._id;
  100 |
  101 |     const assignRes = await request.post(`/api/transports/${transportId}/assigner`, {
  102 |       data: { vehiculeId },
  103 |     });
  104 |     // Tolère 200 (assigné OK) ou 409 (déjà assigné par un run précédent — le
  105 |     // seed peut avoir laissé le transport en ASSIGNED ; on continue, le check
  106 |     // de statut ci-dessous validera l'état final).
  107 |     expect([200, 409]).toContain(assignRes.status());
  108 |
  109 |     // ── 5. VÉRIFIE LE STATUT ASSIGNED ────────────────────────────────────
  110 |     // Reload de la liste — le statut sur la card doit être ASSIGNED.
  111 |     await page.goto("/transports");
  112 |     const updatedCard = page
  113 |       .locator(`[data-testid="transport-card"][data-transport-numero="${transportNumero}"]`)
  114 |       .first();
  115 |     await expect(updatedCard).toBeVisible({ timeout: 15_000 });
  116 |     await expect(updatedCard).toHaveAttribute("data-transport-statut", ASSIGNED_STATUS, {
  117 |       timeout: 10_000,
  118 |     });
  119 |
  120 |     // ── 6. LOGOUT UI ─────────────────────────────────────────────────────
  121 |     await logoutViaUi(page);
  122 |     expect(page.url()).toContain("/login");
  123 |   });
  124 | });
  125 |
```
