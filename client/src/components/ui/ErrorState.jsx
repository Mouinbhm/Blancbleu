import { Button } from "./Button";
import { cn } from "../../lib/cn";

/**
 * Fallback compatible avec react-error-boundary.
 * Reçoit { error, resetErrorBoundary } depuis FallbackComponent.
 */
export function ErrorState({ error, resetErrorBoundary, title, description, className }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-red-200 bg-red-50/60 px-6 py-8 text-center",
        className,
      )}
    >
      <div className="mb-2 text-red-600 text-3xl">⚠️</div>
      <h3 className="text-base font-semibold text-red-900">
        {title || "Une erreur est survenue"}
      </h3>
      <p className="mt-1 text-sm text-red-700">
        {description || error?.message || "Réessayez plus tard ou contactez le support."}
      </p>
      {resetErrorBoundary && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={resetErrorBoundary}>
            Réessayer
          </Button>
        </div>
      )}
    </div>
  );
}
