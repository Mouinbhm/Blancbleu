import { ErrorBoundary } from "react-error-boundary";
import { ErrorState } from "./ui";
import { Sentry } from "../lib/sentry";

/**
 * ErrorBoundary global — wrappe l'app entière (montée dans index.js).
 * Si une erreur de rendu remonte plus haut que toutes les boundaries internes,
 * c'est ici qu'elle s'arrête.
 *
 * Si Sentry est initialisé (REACT_APP_SENTRY_DSN), reporte également l'erreur
 * avec le componentStack pour traçabilité.
 */
export function AppErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorState}
      onError={(err, info) => {
        // Sentry — no-op si pas initialisé (getClient() retourne undefined)
        if (Sentry?.getClient?.()) {
          Sentry.withScope((scope) => {
            scope.setExtra("componentStack", info?.componentStack);
            Sentry.captureException(err);
          });
        }
        // eslint-disable-next-line no-console
        console.error("[App error]", err, info);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default AppErrorBoundary;
