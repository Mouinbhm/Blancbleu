/**
 * Helpers d'authentification pour les tests E2E.
 *
 * Stratégie : login via l'UI et persistance du state via storageState. La
 * fonction loginAs(page, role) crée une session valide pour le rôle demandé.
 *
 * Les comptes sont créés par le seeder démo (POST /api/demo/seed depuis
 * Sprint 2 step 8). Voir e2e/README.md pour la préparation de la base.
 */

const TEST_USERS = {
  admin: {
    email:    process.env.E2E_ADMIN_EMAIL    || "admin@blancbleu.fr",
    password: process.env.E2E_ADMIN_PASSWORD || "admin1234",
  },
  dispatcher: {
    email:    process.env.E2E_DISPATCHER_EMAIL    || "dispatcher@blancbleu.fr",
    password: process.env.E2E_DISPATCHER_PASSWORD || "dispatcher1234",
  },
};

/**
 * Login via l'UI. Renvoie une fois redirigé sur /dashboard.
 */
async function loginAs(page, role = "dispatcher") {
  const { email, password } = TEST_USERS[role] || TEST_USERS.dispatcher;

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Attend la redirection après login (gère 2FA absent vs présent)
  await page.waitForURL(/\/dashboard|\/2fa\/verify/, { timeout: 10_000 });
}

module.exports = { TEST_USERS, loginAs };
