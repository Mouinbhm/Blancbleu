/**
 * BlancBleu — Helper de seed dédié E2E.
 *
 * Wrap autour du seed standard (server/seed.js) — relançable de manière
 * idempotente avant chaque run E2E. Utilisé par playwright.config.js dans
 * un globalSetup et par le job CI avant l'exécution des tests.
 *
 * Le seed standard crée :
 *   - admin (belhajmouin@gmail.com / admin123)
 *   - dispatcher (dispatcher@blancbleu.fr / dispatcher123)
 *   - vehicles "Disponible" (VSL, AMBULANCE, TPMR)
 *   - patients démo
 *   - transports avec différents statuts (REQUESTED, CONFIRMED, SCHEDULED,
 *     ASSIGNED, EN_ROUTE, COMPLETED) — la critical-path utilise le SCHEDULED.
 *
 * Usage CLI :
 *   node e2e/fixtures/seed.js           # seed via API HTTP (server doit tourner)
 *   node e2e/fixtures/seed.js --reset   # force reset puis seed
 *
 * Note : ce wrapper appelle le seed via le module Node (pas via HTTP) pour
 * éviter de devoir attendre que le client soit up. Le server doit avoir
 * accès à MongoDB (replica set ou standalone, pas de transactions requises).
 */

const path = require("path");

async function runSeed() {
  // Forcer le NODE_ENV pour que le seed pointe sur la bonne URI Mongo.
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  // Le seed appelle dotenv.config() en interne ; on s'aligne sur le fichier
  // .env du server pour récupérer MONGO_URI.
  require("dotenv").config({
    path: path.join(__dirname, "../../server/.env"),
  });

  // Le seed se termine par process.exit(0) en cas de succès — on le require
  // dans un sous-process pour ne pas tuer le caller (Playwright global setup).
  const { spawn } = require("child_process");
  const seedPath = path.join(__dirname, "../../server/seed.js");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedPath], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        // eslint-disable-next-line no-console
        console.log("[e2e/seed] OK — seed terminé.");
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `[e2e/seed] échec (exit ${code})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      }
    });
  });
}

module.exports = { runSeed };

// CLI direct
if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
