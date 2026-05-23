import { useTransport } from "../../hooks/queries/useTransports";
import { Card, Badge, Skeleton } from "../ui";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <span className="col-span-2 text-sm text-slate-800">{children || "—"}</span>
    </div>
  );
}

export function TransportInfoPanel({ transportId }) {
  const { data: t, isLoading } = useTransport(transportId);

  if (isLoading) {
    return (
      <Card>
        <Card.Header><h3 className="font-semibold text-sm uppercase tracking-wide">Informations</h3></Card.Header>
        <Card.Body>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-2/3 mb-3" />
          ))}
        </Card.Body>
      </Card>
    );
  }
  if (!t) return null;

  const adresseLabel = (a) => {
    if (!a) return "";
    return [a.nom, a.rue, a.codePostal, a.ville].filter(Boolean).join(", ");
  };

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">Informations</h3>
      </Card.Header>
      <Card.Body>
        <Row label="Type">{t.typeTransport && <Badge variant="blue">{t.typeTransport}</Badge>}</Row>
        <Row label="Motif">{t.motif}</Row>
        <Row label="Date">{fmtDate(t.dateTransport)}</Row>
        <Row label="Heure RDV">{t.heureRDV}</Row>
        {t.heureDepart && <Row label="Heure départ">{t.heureDepart}</Row>}
        <Row label="Aller-retour">{t.allerRetour ? "Oui" : "Non"}</Row>
        <Row label="Départ">{adresseLabel(t.adresseDepart)}</Row>
        <Row label="Destination">{adresseLabel(t.adresseDestination)}</Row>
        <Row label="Véhicule">
          {t.vehicule?.immatriculation
            ? `${t.vehicule.immatriculation}${t.vehicule.nom ? ` — ${t.vehicule.nom}` : ""}`
            : "Non assigné"}
        </Row>
        <Row label="Chauffeur">
          {t.chauffeur?.nom
            ? `${t.chauffeur.prenom || ""} ${t.chauffeur.nom}`.trim()
            : "Non assigné"}
        </Row>
        {t.scoreDispatch != null && (
          <Row label="Score dispatch">
            <Badge variant={t.scoreDispatch >= 80 ? "green" : t.scoreDispatch >= 60 ? "yellow" : "red"}>
              {t.scoreDispatch}/100
            </Badge>
          </Row>
        )}
      </Card.Body>
    </Card>
  );
}

export default TransportInfoPanel;
