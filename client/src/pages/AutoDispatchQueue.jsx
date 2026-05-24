import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAutoDispatchQueue,
  useAcceptAutoDispatch,
  useRejectAutoDispatch,
} from "../hooks/queries/useAutoDispatchQueue";
import {
  Card, Button, Badge, Skeleton, EmptyState, ErrorState, Modal, Textarea,
} from "../components/ui";

function formatDateTransport(t) {
  if (!t?.dateTransport) return "—";
  const d = new Date(t.dateTransport);
  const date = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return `${date}${t.heureRDV ? ` à ${t.heureRDV}` : ""}`;
}

function ProposalCard({ proposal, onAccept, onModify, onReject, busy }) {
  const t = proposal.transport;
  const best = proposal.best || {};
  const score = Math.round(best.score || 0);

  const scoreColor =
    score >= 90 ? "success" :
    score >= 80 ? "info" :
    "warning";

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{t.numero}</span>
            <Badge variant="neutral">{t.typeTransport || "—"}</Badge>
            <Badge variant={scoreColor}>Score {score}/100</Badge>
          </div>
          <div className="text-sm text-gray-600 mb-2">
            <span className="material-symbols-outlined text-base align-middle mr-1">person</span>
            {t.patient?.nom} {t.patient?.prenom} · <em>{t.patient?.mobilite}</em>
            {" · "}
            <span className="material-symbols-outlined text-base align-middle mr-1">calendar_today</span>
            {formatDateTransport(t)}
          </div>
          <div className="text-sm text-gray-500 mb-3">
            <span className="material-symbols-outlined text-base align-middle mr-1">trip_origin</span>
            {t.adresseDepart?.ville || "?"} → {t.adresseDestination?.ville || "?"}
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-sm mb-3">
            <div className="font-medium text-blue-900 mb-1">
              <span className="material-symbols-outlined text-base align-middle mr-1">smart_toy</span>
              Véhicule recommandé : {best.vehicleName || best.vehiculeId}
              {best.driverName && <> · {best.driverName}</>}
            </div>
            {Array.isArray(best.explanation) && best.explanation.length > 0 && (
              <ul className="list-disc list-inside text-xs text-blue-800 space-y-0.5">
                {best.explanation.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>

          {Array.isArray(best.risks) && best.risks.length > 0 && (
            <div className="bg-amber-50 rounded-lg p-2 text-xs text-amber-800 mb-2">
              <span className="material-symbols-outlined text-sm align-middle mr-1">warning</span>
              {best.risks.join(" · ")}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <Button variant="primary"   onClick={() => onAccept(proposal)} disabled={busy}>
          <span className="material-symbols-outlined text-base mr-1">check</span>
          Valider
        </Button>
        <Button variant="secondary" onClick={() => onModify(proposal)} disabled={busy}>
          <span className="material-symbols-outlined text-base mr-1">edit</span>
          Modifier
        </Button>
        <Button variant="danger"    onClick={() => onReject(proposal)} disabled={busy}>
          <span className="material-symbols-outlined text-base mr-1">close</span>
          Rejeter
        </Button>
      </div>
    </Card>
  );
}

export default function AutoDispatchQueue() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useAutoDispatchQueue();
  const accept = useAcceptAutoDispatch();
  const reject = useRejectAutoDispatch();

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const proposals = data?.proposals || [];
  const busy = accept.isPending || reject.isPending;

  const handleAccept = async (p) => {
    if (!window.confirm(`Valider l'assignation auto pour ${p.transport.numero} ?`)) return;
    try {
      await accept.mutateAsync(p.recommendationId);
    } catch (e) {
      window.alert(`Erreur : ${e.response?.data?.message || e.message}`);
    }
  };

  const handleModify = (p) => {
    // Redirige vers l'assignation manuelle, pré-remplie via query string
    navigate(
      `/transports/${p.transport._id}?prefillVehiculeId=${p.best.vehiculeId}` +
      (p.best.chauffeurId ? `&prefillChauffeurId=${p.best.chauffeurId}` : ""),
    );
  };

  const handleReject = (p) => {
    setRejectTarget(p);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (rejectReason.trim().length < 3) return;
    try {
      await reject.mutateAsync({
        recId:  rejectTarget.recommendationId,
        raison: rejectReason.trim(),
      });
      setRejectTarget(null);
    } catch (e) {
      window.alert(`Erreur : ${e.response?.data?.message || e.message}`);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">File auto-dispatch</h1>
          <p className="text-sm text-gray-500">
            Propositions générées par l'IA, en attente de validation humaine.
          </p>
        </div>
        <Badge variant="info">{data?.count || 0} en attente</Badge>
      </header>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      )}

      {isError && (
        <ErrorState
          title="Impossible de charger la file"
          message={error?.message}
        />
      )}

      {!isLoading && !isError && proposals.length === 0 && (
        <EmptyState
          icon="inbox"
          title="Aucune proposition en attente"
          description="L'IA n'a généré aucune proposition d'auto-dispatch éligible. Vérifie que le toggle est activé dans Pondérations IA."
        />
      )}

      <div className="space-y-3">
        {proposals.map((p) => (
          <ProposalCard
            key={p.recommendationId}
            proposal={p}
            onAccept={handleAccept}
            onModify={handleModify}
            onReject={handleReject}
            busy={busy}
          />
        ))}
      </div>

      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Rejeter la proposition"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Transport : <strong>{rejectTarget?.transport?.numero}</strong>
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Raison du rejet (min 3 caractères) — utile pour améliorer le modèle"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Annuler</Button>
            <Button
              variant="danger"
              onClick={confirmReject}
              disabled={rejectReason.trim().length < 3 || reject.isPending}
            >
              Rejeter
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
