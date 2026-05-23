import { useWizard } from "./WizardContext";
import { Card, Input, Select } from "../../ui";

const MOTIFS = [
  "Dialyse", "Chimiothérapie", "Radiothérapie", "Consultation",
  "Hospitalisation", "Sortie hospitalisation", "Rééducation", "Analyse", "Autre",
];

const TYPES = [
  { value: "VSL",       label: "VSL — Véhicule Sanitaire Léger" },
  { value: "TPMR",      label: "TPMR — Transport PMR" },
  { value: "AMBULANCE", label: "AMBULANCE — Patient allongé" },
];

export function StepTransport() {
  const { form, set, errors } = useWizard();
  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
          Détails du transport
        </h3>
      </Card.Header>
      <Card.Body className="space-y-4">
        <Select
          label="Type de véhicule"
          value={form.typeTransport}
          onChange={(e) => set("typeTransport", e.target.value)}
          error={errors.typeTransport}
        >
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select
          label="Motif"
          value={form.motif}
          onChange={(e) => set("motif", e.target.value)}
        >
          {MOTIFS.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date *"
            type="date"
            value={form.dateTransport}
            onChange={(e) => set("dateTransport", e.target.value)}
            error={errors.dateTransport}
          />
          <Input
            label="Heure de RDV *"
            type="time"
            value={form.heureRDV}
            onChange={(e) => set("heureRDV", e.target.value)}
            error={errors.heureRDV}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.allerRetour}
            onChange={(e) => set("allerRetour", e.target.checked)}
          />
          Aller-retour (le patient sera ramené)
        </label>
      </Card.Body>
    </Card>
  );
}
