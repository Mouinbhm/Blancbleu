/**
 * BlancBleu — Chargement des variables d'environnement (source unique).
 *
 * Le `.env` de la RACINE du dépôt est la source de vérité : c'est le fichier
 * que lit docker compose. `server/.env` reste possible pour des surcharges
 * locales (ex. pointer une base distante) mais n'est plus obligatoire, et
 * surtout plus à recopier à la main.
 *
 * Ordre de priorité (du plus fort au plus faible) :
 *   1. l'environnement réel du process  (docker compose, `FOO=x npm start`)
 *   2. server/.env                      (surcharges locales, optionnel)
 *   3. <racine>/.env                    (source de vérité, partagée)
 *
 * dotenv n'écrase JAMAIS une variable déjà définie : charger le local avant la
 * racine suffit à obtenir cette priorité, et l'env réel gagne dans tous les cas.
 *
 * Usage — remplace `require("dotenv").config()` :
 *   require("./config/env");        // depuis server/
 *   require("../config/env");       // depuis server/scripts/ ou server/workers/
 */

const path = require("path");
const dotenv = require("dotenv");

const SERVER_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(SERVER_DIR, "..");

// 2. surcharges locales (silencieux si absent)
dotenv.config({ path: path.join(SERVER_DIR, ".env") });
// 3. source de vérité partagée
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

module.exports = process.env;
