/**
 * Playwright config — BlancBleu E2E.
 *
 * Hypothèse : le serveur backend (port 5000) ET le client CRA (port 3000)
 * tournent déjà avant `npm run e2e`. La doc dans e2e/README.md explique
 * comment démarrer la stack (docker compose OU manuel).
 *
 * Pour démarrer le client automatiquement, décommenter `webServer` ci-dessous
 * mais attention : CRA est long à démarrer (~30s).
 */

const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout:  30_000,
  expect:   { timeout: 5_000 },
  fullyParallel: false, // Les tests partagent une base — séquentiel pour éviter les races
  forbidOnly: !!process.env.CI,
  retries:    process.env.CI ? 2 : 0,
  workers:    1,
  reporter:   process.env.CI ? "line" : "list",

  use: {
    baseURL:   process.env.E2E_BASE_URL || "http://localhost:3000",
    headless:  true,
    trace:     "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use:  { ...devices["Desktop Chrome"] },
    },
  ],

  // Pour démarrer le client automatiquement (lent — ~30s) :
  // webServer: {
  //   command: "npm --prefix ../client start",
  //   url:     "http://localhost:3000",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 60_000,
  // },
});
