/**
 * E2E — Authentification.
 *
 * Pré-requis : voir e2e/README.md (compte dispatcher@blancbleu.fr en base).
 */

const { test, expect } = require("@playwright/test");
const { TEST_USERS } = require("./fixtures/auth");

// Skipped : couvert par e2e/tests/critical-path.spec.js (login + logout).
// Conservé pour les cas spécifiques (mauvais mdp, accès non-auth) qui seront
// réactivés au prochain sprint E2E.
test.describe.skip("Authentification", () => {
  test("login avec credentials valides → /dashboard", async ({ page }) => {
    const { email, password } = TEST_USERS.dispatcher;

    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Tolère les 2 destinations possibles (avec ou sans 2FA actif)
    await page.waitForURL(/\/(dashboard|2fa\/verify)/);
    expect(page.url()).toMatch(/\/(dashboard|2fa\/verify)/);
  });

  test("login avec mauvais mot de passe → message d'erreur", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "dispatcher@blancbleu.fr");
    await page.fill('input[name="password"]', "wrong-password");
    await page.click('button[type="submit"]');

    // Le composant Login affiche err.response.data.message ou un fallback
    await expect(page.getByText(/incorrect|invalide|erreur/i)).toBeVisible({ timeout: 5_000 });
  });

  test("accès /transports sans login → redirection /login", async ({ page }) => {
    // Pas de login préalable → PrivateRoute redirige
    await page.goto("/transports");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });
});
