import { useTransport, useTransportTimeline } from "../../hooks/queries/useTransports";
import { Card, Skeleton } from "../ui";

const ORDRE_STATUTS = [
  "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
  "DRIVER_ACCEPTED", "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
  "COMPLETED", "BILLING_PENDING", "BILLED", "PAID",
];

const LABEL_TIMELINE = {
  REQUESTED:              "Demande reçue",
  CONFIRMED:              "Transport confirmé",
  SCHEDULED:              "Transport planifié",
  ASSIGNED:               "Véhicule assigné",
  DRIVER_ACCEPTED:        "Mission acceptée par le chauffeur",
  DRIVER_REJECTED:        "Mission refusée par le chauffeur",
  EN_ROUTE_TO_PICKUP:     "En route vers le patient",
  ARRIVED_AT_PICKUP:      "Arrivé chez le patient",
  PATIENT_ON_BOARD:       "Patient pris en charge",
  ARRIVED_AT_DESTINATION: "Arrivé à destination",
  WAITING_AT_DESTINATION: "En attente à destination",
  RETURN_TO_BASE:         "Retour base en cours",
  COMPLETED:              "Transport terminé",
  BILLING_PENDING:        "Facturation en cours",
  BILLED:                 "Facturé CPAM",
  PAID:                   "Paiement reçu",
  CANCELLED:              "Transport annulé",
  NO_SHOW:                "Patient absent",
  FAILED:                 "Échec du transport",
};

const fmtDatetime = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "";

export function TransportTimeline({ transportId }) {
  const { data: transport, isLoading } = useTransport(transportId);
  const { data: tl } = useTransportTimeline(transportId);

  if (isLoading) {
    return (
      <Card>
        <Card.Header><h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Timeline</h3></Card.Header>
        <Card.Body>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-2" />
          <Skeleton className="h-4 w-2/3" />
        </Card.Body>
      </Card>
    );
  }
  if (!transport) return null;

  const isCancelOrNoShow = ["CANCELLED", "NO_SHOW"].includes(transport.statut);
  const currentIdx = ORDRE_STATUTS.indexOf(transport.statut);
  const steps = isCancelOrNoShow
    ? [...ORDRE_STATUTS.slice(0, Math.max(currentIdx, 1)), transport.statut]
    : ORDRE_STATUTS;

  // Index timeline (statusLog enrichi) ou journal par statut atteint
  const logByStatut = {};
  const entries = tl?.timeline || tl || transport.journal || [];
  entries.forEach((e) => {
    const to = e.to || e.vers;
    if (to && !logByStatut[to]) logByStatut[to] = e;
  });

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Timeline</h3>
      </Card.Header>
      <Card.Body>
        {steps.map((s, i) => {
          const entry = logByStatut[s];
          const isCurrent = s === transport.statut;
          const isPast = i < currentIdx && !isCurrent;
          const isBad = ["CANCELLED", "NO_SHOW"].includes(s);
          return (
            <div key={s} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-3 h-3 rounded-full mt-0.5 ring-2 ${
                    isCurrent && isBad ? "bg-red-500 ring-red-200" :
                    isCurrent          ? "bg-[#1D6EF5] ring-blue-200" :
                    isPast             ? "bg-emerald-500 ring-emerald-100" :
                                          "bg-slate-200 ring-slate-100"
                  }`}
                />
                {i < steps.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[20px] mt-0.5 ${isPast ? "bg-emerald-200" : "bg-slate-100"}`} />
                )}
              </div>
              <div className="pb-4 min-w-0 flex-1">
                <p className={`text-xs font-semibold leading-tight ${
                  isCurrent && isBad ? "text-red-600" :
                  isCurrent          ? "text-[#1D6EF5]" :
                  isPast             ? "text-emerald-700" : "text-slate-300"
                }`}>
                  {LABEL_TIMELINE[s] || s}
                </p>
                {entry && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {fmtDatetime(entry.changedAt || entry.timestamp)}
                    {entry.changedByRole || entry.utilisateur ?
                      ` · ${entry.changedByRole || entry.utilisateur}` : ""}
                  </p>
                )}
                {entry?.reason && (
                  <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">{entry.reason}</p>
                )}
              </div>
            </div>
          );
        })}
      </Card.Body>
    </Card>
  );
}

export default TransportTimeline;
