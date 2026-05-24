/**
 * Sentry frontend — opt-in via REACT_APP_SENTRY_DSN.
 *
 * Sans DSN, initSentry() est un no-op : aucune charge réseau, aucun risque
 * pour les devs locaux qui ne veulent pas Sentry.
 */

import * as Sentry from "@sentry/react";

export function initSentry() {
  if (!process.env.REACT_APP_SENTRY_DSN) return null;

  Sentry.init({
    dsn:              process.env.REACT_APP_SENTRY_DSN,
    environment:      process.env.NODE_ENV || "development",
    release:          process.env.REACT_APP_VERSION || undefined,
    tracesSampleRate: parseFloat(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    sendDefaultPii:   false, // RGPD : pas d'IP ni de cookies par défaut
  });

  return Sentry;
}

export { Sentry };
