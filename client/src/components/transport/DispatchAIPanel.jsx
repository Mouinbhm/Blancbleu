import { useState } from "react";
import { useTransport } from "../../hooks/queries/useTransports";
import { useDispatch } from "../../hooks/queries/useDispatch";
import { Card, Button, Badge, Modal, Textarea, Skeleton } from "../ui";

const CRITERE_LABELS = {
  distance:           "Distance",
  driverAvailability: "Disponibilité",
  vehicleTypeMatch:   "Type véhicule",
  planningLoad:       "Charge planning",
  traffic:            "Trafic",
  medicalPriority:    "Priorité médicale",
  punctualityHistory: "Ponctualité",
};

function ScoreBar({ label, value }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-slate-600 w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right text-slate-700">{value}</span>
    </div>
  );
}

const scoreLabel = (s) =>
  s >= 80 ? "Excellent" : s >= 65 ? "Bon" : s >= 50 ? "Acceptable" : "Risqué";

const scoreVariant = (s) => (s >= 80 ? "green" : s >= 60 ? "yellow" : "red");

export function DispatchAIPanel({ transportId }) {
  const { data: transport, isLoading } = useTransport(transportId);
  const dispatch = useDispatch();
  const [rejectModal, setRejectModal] = useState(false);
  const [raison, setRaison] = useState("");

  if (isLoading) {
    return (
      <Card>
        <Card.Header><h3 className="font-semibold text-sm uppercase tracking-wide">Dispatch IA</h3></Card.Header>
        <Card.Body>
          <Skeleton className="h-20 w-full" />
        </Card.Body>
      </Card>
    );
  }
  if (!transport) return null;

  const aiDispatch = transport.aiDispatch;
  const hasRec = aiDispatch?.generatedAt;
  const accepted = aiDispatch?.acceptedByDispatcher;
  const score = aiDispatch?.score ?? 0;

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
            🤖 Dispatch IA
          </h3>
          <Button
            size="sm"
            loading={dispatch.recommander.isPending}
            onClick={() => dispatch.recommander.mutate(transportId)}
          >
            {hasRec ? "Régénérer" : "Générer recommandation"}
          </Button>
        </div>
      </Card.Header>
      <Card.Body>
        {!hasRec && (
          <p className="text-sm text-slate-500 italic">
            Aucune recommandation IA pour ce transport — cliquez sur Générer pour lancer le scoring.
          </p>
        )}

        {hasRec && (
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-slate-800">
                  🚚 {aiDispatch.vehicleName || "—"}
                </p>
                {aiDispatch.driverName && (
                  <p className="text-sm text-slate-600">👤 {aiDispatch.driverName}</p>
                )}
                {aiDispatch.fallbackUsed && (
                  <Badge variant="yellow" className="mt-1">⚠️ Fallback métier</Badge>
                )}
              </div>
              <div className="text-right">
                <Badge variant={scoreVariant(score)}>
                  {score}/100 — {scoreLabel(score)}
                </Badge>
              </div>
            </div>

            {accepted === true && (
              <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 font-medium">
                ✓ Recommandation acceptée par le dispatcher
              </div>
            )}
            {accepted === false && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                ✗ Recommandation refusée — {aiDispatch.rejectedReason}
              </div>
            )}

            {aiDispatch.criteriaScores && (
              <div className="mb-4 bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Scores par critère
                </p>
                {Object.entries(aiDispatch.criteriaScores).map(([k, v]) => (
                  <ScoreBar key={k} label={CRITERE_LABELS[k] || k} value={v} />
                ))}
              </div>
            )}

            {(aiDispatch.explanation || []).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Points positifs
                </p>
                <ul className="space-y-1">
                  {aiDispatch.explanation.map((e, i) => (
                    <li key={i} className="text-xs text-emerald-700">✓ {e}</li>
                  ))}
                </ul>
              </div>
            )}

            {(aiDispatch.risks || []).length > 0 && (
              <div className="mb-3" data-testid="dispatch-risks">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Risques identifiés
                </p>
                <ul className="space-y-1">
                  {aiDispatch.risks.map((r, i) => (
                    <li key={i} className="text-xs text-amber-700">⚠️ {r}</li>
                  ))}
                </ul>
              </div>
            )}

            {accepted == null && (
              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1"
                  variant="primary"
                  loading={dispatch.accepter.isPending}
                  onClick={() => dispatch.accepter.mutate(transportId)}
                  data-testid="btn-accept-ia"
                >
                  Accepter
                </Button>
                <Button
                  className="flex-1"
                  variant="danger"
                  onClick={() => setRejectModal(true)}
                >
                  Refuser
                </Button>
              </div>
            )}
          </div>
        )}

        <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Refuser la recommandation IA">
          <Textarea
            label="Motif du refus"
            value={raison}
            onChange={(e) => setRaison(e.target.value)}
            rows={3}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectModal(false)}>Annuler</Button>
            <Button
              variant="danger"
              size="sm"
              loading={dispatch.refuser.isPending}
              disabled={!raison.trim()}
              onClick={async () => {
                await dispatch.refuser.mutateAsync({ transportId, raison });
                setRejectModal(false);
                setRaison("");
              }}
            >
              Confirmer le refus
            </Button>
          </div>
        </Modal>
      </Card.Body>
    </Card>
  );
}

export default DispatchAIPanel;
