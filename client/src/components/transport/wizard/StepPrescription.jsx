import { useWizard } from "./WizardContext";
import { Card, EmptyState } from "../../ui";

export function StepPrescription() {
  const { form, set } = useWizard();

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
          Prescription Médicale de Transport (optionnel)
        </h3>
      </Card.Header>
      <Card.Body>
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => set("pmtFile", e.target.files?.[0] || null)}
          aria-label="Choisir un fichier PMT"
        />
        {form.pmtFile ? (
          <p className="mt-3 text-sm text-emerald-700">
            ✓ <strong>{form.pmtFile.name}</strong> sera téléversée et OCRisée après création.
          </p>
        ) : (
          <EmptyState
            icon="📄"
            title="Pas de PMT pour le moment"
            description="Vous pouvez créer le transport sans PMT et la téléverser plus tard depuis la fiche."
          />
        )}
      </Card.Body>
    </Card>
  );
}
