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
      "no-console":     "warn",
      "prefer-const":   "error",
      "eqeqeq":         ["error", "smart"],
    },
  },
  {
    ignores: ["coverage/", "node_modules/", "uploads/"],
  },
];
