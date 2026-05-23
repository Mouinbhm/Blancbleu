import { useWizard } from "./WizardContext";
import { Card, Input } from "../../ui";

export function StepAdresses() {
  const { form, setNested, errors } = useWizard();
  const d = form.adresseDepart;
  const dst = form.adresseDestination;

  return (
    <div className="space-y-4">
      <Card>
        <Card.Header>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
            Adresse de départ
          </h3>
        </Card.Header>
        <Card.Body className="space-y-3">
          <Input
            label="Rue *"
            value={d.rue}
            onChange={(e) => setNested("adresseDepart", "rue", e.target.value)}
            error={errors.adresseDepartRue}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Code postal"
              value={d.codePostal}
              onChange={(e) => setNested("adresseDepart", "codePostal", e.target.value)}
            />
            <Input
              className="col-span-2"
              label="Ville"
              value={d.ville}
              onChange={(e) => setNested("adresseDepart", "ville", e.target.value)}
            />
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
            Destination
          </h3>
        </Card.Header>
        <Card.Body className="space-y-3">
          <Input
            label="Établissement (CHU, clinique, etc.)"
            value={dst.nom}
            onChange={(e) => setNested("adresseDestination", "nom", e.target.value)}
            helpText="Nom de l'établissement OU adresse rue ci-dessous (au moins un des deux)"
          />
          <Input
            label="Rue"
            value={dst.rue}
            onChange={(e) => setNested("adresseDestination", "rue", e.target.value)}
            error={errors.adresseDestinationRue}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Code postal"
              value={dst.codePostal}
              onChange={(e) => setNested("adresseDestination", "codePostal", e.target.value)}
            />
            <Input
              className="col-span-2"
              label="Ville"
              value={dst.ville}
              onChange={(e) => setNested("adresseDestination", "ville", e.target.value)}
            />
          </div>
          <Input
            label="Service (optionnel)"
            value={dst.service}
            onChange={(e) => setNested("adresseDestination", "service", e.target.value)}
            placeholder="Ex : Néphrologie, Imagerie…"
          />
        </Card.Body>
      </Card>
    </div>
  );
}
