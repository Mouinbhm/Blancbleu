/**
 * Styleguide dev-only — montre chaque composant UI dans toutes ses variantes.
 * Route /_styleguide protégée par NODE_ENV === "development" dans App.js.
 */
import { useState } from "react";
import {
  Button, Card, Badge, Modal, Input, Textarea, Select,
  Skeleton, EmptyState, ErrorState,
} from "../components/ui";

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-slate-900 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  const [openModal, setOpenModal] = useState(false);

  return (
    <div className="max-w-5xl mx-auto p-8 bg-slate-50 min-h-screen">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">UI Styleguide</h1>

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading>Loading…</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Card">
        <Card>
          <Card.Header>
            <h3 className="font-semibold">Titre carte</h3>
          </Card.Header>
          <Card.Body>
            Contenu du body avec du texte représentatif.
          </Card.Body>
          <Card.Footer>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm">Annuler</Button>
              <Button size="sm">Valider</Button>
            </div>
          </Card.Footer>
        </Card>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge variant="slate">slate</Badge>
          <Badge variant="blue">blue</Badge>
          <Badge variant="green">green</Badge>
          <Badge variant="yellow">yellow</Badge>
          <Badge variant="red">red</Badge>
          <Badge variant="purple">purple</Badge>
        </div>
      </Section>

      <Section title="Input / Textarea / Select">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Email" placeholder="exemple@blancbleu.fr" />
          <Input label="Avec erreur" defaultValue="invalide" error="Format incorrect" />
          <Select label="Type véhicule">
            <option value="VSL">VSL</option>
            <option value="AMBULANCE">AMBULANCE</option>
            <option value="TPMR">TPMR</option>
          </Select>
          <Input label="Avec aide" placeholder="…" helpText="Format AB-123-CD" />
        </div>
        <Textarea label="Notes" placeholder="…" rows={3} />
      </Section>

      <Section title="Skeleton">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState
            icon="📭"
            title="Aucun transport"
            description="Créez un transport pour voir les résultats ici."
            action={<Button size="sm">Nouveau transport</Button>}
          />
        </Card>
      </Section>

      <Section title="ErrorState">
        <ErrorState
          error={new Error("Détail technique mock")}
          resetErrorBoundary={() => alert("retry")}
        />
      </Section>

      <Section title="Modal">
        <Button onClick={() => setOpenModal(true)}>Ouvrir Modal</Button>
        <Modal
          open={openModal}
          onClose={() => setOpenModal(false)}
          title="Exemple de Modal"
          size="md"
        >
          <p className="text-sm text-slate-700">
            Press Escape ou clique en dehors pour fermer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpenModal(false)}>Annuler</Button>
            <Button size="sm" onClick={() => setOpenModal(false)}>OK</Button>
          </div>
        </Modal>
      </Section>
    </div>
  );
}
