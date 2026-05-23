import { useWizard } from "./WizardContext";
import { Card, Input, Select } from "../../ui";

const MOBILITES = [
  { value: "ASSIS",            label: "🪑 Assis" },
  { value: "FAUTEUIL_ROULANT", label: "♿ Fauteuil roulant" },
  { value: "ALLONGE",          label: "🛏️ Allongé" },
  { value: "CIVIERE",          label: "🚑 Civière" },
];

export function StepPatient() {
  const { form, set, errors } = useWizard();
  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">Patient</h3>
      </Card.Header>
      <Card.Body className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Nom *"
            value={form.patientNom}
            onChange={(e) => set("patientNom", e.target.value)}
            error={errors.patientNom}
          />
          <Input
            label="Prénom"
            value={form.patientPrenom}
            onChange={(e) => set("patientPrenom", e.target.value)}
          />
        </div>
        <Input
          label="Téléphone"
          value={form.patientTelephone}
          onChange={(e) => set("patientTelephone", e.target.value)}
        />
        <Select
          label="Mobilité"
          value={form.patientMobilite}
          onChange={(e) => set("patientMobilite", e.target.value)}
        >
          {MOBILITES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.patientOxygene}
              onChange={(e) => set("patientOxygene", e.target.checked)}
            />
            🫁 Oxygène
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.patientBrancardage}
              onChange={(e) => set("patientBrancardage", e.target.checked)}
            />
            🩹 Brancardage
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.patientAccompagnateur}
              onChange={(e) => set("patientAccompagnateur", e.target.checked)}
            />
            👥 Accompagnateur
          </label>
        </div>
      </Card.Body>
    </Card>
  );
}
