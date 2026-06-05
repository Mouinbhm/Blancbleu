/**
 * BlancBleu — Test unitaire : aiClient attache le token service-to-service.
 *
 * Vérifie que l'intercepteur de requête ajoute le header X-Service-Token
 * (depuis AI_SERVICE_TOKEN) sur les appels au microservice IA. Un petit serveur
 * HTTP local capture les headers reçus — aucune dépendance externe.
 */

const http = require("http");

const TOKEN = "tok-ai-service-test";
let server;
let baseUrl;
const received = [];
let aiClient;

beforeAll((done) => {
  server = http.createServer((req, res) => {
    received.push({ url: req.url, token: req.headers["x-service-token"] });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version: "1.0.0", modules: {} }));
  });
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    process.env.AI_API_URL = baseUrl;
    process.env.AI_SERVICE_TOKEN = TOKEN;
    // Charger aiClient APRÈS avoir posé AI_API_URL (lu au require).
    jest.resetModules();
    aiClient = require("../../services/aiClient");
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

describe("aiClient — token service-to-service", () => {
  test("verifierSante (GET /health) porte le header X-Service-Token", async () => {
    const sante = await aiClient.verifierSante();
    expect(sante.available).toBe(true);
    const call = received.find((r) => r.url === "/health");
    expect(call).toBeTruthy();
    expect(call.token).toBe(TOKEN);
  });

  test("optimiserTournee (POST /routing/optimize) porte le header X-Service-Token", async () => {
    await aiClient.optimiserTournee({
      date: "2026-06-05",
      transports: [],
      vehicules: [],
      depot: {},
    });
    const call = received.find((r) => r.url === "/routing/optimize");
    expect(call).toBeTruthy();
    expect(call.token).toBe(TOKEN);
  });
});
