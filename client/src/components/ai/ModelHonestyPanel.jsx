import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { Card, Badge, Button, Skeleton } from "../ui";

/**
 * Panel d'honnêteté scientifique du modèle de durée.
 *
 * Affiche :
 *   - data_composition (réel / synthétique)
 *   - split_strategy
 *   - warning honnête tant que real < 300
 *   - metrics du modèle gagnant (MAE, R², MAPE)
 *   - bouton "Réentraîner maintenant" (admin only)
 *
 * Consomme GET /api/ai/model/status (proxy vers Python).
 */
export function ModelHonestyPanel({ isAdmin = false }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ai", "model", "status"],
    queryFn:  () => api.get("/ai/model/status").then((r) => r.data),
    refetchInterval: 10_000, // refresh discret pour suivre un retrain en cours
  });

  const triggerRetrain = async () => {
    try {
      await api.post("/ai/model/retrain", {});
      refetch();
    } catch (e) {
      alert(e.response?.data?.message || "Erreur lors du déclenchement");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <Card.Header>
          <h3 className="font-semibold text-sm uppercase tracking-wide">Modèle de durée</h3>
        </Card.Header>
        <Card.Body>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-2/3 mb-2" />
          <Skeleton className="h-20 w-full" />
        </Card.Body>
      </Card>
    );
  }

  const job     = data?.training_job   || {};
  const metrics = data?.current_metrics || {};
  const compo   = metrics.data_composition || {};
  const winner  = metrics.gagnant;
  const winnerMetrics = winner ? (metrics.modeles || {})[winner] : null;

  const splitStrategy = metrics.split_strategy || "—";
  const warning = metrics.warning;

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-sm uppercase tracking-wide">
            Modèle de durée — honnêteté
          </h3>
          <div className="flex items-center gap-2">
            {job.status === "running" && (
              <Badge variant="yellow">⏳ Réentraînement en cours…</Badge>
            )}
            {job.status === "success" && (
              <Badge variant="green">✓ Dernier entraînement OK</Badge>
            )}
            {job.status === "failed" && (
              <Badge variant="red">✗ Dernier entraînement échoué</Badge>
            )}
            {isAdmin && (
              <Button
                size="sm"
                onClick={triggerRetrain}
                loading={isFetching || job.status === "running"}
              >
                Réentraîner
              </Button>
            )}
          </div>
        </div>
      </Card.Header>
      <Card.Body className="space-y-4">
        {warning && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            ⚠️ {warning}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Composition du dataset</p>
            <p className="font-semibold">
              {compo.real ?? 0} réel · {compo.synthetic ?? 0} synthétique
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Train {compo.train_n ?? "?"} · Test {compo.test_n ?? "?"}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Stratégie de validation</p>
            <p className="font-semibold">{splitStrategy}</p>
            <p className="text-xs text-slate-500 mt-1">
              {splitStrategy.startsWith("chronological")
                ? "Test sur les transports les plus récents"
                : "Split aléatoire — métriques optimistes"}
            </p>
          </div>
        </div>

        {winner && winnerMetrics && (
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Modèle gagnant : <strong>{winner}</strong>
            </p>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <Metric label="MAE"  value={`${winnerMetrics.MAE} min`} />
              <Metric label="RMSE" value={`${winnerMetrics.RMSE} min`} />
              <Metric label="R²"   value={winnerMetrics.R2} />
              <Metric label="MAPE" value={`${winnerMetrics.MAPE}%`} />
            </div>
          </div>
        )}

        {metrics.trained_at && (
          <p className="text-xs text-slate-500">
            Dernier entraînement : {new Date(metrics.trained_at).toLocaleString("fr-FR")}
          </p>
        )}

        {job.error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            Erreur dernière exécution : {job.error}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-bold text-slate-800">{value}</p>
    </div>
  );
}

export default ModelHonestyPanel;
