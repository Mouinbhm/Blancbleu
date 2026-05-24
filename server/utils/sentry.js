/**
 * Sentry — opt-in via SENTRY_DSN.
 *
 * Sans DSN configurée, initSentry() est un no-op : pas d'init Sentry, pas
 * de crash en dev/test. Permet d'avoir le code prêt pour la prod sans
 * imposer un compte Sentry à chaque dev.
 */

const Sentry = require("@sentry/node");

function initSentry() {
  if (!process.env.SENTRY_DSN) return null;

  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || "development",
    release:          process.env.npm_package_version || undefined,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    sendDefaultPii:   false, // RGPD : pas de PII par défaut
  });

  return Sentry;
}

module.exports = { Sentry, initSentry };
