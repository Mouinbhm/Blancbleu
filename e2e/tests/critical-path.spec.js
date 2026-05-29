/**
 * BlancBleu — E2E critical path (dispatcher).
 *
 * Stratégie de stabilité :
 *   - Login + navigation + logout : via UI (data-testid, pas de selecteurs
 *     fragiles).
 *   - Création/assignation : via API REST de Playwright (`request`) — la
 *     création par le wizard 5-étapes a un taux de flake non négligeable
 *     (validation, OCR, race conditions sur le contexte React) ; l'objectif
 *     critique est de prouver que le pipeline auth→liste→assignation→statut
 *     fonctionne, pas de tester le wizard lui-même.
 *
 * Pré-requis (assuré par le seed standard `npm --prefix server run seed`) :
 *   - utilisateur dispatcher@blancbleu.fr / dispatcher123
 *   - au moins 1 véhicule Disponible
 *   - au moins 1 transport en statut SCHEDULED
 */

const { test, expect } = require("@playwright/test");
const { TEST_USERS } = require("../fixtures/auth");

const SCHEDULED_STATUS = "SCHEDULED";
const ASSIGNED_STATUS = "ASSIGNED";

async function loginViaUi(page) {
  const { email, password } = TEST_USERS.dispatcher;
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  // Le 2FA n'est PAS activé sur le compte dispatcher seedé — on attend
  // directement /dashboard. Si 2FA était requis, le test échouerait clairement
  // (et il faudrait désactiver 2FA sur le compte E2E plutôt que d'ajouter un
  // skip ici qui masquerait des régressions auth).
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

async function logoutViaUi(page) {
  // 2 boutons logout possibles (sidebar collapsed / expanded) — on prend
  // le premier visible.
  const logoutButton = page.getByTestId("logout-button").first();
  const logoutAvatar = page.getByTestId("logout-avatar").first();
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
  } else {
    await logoutAvatar.click();
  }
  await page.waitForURL(/\/login/, { timeout: 10_000 });
}

test.describe("Critical path dispatcher", () => {
  test("login → liste → ouvre transport SCHEDULED → assigne véhicule → ASSIGNED → logout", async ({
    page,
    request,
  }) => {
    // ── 1. LOGIN UI ──────────────────────────────────────────────────────
    await loginViaUi(page);
    expect(page.url()).toContain("/dashboard");

    // ── 2. LISTE TRANSPORTS ──────────────────────────────────────────────
    await page.goto("/transports");
    // Attend qu'au moins une carte transport apparaisse — le seed garantit ≥1
    // transport SCHEDULED. data-testid="transport-card" ajouté côté React.
    await expect(page.getByTestId("transport-card").first()).toBeVisible({
      timeout: 15_000,
    });

    // Sélectionne un transport SCHEDULED (data-transport-statut sur la card).
    const scheduledCard = page
      .locator(`[data-testid="transport-card"][data-transport-statut="${SCHEDULED_STATUS}"]`)
      .first();
    await expect(scheduledCard).toBeVisible({ timeout: 10_000 });

    const transportNumero = await scheduledCard.getAttribute("data-transport-numero");
    expect(transportNumero).toMatch(/^TRS-/);

    // ── 3. OUVRE LE DÉTAIL ───────────────────────────────────────────────
    await scheduledCard.click();
    await page.waitForURL(/\/transports\/[0-9a-f]{24}/, { timeout: 10_000 });

    // Le numéro du transport doit apparaître quelque part sur la page de détail.
    await expect(page.getByText(transportNumero)).toBeVisible({ timeout: 10_000 });

    // Extrait l'ID Mongo de l'URL pour les appels API.
    const match = page.url().match(/\/transports\/([0-9a-f]{24})/);
    expect(match).not.toBeNull();
    const transportId = match[1];

    // ── 4. ASSIGNATION VIA API (stable, déterministe) ────────────────────
    // Les cookies httpOnly du login UI sont déjà dans le context Playwright,
    // donc `request` les ré-utilise automatiquement. On récupère un véhicule
    // "Disponible" puis on POST l'assignation via le contrôleur Express.
    const vehiclesRes = await request.get("/api/vehicles?statut=Disponible&limit=10");
    expect(vehiclesRes.ok()).toBeTruthy();
    const vehiclesBody = await vehiclesRes.json();
    const vehicles = vehiclesBody.vehicles || vehiclesBody;
    expect(Array.isArray(vehicles)).toBeTruthy();
    expect(vehicles.length).toBeGreaterThan(0);
    const vehiculeId = vehicles[0]._id;

    const assignRes = await request.post(`/api/transports/${transportId}/assigner`, {
      data: { vehiculeId },
    });
    // Tolère 200 (assigné OK) ou 409 (déjà assigné par un run précédent — le
    // seed peut avoir laissé le transport en ASSIGNED ; on continue, le check
    // de statut ci-dessous validera l'état final).
    expect([200, 409]).toContain(assignRes.status());

    // ── 5. VÉRIFIE LE STATUT ASSIGNED ────────────────────────────────────
    // Reload de la liste — le statut sur la card doit être ASSIGNED.
    await page.goto("/transports");
    const updatedCard = page
      .locator(`[data-testid="transport-card"][data-transport-numero="${transportNumero}"]`)
      .first();
    await expect(updatedCard).toBeVisible({ timeout: 15_000 });
    await expect(updatedCard).toHaveAttribute("data-transport-statut", ASSIGNED_STATUS, {
      timeout: 10_000,
    });

    // ── 6. LOGOUT UI ─────────────────────────────────────────────────────
    await logoutViaUi(page);
    expect(page.url()).toContain("/login");
  });
});
