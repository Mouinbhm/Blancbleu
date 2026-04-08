/**
 * BlancBleu — WorkflowBadge
 * Affiche le statut d'une intervention avec boutons de transition
 * Usage : <WorkflowBadge interventionId={id} onTransition={callback} />
 */
import { useState, useEffect } from "react";
import { workflowService } from "../../services/api";

const COULEURS = {
  CREATED: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-300",
  },
  VALIDATED: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-300",
  },
  ASSIGNED: {
    bg: "bg-purple-100",
    text: "text-purple-700",
    border: "border-purple-300",
  },
  EN_ROUTE: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    border: "border-orange-300",
  },
  ON_SITE: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    border: "border-yellow-300",
  },
  TRANSPORTING: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-300",
  },
  COMPLETED: {
    bg: "bg-green-100",
    text: "text-green-700",
    border: "border-green-300",
  },
  CANCELLED: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-300",
  },
};

const ICONS = {
  CREATED: "add_circle",
  VALIDATED: "verified",
  ASSIGNED: "ambulance",
  EN_ROUTE: "directions_car",
  ON_SITE: "location_on",
  TRANSPORTING: "local_hospital",
  COMPLETED: "check_circle",
  CANCELLED: "cancel",
};

export default function WorkflowBadge({
  interventionId,
  compact = false,
  onTransition,
}) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    if (!interventionId) return;
    workflowService
      .getStatus(interventionId)
      .then(({ data }) => setWorkflow(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [interventionId]);

  const handleTransition = async (statut) => {
    setTransitioning(true);
    try {
      const { data } = await workflowService.transition(interventionId, statut);
      setWorkflow((prev) => ({
        ...prev,
        statut: data.intervention.statut,
        label: data.intervention.label,
        progression: data.intervention.progression,
        transitions: data.transitions,
      }));
      setShowActions(false);
      onTransition?.(data.intervention);
    } catch (err) {
      alert(err.response?.data?.message || "Transition impossible");
    } finally {
      setTransitioning(false);
    }
  };

  if (loading || !workflow)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-400 text-xs">
        <div
          style={{
            width: 10,
            height: 10,
            border: "1.5px solid #cbd5e1",
            borderTop: "1.5px solid #64748b",
            borderRadius: "50%",
            animation: "spin .7s linear infinite",
          }}
        />
        Chargement…
      </span>
    );

  const col = COULEURS[workflow.statut] || COULEURS.CREATED;
  const icon = ICONS[workflow.statut] || "help";
  const estTerminal = ["COMPLETED", "CANCELLED"].includes(workflow.statut);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${col.bg} ${col.text} ${col.border}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
          {icon}
        </span>
        {workflow.label}
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      {/* Badge principal */}
      <button
        onClick={() => !estTerminal && setShowActions(!showActions)}
        disabled={estTerminal || transitioning}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${col.bg} ${col.text} ${col.border} ${
          !estTerminal ? "hover:shadow-sm cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
          {icon}
        </span>
        {workflow.label}
        {!estTerminal && (
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
            {showActions ? "expand_less" : "expand_more"}
          </span>
        )}
      </button>

      {/* Barre de progression */}
      {workflow.progression !== null && (
        <div
          className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden"
          style={{ minWidth: 80 }}
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${workflow.progression}%` }}
          />
        </div>
      )}

      {/* Menu de transitions */}
      {showActions && workflow.transitions?.length > 0 && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-2 min-w-[180px]">
          <p className="text-xs text-slate-400 font-mono px-2 pb-1 border-b border-slate-100 mb-1">
            Passer à →
          </p>
          {workflow.transitions.map((t) => {
            const tc = COULEURS[t.statut] || COULEURS.CREATED;
            const ti = ICONS[t.statut] || "arrow_forward";
            return (
              <button
                key={t.statut}
                onClick={() => handleTransition(t.statut)}
                disabled={transitioning}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:shadow-sm mb-1 border ${tc.bg} ${tc.text} ${tc.border}`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14 }}
                >
                  {ti}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
