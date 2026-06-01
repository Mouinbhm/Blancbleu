/**
 * BlancBleu — Tests protection CSRF (double-submit).
 *
 * On monte une mini-app Express avec le middleware CSRF activé (le serveur
 * complet a NODE_ENV=test → CSRF désactivé par défaut, donc on force ici).
 *
 * Couvre :
 *   1. GET /api/csrf-token renvoie un token + pose le cookie.
 *   2. POST sans header X-CSRF-Token → 403.
 *   3. POST avec token+cookie valides → 200.
 *   4. Route exclue (mobile /api/v1/...) → 200 sans token.
 *   5. CSRF_ENABLED=false → passe-through (token null).
 */

const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

function buildApp(env) {
  const prev = { ...process.env };
  Object.assign(process.env, { JWT_SECRET: "test-csrf-secret-32-chars-minimum-xx", ...env });

  let csrf;
  jest.isolateModules(() => {
    csrf = require("../../middleware/csrf");
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrf.csrfProtection);
  app.get("/api/csrf-token", csrf.csrfTokenHandler);
  app.post("/api/transports", (req, res) => res.json({ ok: true }));
  app.post("/api/v1/tracking/batch", (req, res) => res.json({ ok: true })); // exclu (mobile)
  app.use(csrf.csrfErrorHandler);

  process.env = prev;
  return { app, csrf };
}

describe("CSRF — activé", () => {
  test("GET /api/csrf-token renvoie un token + cookie", async () => {
    const { app } = buildApp({ NODE_ENV: "test", CSRF_ENABLED: "true" });
    const res = await request(app).get("/api/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(typeof res.body.csrfToken).toBe("string");
    expect(res.headers["set-cookie"].join(";")).toMatch(/bb_csrf/);
  });

  test("POST sans X-CSRF-Token → 403 EBADCSRFTOKEN", async () => {
    const { app } = buildApp({ NODE_ENV: "test", CSRF_ENABLED: "true" });
    const res = await request(app).post("/api/transports").send({ foo: "bar" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EBADCSRFTOKEN");
  });

  test("POST avec token + cookie valides → 200", async () => {
    const { app } = buildApp({ NODE_ENV: "test", CSRF_ENABLED: "true" });
    const agent = request.agent(app); // conserve les cookies entre requêtes
    const tokenRes = await agent.get("/api/csrf-token");
    const token = tokenRes.body.csrfToken;

    const res = await agent.post("/api/transports").set("X-CSRF-Token", token).send({ foo: "bar" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("route exclue (mobile /api/v1) → 200 sans token", async () => {
    const { app } = buildApp({ NODE_ENV: "test", CSRF_ENABLED: "true" });
    const res = await request(app).post("/api/v1/tracking/batch").send({ p: 1 });
    expect(res.status).toBe(200);
  });
});

describe("CSRF — désactivé", () => {
  test("CSRF_ENABLED=false → passe-through, token null", async () => {
    const { app, csrf } = buildApp({ NODE_ENV: "test", CSRF_ENABLED: "false" });
    expect(csrf._isEnabled()).toBe(false);

    const tokenRes = await request(app).get("/api/csrf-token");
    expect(tokenRes.body.enabled).toBe(false);
    expect(tokenRes.body.csrfToken).toBeNull();

    const res = await request(app).post("/api/transports").send({ foo: "bar" });
    expect(res.status).toBe(200);
  });
});
