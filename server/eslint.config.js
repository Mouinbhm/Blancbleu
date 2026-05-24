const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType:  "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console":     "error",
      "prefer-const":   "error",
      "eqeqeq":         ["error", "smart"],
    },
  },
  {
    // CLI scripts one-shot — console.* autorisé (pas de logger Winston dans
    // un script run-and-exit, lancé manuellement).
    files: ["scripts/**/*.js", "seed.js", "fix-transport.js"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["coverage/", "node_modules/", "uploads/"],
  },
];
