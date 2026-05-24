#!/usr/bin/env node
/**
 * Dump le spec OpenAPI courant dans docs/openapi.json.
 * Lancé via npm run docs:openapi.
 *
 * Utile pour : import Postman/Insomnia, snapshot CI, génération de clients.
 */

const fs = require("fs");
const path = require("path");
const { getSpecs } = require("../middleware/swagger");

const OUT = path.join(__dirname, "..", "docs", "openapi.json");

const specs = getSpecs();
fs.writeFileSync(OUT, JSON.stringify(specs, null, 2), "utf-8");

// eslint-disable-next-line no-console
console.log(`OpenAPI spec écrit : ${OUT}`);
// eslint-disable-next-line no-console
console.log(`  paths : ${Object.keys(specs.paths || {}).length}`);
// eslint-disable-next-line no-console
console.log(`  components.schemas : ${Object.keys(specs.components?.schemas || {}).length}`);
