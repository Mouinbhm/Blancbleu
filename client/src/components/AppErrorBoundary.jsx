import { ErrorBoundary } from "react-error-boundary";
import { ErrorState } from "./ui";

/**
 * ErrorBoundary global — wrappe l'app entière (montée dans index.js).
 * Si une erreur de rendu remonte plus haut que toutes les boundaries internes,
 * c'est ici qu'elle s'arrête.
 *
 * À terme (Sprint 5) : envoyer err + info à Sentry via onError.
 */
export function AppErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorState}
      onError={(err, info) => {
        // eslint-disable-next-line no-console
        console.error("[App error]", err, info);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default AppErrorBoundary;
