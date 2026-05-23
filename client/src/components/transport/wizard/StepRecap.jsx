import { useWizard } from "./WizardContext";
import { Card, Badge, Input } from "../../ui";

const JOURS = [
  { num: 1, label: "Lun" }, { num: 2, label: "Mar" }, { num: 3, label: "Mer" },
  { num: 4, label: "Jeu" }, { num: 5, label: "Ven" }, { num: 6, label: "Sam" }, { num: 7, label: "Dim" },
];

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="col-span-2 text-sm text-slate-800">{value || "—"}</span>
    </div>
  );
}

export function StepRecap() {
  const { form, set, errors } = useWizard();
  const d = form.adresseDepart;
  const dst = form.adresseDestination;

  const toggleJour = (num) => {
    set(
      "recurrenceJours",
      form.recurrenceJours.includes(num)
        ? form.recurrenceJours.filter((j) => j !== num)
        : [...form.recurrenceJours, num],
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <Card.Header>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
            Récapitulatif
          </h3>
        </Card.Header>
        <Card.Body>
          <Row label="Patient" value={`${form.patientNom} ${form.patientPrenom}`.trim()} />
          <Row label="Mobilité" value={form.patientMobilite} />
          <Row label="Type" value={<Badge variant="blue">{form.typeTransport}</Badge>} />
          <Row label="Motif" value={form.motif} />
          <Row label="Date" value={form.dateTransport} />
          <Row label="Heure RDV" value={form.heureRDV} />
          <Row label="Aller-retour" value={form.allerRetour ? "Oui" : "Non"} />
          <Row label="Départ" value={[d.rue, d.codePostal, d.ville].filter(Boolean).join(", ")} />
          <Row label="Destination" value={[dst.nom, dst.rue, dst.codePostal, dst.ville].filter(Boolean).join(", ")} />
          {form.pmtFile && <Row label="PMT" value={form.pmtFile.name} />}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
            Options
          </h3>
        </Card.Header>
        <Card.Body className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.lancerIA}
              onChange={(e) => set("lancerIA", e.target.checked)}
            />
            🤖 Lancer une recommandation IA après création
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.recurrenceActive}
              onChange={(e) => set("recurrenceActive", e.target.checked)}
            />
            🔁 Créer des transports récurrents
          </label>
          {form.recurrenceActive && (
            <div className="pl-6 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Jours de la semaine</p>
                <div className="flex gap-2 flex-wrap">
                  {JOURS.map((j) => (
                    <button
                      key={j.num}
                      type="button"
                      onClick={() => toggleJour(j.num)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        form.recurrenceJours.includes(j.num)
                          ? "bg-[#1D6EF5] text-white border-[#1D6EF5]"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {j.label}
                    </button>
                  ))}
                </div>
                {errors.recurrenceJours && (
                  <p className="text-xs text-red-600 mt-1">{errors.recurrenceJours}</p>
                )}
              </div>
              <Input
                label="Date de fin de récurrence"
                type="date"
                value={form.recurrenceDateFin}
                onChange={(e) => set("recurrenceDateFin", e.target.value)}
                error={errors.recurrenceDateFin}
              />
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
