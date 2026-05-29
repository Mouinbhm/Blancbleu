/**
 * Playwright config — BlancBleu E2E.
 *
 * Stratégie :
 *   - testDir : racine + sous-dossier tests/. Le critical-path bloquant
 *     vit dans tests/critical-path.spec.js ; les specs racine
 *     (auth/dispatch-ai/transport-lifecycle) sont en test.skip.
 *   - webServer : démarre server (5000) + client (3000) automatiquement
 *     en local. En CI, déjà démarrés dans le job avant la step playwright.
 *   - retries 2 en CI : absorbe la flakiness réseau résiduelle sans
 *     masquer un vrai bug (retry borné, pas de continue-on-error).
 *   - baseURL via env E2E_BASE_URL.
 *
 * Seed : assuré AVANT le run par `node e2e/fixtures/seed.js` (cf. README +
 * job CI). Pas en globalSetup ici pour garder Playwright découplé du DB
 * setup — un dev qui change le seed ne devrait pas casser la config E2E.
 */

const { defineConfig, devices } = require("@playwright/test");

const isCi = !!process.env.CI;
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

module.exports = defineConfig({
  testDir: ".",
  // tests/critical-path.spec.js + specs racine (skipped).
  testMatch: ["**/*.spec.js"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // tests partagent une base — séquentiel pour éviter les races
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: 1,
  reporter: isCi
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",

  use: {
    baseURL,
    headless: true,
    // trace + video + screenshot en cas d'échec → uploadés comme artifact CI.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    // Cookies httpOnly du login UI partagés automatiquement avec `request`
    // pour les appels API depuis le test (cf. critical-path.spec.js).
    ignoreHTTPSErrors: true,
  },

  // Démarre back+front automatiquement en local. En CI on suppose qu'ils
  // sont déjà lancés par les steps précédentes du job (plus rapide, contrôle
  // sur le moment où le seed tourne).
  webServer: isCi
    ? undefined
    : [
        {
          command: "npm --prefix ../server start",
          url: "http://localhost:5000/api/health",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "npm --prefix ../client start",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000, // CRA boot est lent
        },
      ],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
