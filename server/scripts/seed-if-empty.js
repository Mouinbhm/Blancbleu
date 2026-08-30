/**
 * BlancBleu — Seed automatique au démarrage du conteneur (idempotent).
 *
 * Appelé par docker-entrypoint.sh avant de lancer le serveur. Lance `seed.js`
 * UNIQUEMENT si la base est vide.
 *
 * Pourquoi cette garde : `seed.js` commence par vider les collections. Le
 * lancer à chaque démarrage effacerait les données à chaque `docker compose
 * up` / redémarrage / crash-restart. Ici, dès qu'il existe au moins un
 * utilisateur, on ne touche à rien.
 *
 * Désactivable avec AUTO_SEED=false (mis à false en prod).
 */

require("../config/env");
const { spawn } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");

const SERVER_DIR = path.resolve(__dirname, "..");

async function main() {
  if (process.env.AUTO_SEED === "false") {
    console.log("[seed-if-empty] AUTO_SEED=false — seed ignoré.");
    return 0;
  }
  if (!process.env.MONGO_URI) {
    console.log("[seed-if-empty] MONGO_URI absent — seed ignoré.");
    return 0;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });
  } catch (err) {
    // Ne JAMAIS bloquer le démarrage du serveur pour un seed : il gère
    // lui-même sa connexion et ses retries.
    console.warn(`[seed-if-empty] Mongo injoignable (${err.message}) — seed ignoré.`);
    return 0;
  }

  const users = await mongoose.connection.db.collection("users").countDocuments();
  await mongoose.disconnect();

  if (users > 0) {
    console.log(`[seed-if-empty] Base déjà peuplée (${users} utilisateurs) — seed ignoré.`);
    return 0;
  }

  console.log("[seed-if-empty] Base vide — exécution de seed.js…");
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SERVER_DIR, "seed.js")], {
      cwd: SERVER_DIR,
      stdio: "inherit",
    });
    child.on("close", resolve);
  });

  if (code !== 0) {
    console.warn(
      `[seed-if-empty] seed.js a échoué (code ${code}) — le serveur démarre quand même.`,
    );
  }
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((err) => {
    console.warn(`[seed-if-empty] erreur inattendue : ${err.message} — seed ignoré.`);
    process.exit(0);
  });
