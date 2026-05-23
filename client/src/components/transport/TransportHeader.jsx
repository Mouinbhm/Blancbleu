import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTransport, useTransportMutation } from "../../hooks/queries/useTransports";
import { Button, Badge, Skeleton, Modal, Textarea } from "../ui";

const STATUT_VARIANT = {
  REQUESTED:           "slate",
  CONFIRMED:           "blue",
  SCHEDULED:           "blue",
  ASSIGNED:            "blue",
  DRIVER_ACCEPTED:     "blue",
  DRIVER_REJECTED:     "yellow",
  EN_ROUTE_TO_PICKUP:  "yellow",
  ARRIVED_AT_PICKUP:   "yellow",
  PATIENT_ON_BOARD:    "purple",
  ARRIVED_AT_DESTINATION: "purple",
  WAITING_AT_DESTINATION: "purple",
  RETURN_TO_BASE:      "purple",
  COMPLETED:           "green",
  BILLING_PENDING:     "blue",
  BILLED:              "blue",
  PAID:                "green",
  CANCELLED:           "red",
  NO_SHOW:             "red",
  FAILED:              "red",
};

const TERMINAL = ["COMPLETED", "PAID", "CANCELLED", "NO_SHOW", "FAILED"];

export function TransportHeader({ transportId }) {
  const navigate = useNavigate();
  const { data: t, isLoading } = useTransport(transportId);
  const { transition } = useTransportMutation();
  const [cancelModal, setCancelModal] = useState(false);
  const [raison, setRaison] = useState("");

  if (isLoading) {
    return (
      <header className="flex items-center gap-4 pb-4 border-b border-slate-200">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-6 w-24" />
      </header>
    );
  }
  if (!t) return null;

  const isTerminal = TERMINAL.includes(t.statut);

  const handleCancel = async () => {
    if (!raison.trim()) return;
    await transition.mutateAsync({ id: transportId, action: "annuler", body: raison });
    setCancelModal(false);
    setRaison("");
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Retour">
          ← Retour
        </Button>
        <h1 className="text-2xl font-bold text-slate-900 truncate">{t.numero}</h1>
        <Badge variant={STATUT_VARIANT[t.statut] || "slate"}>{t.statut}</Badge>
      </div>

      {!isTerminal && (
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => setCancelModal(true)}
            data-testid="btn-annuler-transport"
          >
            Annuler
          </Button>
        </div>
      )}

      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="Annuler le transport"
      >
        <Textarea
          label="Motif de l'annulation"
          value={raison}
          onChange={(e) => setRaison(e.target.value)}
          rows={3}
          placeholder="Précisez la raison…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCancelModal(false)}>
            Garder
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={transition.isPending}
            disabled={!raison.trim()}
            onClick={handleCancel}
          >
            Confirmer l'annulation
          </Button>
        </div>
      </Modal>
    </header>
  );
}

export default TransportHeader;
