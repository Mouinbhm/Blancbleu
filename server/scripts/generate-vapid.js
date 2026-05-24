#!/usr/bin/env node
/**
 * Génère une paire de clés VAPID pour Web Push.
 * Usage : node server/scripts/generate-vapid.js
 *
 * À copier dans .env :
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:contact@blancbleu.fr
 */
const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();

// eslint-disable-next-line no-console
console.log(`# Coller ces lignes dans .env :
VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:contact@blancbleu.fr
`);
