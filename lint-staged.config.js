/**
 * lint-staged config — exécuté par .husky/pre-commit avant chaque commit.
 *
 * Stratégie : formattage + lint léger sur les fichiers stagés uniquement.
 * Pour éviter de bloquer trop de commits hérités, on ne lint pas tout le
 * server à chaque commit — juste les fichiers touchés.
 */
module.exports = {
  "server/**/*.js": [
    "prettier --write",
    // eslint n'est pas installe au root — on utilise le binaire de server/
    // pour rester aligne sur la config eslint du package (server/eslint.config.js).
    "npm --prefix server exec -- eslint --fix --no-error-on-unmatched-pattern",
  ],
  "client/src/**/*.{js,jsx}": [
    "prettier --write",
  ],
  "**/*.{json,md}": [
    "prettier --write",
  ],
  // ai-service/**/*.py : Python géré par ruff (lancé manuellement ou en CI)
};
