/**
 * E2E — Reco IA dispatch sur un transport.
 *
 * Pré-requis : transport SCHEDULED en base + microservice IA Python lancé.
 */

const { test, expect } = require("@playwright/test");
const { loginAs } = require("./fixtures/auth");

test.describe("Dispatch IA", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "dispatcher");
    if (page.url().includes("/2fa/verify")) test.skip(true, "2FA actif — skip");
  });

  test("Générer recommandation → score + explications + boutons accepter/refuser", async ({ page }) => {
    // Va sur la liste, ouvre le premier transport SCHEDULED disponible
    await page.goto("/transports");
    const firstTransport = page.locator('a[href*="/transports/"]').first();
    await expect(firstTransport).toBeVisible({ timeout: 10_000 });
    await firstTransport.click();
    await page.waitForURL(/\/transports\/[0-9a-f]{24}/);

    // Le panneau DispatchAIPanel a un bouton "Générer recommandation"
    const generateBtn = page.getByRole("button", { name: /Générer recommandation|Régénérer/i });
    await expect(generateBtn).toBeVisible({ timeout: 5_000 });
    await generateBtn.click();

    // Score affiché /100
    await expect(page.getByText(/\d+\/100/)).toBeVisible({ timeout: 15_000 });

    // Boutons Accepter + Refuser présents (decision encore null)
    await expect(page.getByTestId("btn-accept-ia")).toBeVisible();
    await expect(page.getByRole("button", { name: /Refuser/i })).toBeVisible();
  });
});
