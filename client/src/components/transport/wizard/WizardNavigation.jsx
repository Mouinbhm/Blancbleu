import { useWizard } from "./WizardContext";
import { Button } from "../../ui";

export function WizardNavigation({ onSubmit, submitting }) {
  const { stepIdx, goPrev, goNext, STEPS } = useWizard();
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div className="flex items-center justify-between mt-6">
      <Button variant="ghost" onClick={goPrev} disabled={stepIdx === 0}>
        ← Précédent
      </Button>
      <span className="text-xs text-slate-500">
        Étape {stepIdx + 1}/{STEPS.length} — {STEPS[stepIdx].label}
      </span>
      {isLast ? (
        <Button variant="primary" onClick={onSubmit} loading={submitting}>
          Créer le transport
        </Button>
      ) : (
        <Button variant="primary" onClick={goNext}>
          Suivant →
        </Button>
      )}
    </div>
  );
}
