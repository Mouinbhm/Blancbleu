/**
 * BlancBleu — Tests du middleware antivirus (ClamAV).
 *
 * En CI il n'y a pas de démon ClamAV : on teste donc
 *   1. le passe-through quand CLAMAV_ENABLED n'est pas "true" (cas test/dev) ;
 *   2. le passe-through quand aucun fichier n'est présent ;
 *   3. (opt-in) la détection EICAR si un démon est joignable — activé via
 *      RUN_CLAMAV_LIVE=true, sinon skip.
 *
 * On invoque le middleware directement avec des objets req/res factices
 * (pas de serveur Express complet — le wiring des routes est trivial).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// Signature EICAR standard (fichier de test antivirus, inoffensif).
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

/** Recharge le module avec un env donné (ENABLED est figé au require). */
function loadMiddleware(env) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  let mod;
  jest.isolateModules(() => {
    mod = require("../../middleware/antivirus");
  });
  // Restaure l'env (le module a déjà capturé ce dont il a besoin).
  process.env = prev;
  return mod;
}

describe("antivirus middleware — passe-through", () => {
  test("CLAMAV_ENABLED non défini en test → next() sans scan", async () => {
    const { scanUpload, _isEnabled } = loadMiddleware({
      NODE_ENV: "test",
      CLAMAV_ENABLED: "",
    });
    expect(_isEnabled()).toBe(false);

    const tmp = path.join(os.tmpdir(), `bb_av_${Date.now()}.txt`);
    fs.writeFileSync(tmp, EICAR); // même infecté, ignoré car désactivé
    const req = { file: { path: tmp, originalname: "eicar.txt" } };
    const res = makeRes();
    let nexted = false;

    await scanUpload(req, res, () => {
      nexted = true;
    });

    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
    fs.unlinkSync(tmp);
  });

  test("CLAMAV_ENABLED=true mais aucun fichier → next() direct", async () => {
    const { scanUpload, _isEnabled } = loadMiddleware({
      NODE_ENV: "production",
      CLAMAV_ENABLED: "true",
    });
    expect(_isEnabled()).toBe(true);

    const req = {}; // pas de req.file ni req.files
    const res = makeRes();
    let nexted = false;

    await scanUpload(req, res, () => {
      nexted = true;
    });

    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});

// ── Test live (opt-in) : nécessite un démon ClamAV joignable ────────────────
const runLive = process.env.RUN_CLAMAV_LIVE === "true";
(runLive ? describe : describe.skip)("antivirus middleware — détection EICAR (live)", () => {
  test("fichier EICAR → 400 FILE_INFECTED + fichier supprimé", async () => {
    const { scanUpload } = loadMiddleware({
      NODE_ENV: "production",
      CLAMAV_ENABLED: "true",
      CLAMAV_HOST: process.env.CLAMAV_HOST || "localhost",
      CLAMAV_PORT: process.env.CLAMAV_PORT || "3310",
      CLAMAV_FAIL_OPEN: "false",
    });

    const tmp = path.join(os.tmpdir(), `bb_eicar_${Date.now()}.txt`);
    fs.writeFileSync(tmp, EICAR);
    const req = { file: { path: tmp, originalname: "eicar.com" } };
    const res = makeRes();
    let nexted = false;

    await scanUpload(req, res, () => {
      nexted = true;
    });

    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("FILE_INFECTED");
    expect(Array.isArray(res.body.viruses)).toBe(true);
    expect(fs.existsSync(tmp)).toBe(false); // supprimé
  });
});
