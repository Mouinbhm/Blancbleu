import { useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useAuth } from "../../context/AuthContext";
import { useDispatchConfig, useUpdateDispatchConfig } from "../../hooks/queries/useDispatchConfig";
import { Card, Button, Badge, Skeleton, ErrorState } from "../../components/ui";

const CRITERE_META = {
  distance: {
    label: "Distance véhicule → patient",
    desc:  "Privilégie les véhicules proches (formule Haversine).",
  },
  driverAvailability: {
    label: "Disponibilité chauffeur",
    desc:  "Pénalise les chauffeurs déjà très chargés.",
  },
  vehicleTypeMatch: {
    label: "Compatibilité type véhicule",
    desc:  "Score selon la mobilité patient (ASSIS→VSL, FAUTEUIL→TPMR, etc.).",
  },
  planningLoad: {
    label: "Charge planning",
    desc:  "Tient compte du nombre de missions du jour pour le véhicule.",
  },
  traffic: {
    label: "Trafic",
    desc:  "Pénalise les heures de pointe (matin 7-9h, soir 17-19h).",
  },
  medicalPriority: {
    label: "Priorité médicale",
    desc:  "Bonus pour les transports flagués prioritaires/urgents.",
  },
  punctualityHistory: {
    label: "Ponctualité historique",
    desc:  "Favorise les chauffeurs au meilleur taux de ponctualité.",
  },
};

const ORDER = [
  "distance", "driverAvailability", "vehicleTypeMatch",
  "planningLoad", "traffic", "medicalPriority", "punctualityHistory",
];

function pct(v) {
  return Math.round((v ?? 0) * 1000) / 10; // ex: 0.255 → 25.5
}

function fromPct(p) {
  return Math.round(p * 10) / 1000; // ex: 25.5 → 0.255
}

function sumWeights(w) {
  return Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);
}

const DEFAULT_AUTO = { enabled: false, scoreThreshold: 80, requireApproval: true };

export default function DispatchConfigPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useDispatchConfig();
  const update = useUpdateDispatchConfig();
  const [weights, setWeights] = useState(null);
  const [auto, setAuto] = useState(null);
  const [msg, setMsg] = useState(null);
  const [autoMsg, setAutoMsg] = useState(null);

  useEffect(() => {
    if (data?.weights && !weights) setWeights(data.weights);
    if (data?.autoDispatch && !auto) setAuto(data.autoDispatch);
    if (!data?.autoDispatch && !auto) setAuto(DEFAULT_AUTO);
  }, [data, weights, auto]);

  if (isLoading || !weights) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError) return <ErrorState />;

  const isAdmin = user?.role === "admin";
  const defaults = data?.defaults || {};
  const sum = sumWeights(weights);
  const sumValid = Math.abs(sum - 1.0) < 1e-3;
  const sumPct = pct(sum);

  const onSlider = (key) => (e) => {
    const p = Number(e.target.value);
    setWeights((w) => ({ ...w, [key]: fromPct(p) }));
    setMsg(null);
  };

  const onReset = () => {
    setWeights(defaults);
    setMsg(null);
  };

  const onSave = async () => {
    setMsg(null);
    try {
      await update.mutateAsync(weights);
      setMsg({ kind: "success", text: "Pondérations enregistrées." });
      refetch();
    } catch (err) {
      setMsg({
        kind: "error",
        text: err.response?.data?.message || "Erreur lors de l'enregistrement",
      });
    }
  };

  const onSaveAuto = async () => {
    setAutoMsg(null);
    try {
      await update.mutateAsync({ autoDispatch: auto });
      setAutoMsg({ kind: "success", text: "Auto-dispatch enregistré." });
      refetch();
    } catch (err) {
      setAutoMsg({
        kind: "error",
        text: err.response?.data?.message || "Erreur lors de l'enregistrement",
      });
    }
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorState}>
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pondérations dispatch</h1>
            <p className="text-sm text-slate-500">
              Réglez l'importance relative de chaque critère du scoring IA.
              La somme doit valoir <strong>100 %</strong>.
            </p>
          </div>
          <Badge variant={sumValid ? "green" : "red"}>
            Total : {sumPct.toFixed(1)} %
          </Badge>
        </header>

        {!isAdmin && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            🔒 Lecture seule — seul un administrateur peut modifier ces poids.
          </div>
        )}

        <Card>
          <Card.Body className="space-y-4">
            {ORDER.map((key) => {
              const cur = pct(weights[key]);
              return (
                <div key={key} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor={`w-${key}`} className="text-sm font-semibold text-slate-800">
                      {CRITERE_META[key]?.label || key}
                    </label>
                    <span className="font-mono text-sm font-semibold text-slate-700">
                      {cur.toFixed(1)} %
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    {CRITERE_META[key]?.desc}
                  </p>
                  <input
                    id={`w-${key}`}
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={cur}
                    onChange={onSlider(key)}
                    disabled={!isAdmin}
                    className="w-full accent-[#1D6EF5] disabled:opacity-50"
                  />
                </div>
              );
            })}
          </Card.Body>
          <Card.Footer>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-slate-500">
                {sumValid
                  ? "Somme OK — vous pouvez enregistrer."
                  : `⚠️ Ajustez les sliders : la somme doit atteindre 100 % (écart ${(sumPct - 100).toFixed(1)} pts).`}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onReset} disabled={!isAdmin}>
                  Réinitialiser aux défauts
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  loading={update.isPending}
                  disabled={!isAdmin || !sumValid}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
            {msg && (
              <div
                className={`mt-3 p-2 rounded text-xs ${
                  msg.kind === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                {msg.text}
              </div>
            )}
          </Card.Footer>
        </Card>

        {/* ─── Auto-dispatch HITL ──────────────────────────────────────────── */}
        <Card>
          <Card.Body className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Auto-dispatch HITL</h2>
              <p className="text-sm text-slate-500">
                L'IA propose, l'humain dispose. Les transports éligibles
                (ASSIS / FAUTEUIL_ROULANT, score élevé, match parfait) sont
                soumis automatiquement à validation dans la file dédiée.
              </p>
            </div>

            <label className="flex items-center justify-between p-3 bg-slate-50 rounded">
              <div>
                <div className="font-medium text-slate-800">Activer l'auto-dispatch</div>
                <div className="text-xs text-slate-500">
                  Quand un transport passe en SCHEDULED, l'IA est appelée.
                </div>
              </div>
              <input
                type="checkbox"
                checked={auto?.enabled || false}
                onChange={(e) => setAuto((a) => ({ ...a, enabled: e.target.checked }))}
                disabled={!isAdmin}
                className="w-5 h-5"
              />
            </label>

            <div className={!auto?.enabled ? "opacity-50 pointer-events-none" : ""}>
              <label htmlFor="auto-threshold" className="text-sm font-semibold text-slate-800">
                Seuil minimum de score : <span className="font-mono">{auto?.scoreThreshold ?? 80}/100</span>
              </label>
              <p className="text-xs text-slate-500 mb-2">
                En dessous de ce score, aucune proposition d'auto-dispatch.
              </p>
              <input
                id="auto-threshold"
                type="range"
                min="50"
                max="100"
                step="1"
                value={auto?.scoreThreshold ?? 80}
                onChange={(e) => setAuto((a) => ({ ...a, scoreThreshold: Number(e.target.value) }))}
                disabled={!isAdmin || !auto?.enabled}
                className="w-full accent-[#1D6EF5]"
              />
            </div>

            <label className={"flex items-center justify-between p-3 bg-slate-50 rounded " + (!auto?.enabled ? "opacity-50" : "")}>
              <div>
                <div className="font-medium text-slate-800">Validation humaine requise</div>
                <div className="text-xs text-slate-500">
                  <strong>Recommandé.</strong> Si décoché, les propositions éligibles
                  sont assignées <em>automatiquement</em> sans intervention. Audit
                  AUTO_DISPATCH_ASSIGNED tracé dans tous les cas.
                </div>
              </div>
              <input
                type="checkbox"
                checked={auto?.requireApproval !== false}
                onChange={(e) => setAuto((a) => ({ ...a, requireApproval: e.target.checked }))}
                disabled={!isAdmin || !auto?.enabled}
                className="w-5 h-5"
              />
            </label>

            {auto?.enabled && auto?.requireApproval === false && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                ⚠️ Mode <strong>assignation automatique sans validation</strong> actif.
                Les transports éligibles seront assignés sans intervention humaine.
                Les patients ALLONGÉ/CIVIÈRE et les transports à risque restent
                exclus par les garde-fous.
              </div>
            )}
          </Card.Body>
          <Card.Footer>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                onClick={onSaveAuto}
                loading={update.isPending}
                disabled={!isAdmin}
              >
                Enregistrer auto-dispatch
              </Button>
            </div>
            {autoMsg && (
              <div
                className={`mt-3 p-2 rounded text-xs ${
                  autoMsg.kind === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                {autoMsg.text}
              </div>
            )}
          </Card.Footer>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
