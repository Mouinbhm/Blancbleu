import { useTransport } from "../../hooks/queries/useTransports";
import { Card, Badge, Skeleton } from "../ui";

const MOBILITE_LABELS = {
  ASSIS:            "🪑 Assis",
  FAUTEUIL_ROULANT: "♿ Fauteuil roulant",
  ALLONGE:          "🛏️ Allongé",
  CIVIERE:          "🚑 Civière",
};

const MOBILITE_VARIANT = {
  ASSIS: "green", FAUTEUIL_ROULANT: "yellow", ALLONGE: "red", CIVIERE: "red",
};

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() - birth.getMonth() < 0 ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

export function PatientCard({ transportId }) {
  const { data: transport, isLoading } = useTransport(transportId);

  if (isLoading) {
    return (
      <Card>
        <Card.Header><h3 className="font-semibold text-sm uppercase tracking-wide">Patient</h3></Card.Header>
        <Card.Body>
          <Skeleton className="h-5 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-2/3" />
        </Card.Body>
      </Card>
    );
  }

  const p = transport?.patient;
  if (!p) return null;

  const age = calcAge(p.dateNaissance);

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">Patient</h3>
      </Card.Header>
      <Card.Body className="space-y-2.5">
        <p className="text-lg font-bold text-slate-900">
          {p.nom} {p.prenom}
        </p>
        <div className="flex flex-wrap gap-2">
          {age != null && <Badge variant="slate">{age} ans</Badge>}
          {p.mobilite && (
            <Badge variant={MOBILITE_VARIANT[p.mobilite] || "slate"}>
              {MOBILITE_LABELS[p.mobilite] || p.mobilite}
            </Badge>
          )}
          {p.oxygene      && <Badge variant="blue">🫁 Oxygène</Badge>}
          {p.brancardage  && <Badge variant="red">🩹 Brancardage</Badge>}
          {p.accompagnateur && <Badge variant="purple">👥 Accompagnateur</Badge>}
        </div>
        {p.telephone && (
          <div className="text-sm">
            <span className="text-slate-500">Téléphone : </span>
            <a href={`tel:${p.telephone}`} className="font-medium text-[#1D6EF5] hover:underline">{p.telephone}</a>
          </div>
        )}
        {p.numeroSecu && (
          <div className="text-sm">
            <span className="text-slate-500">N° Sécu : </span>
            <span className="font-mono text-xs">{p.numeroSecu}</span>
          </div>
        )}
        {p.antecedents && (
          <div className="text-sm pt-2 border-t border-slate-100">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Antécédents</p>
            <p className="text-slate-700">{p.antecedents}</p>
          </div>
        )}
        {p.notes && (
          <div className="text-sm pt-2 border-t border-slate-100">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Notes</p>
            <p className="text-slate-700 italic">{p.notes}</p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default PatientCard;
