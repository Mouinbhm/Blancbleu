import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";

const STATUS_COLORS = {
  ACTIVE:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  COMPLETED: { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400"  },
  ABANDONED: { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"    },
};
const STATUS_LABELS = { ACTIVE: "Actif", COMPLETED: "Terminé", ABANDONED: "Abandonné" };

function fmtDuration(startTime, endTime) {
  const end   = endTime ? new Date(endTime) : new Date();
  const start = new Date(startTime);
  const mins  = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Shifts() {
  const [shifts, setShifts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [filter, setFilter]   = useState("ALL");
  const [expanded, setExpanded] = useState(null);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: LIMIT };
      if (filter !== "ALL") params.status = filter;
      const { data } = await api.get("/v1/shifts", { params });
      setShifts(data.shifts || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError("Impossible de charger les shifts.");
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-lg">Shifts chauffeurs</h1>
          <p className="text-slate-400 text-xs mt-0.5">{total} shift{total !== 1 ? "s" : ""} au total</p>
        </div>

        {/* Filtre statut */}
        <div className="flex gap-2">
          {["ALL", "ACTIVE", "COMPLETED", "ABANDONED"].map((s) => (
            <button
              key={s}
              onClick={() => { setFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                filter === s
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-500 border-slate-200 hover:border-primary hover:text-primary"
              }`}
            >
              {s === "ALL" ? "Tous" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-red-500 text-sm gap-2">
            <span className="material-symbols-outlined">error</span> {error}
          </div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <span className="material-symbols-outlined text-4xl">event_busy</span>
            Aucun shift trouvé
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-mono uppercase tracking-wider text-left">
                <th className="px-5 py-3">Chauffeur</th>
                <th className="px-4 py-3">Véhicule</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Début</th>
                <th className="px-4 py-3">Fin</th>
                <th className="px-4 py-3">Durée</th>
                <th className="px-4 py-3">Km</th>
                <th className="px-4 py-3">Incidents</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shifts.map((s) => {
                const sc = STATUS_COLORS[s.status] || STATUS_COLORS.COMPLETED;
                const isExpanded = expanded === s._id;
                const p = s.personnelId;
                const driverName = p && typeof p === "object"
                  ? [p.prenom, p.nom].filter(Boolean).join(" ") || "—"
                  : (p || "—");
                const v = s.vehicleId;
                const vehiclePlate = v && typeof v === "object"
                  ? (v.immatriculation || "—")
                  : (v || "—");
                const vehicleType = v && typeof v === "object" ? (v.type || "") : "";
                return [
                  <tr
                    key={s._id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : s._id)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                          {(driverName !== "—" ? driverName : "?")[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-navy truncate max-w-[120px]">{driverName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 font-mono">
                      {vehiclePlate}{vehicleType ? ` · ${vehicleType}` : ""}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{fmtDate(s.startTime)}</td>
                    <td className="px-4 py-3.5 text-slate-600 font-mono">{fmtTime(s.startTime)}</td>
                    <td className="px-4 py-3.5 text-slate-600 font-mono">{fmtTime(s.endTime)}</td>
                    <td className="px-4 py-3.5 text-slate-600 font-mono">
                      {s.startTime ? fmtDuration(s.startTime, s.endTime) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 font-mono">{s.totalKm ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      {(s.incidents || []).length > 0 ? (
                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">
                          {s.incidents.length}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${s.status === "ACTIVE" ? "animate-pulse" : ""}`} />
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="material-symbols-outlined text-slate-300 text-base" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }}>
                        expand_more
                      </span>
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${s._id}_expanded`} className="bg-slate-50">
                      <td colSpan={10} className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Checklist */}
                          <div>
                            <p className="text-xs font-bold text-navy mb-2">Checklist pré-départ</p>
                            <div className="grid grid-cols-2 gap-1">
                              {Object.entries(s.startChecklist || {}).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5 text-xs">
                                  <span className={`material-symbols-outlined text-sm ${val ? "text-success" : "text-slate-300"}`}>
                                    {val ? "check_circle" : "cancel"}
                                  </span>
                                  <span className="text-slate-600 capitalize">{key}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Incidents */}
                          <div>
                            <p className="text-xs font-bold text-navy mb-2">Incidents ({(s.incidents || []).length})</p>
                            {(s.incidents || []).length === 0 ? (
                              <p className="text-xs text-slate-400">Aucun incident</p>
                            ) : (
                              <div className="space-y-1">
                                {s.incidents.map((inc, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs">
                                    <span className="material-symbols-outlined text-orange-400 text-sm mt-0.5">warning</span>
                                    <div>
                                      <p className="text-slate-600">{inc.description}</p>
                                      <p className="text-slate-400">{fmtTime(inc.time)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
            .map((p, i, arr) => [
              i > 0 && arr[i - 1] !== p - 1 && <span key={`dot${p}`} className="text-slate-300 text-xs">…</span>,
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${p === page ? "bg-primary text-white" : "border border-slate-200 text-slate-500 hover:border-primary hover:text-primary"}`}
              >
                {p}
              </button>,
            ])}
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
