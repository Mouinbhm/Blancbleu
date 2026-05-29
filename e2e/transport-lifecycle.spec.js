/**
 * E2E — Cycle de vie d'un transport (création via wizard → liste → détail).
 *
 * Note : ce test crée des données réelles en base. Si la base est partagée,
 * le transport créé restera (utile pour debug). Pour un environnement
 * "always clean", utiliser la base de test (cf. e2e/README.md).
 */

const { test, expect } = require("@playwright/test");
const { loginAs } = require("./fixtures/auth");

// Skipped : le wizard 5-étapes est trop fragile pour rester stable en CI
// (validation, OCR, race conditions React Query). La création est testée
// par appel API dans e2e/tests/critical-path.spec.js. À réactiver quand on
// ajoutera des data-testid robustes sur chaque step du wizard.
test.describe.skip("Transport — cycle de vie", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "dispatcher");
    // Tolère le passage 2FA si actif — sortir si on est sur /2fa/verify
    if (page.url().includes("/2fa/verify")) {
      test.skip(true, "2FA actif sur ce compte — désactiver pour les tests E2E");
    }
  });

  test("création via wizard 5 étapes → apparaît dans la liste", async ({ page }) => {
    await page.goto("/transports/new");

    // Step 1 — Patient
    await page.fill('input[name="patientNom"], input[id*="patientNom"]', "E2ETest");
    await page.click('button:has-text("Suivant")');

    // Step 2 — Adresses
    await page.fill('input[id*="adresseDepart"], input[id*="rue"]:first-of-type', "1 Rue de Test");
    await page.fill('input[id*="adresseDestination"], input[id*="nom"]:last-of-type', "Hôpital E2E");
    await page.click('button:has-text("Suivant")');

    // Step 3 — Transport (date + heure)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.fill('input[type="date"]', tomorrow);
    await page.fill('input[type="time"]', "10:00");
    await page.click('button:has-text("Suivant")');

    // Step 4 — Prescription (skip)
    await page.click('button:has-text("Suivant")');

    // Step 5 — Recap → Créer
    await page.click('button:has-text("Créer le transport")');

    // Redirection vers le détail du transport créé
    await page.waitForURL(/\/transports\/[0-9a-f]{24}/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/transports\/[0-9a-f]{24}/);

    // Le numéro de transport est affiché dans le header
    await expect(page.getByText(/TRS-\d{8}-\d{4}/)).toBeVisible({ timeout: 5_000 });
  });

  test("liste transports → ouvre un détail", async ({ page }) => {
    await page.goto("/transports");
    // Au moins une ligne (les fixtures de démo doivent en avoir)
    const row = page.locator('a[href*="/transports/"]').first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await page.waitForURL(/\/transports\/[0-9a-f]{24}/);
  });
});
