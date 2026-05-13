// Fichier : client/src/pages/FleetDashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { vehicleService } from "../services/api";

// ─── Constantes ──────────────────────────────────────────────────────────────

const PERIODS = [
  { value: "today", label: "Aujourd'hui" },
  { value: "week",  label: "7 jours" },
  { value: "month", label: "30 jours" },
  { value: "year",  label: "Année" },
];

const VEHICLE_TYPES = [
  { value: "all",       label: "Tous les types" },
  { value: "VSL",       label: "VSL" },
  { value: "AMBULANCE", label: "Ambulance" },
  { value: "TPMR",      label: "TPMR" },
];

const STATUT_CONFIG = {
  "Disponible":  { color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", label: "Disponible" },
  "En service":  { color: "bg-blue-100 text-blue-700",       dot: "bg-blue-500",    label: "En service" },
  "Maintenance": { color: "bg-amber-100 text-amber-700",     dot: "bg-amber-500",   label: "Maintenance" },
  "Hors service":{ color: "bg-red-100 text-red-700",         dot: "bg-red-500",     label: "Hors service" },
};

const PRIORITY_CONFIG = {
  overdue: { color: "bg-red-100 text-red-700 border-red-200",       icon: "error",         label: "En retard" },
  urgent:  { color: "bg-orange-100 text-orange-700 border-orange-200", icon: "warning",     label: "Urgent" },
  warning: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "schedule",    label: "Bientôt" },
  ok:      { color: "bg-emerald-50 text-emerald-600 border-emerald-100", icon: "check_circle", label: "OK" },
  soon:    { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "schedule",    label: "Bientôt" },
};

const SLOT_COLORS = {
  available:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_mission:    "bg-blue-50 text-blue-700 border-blue-200",
  maintenance:   "bg-amber-50 text-amber-700 border-amber-200",
  out_of_service:"bg-red-50 text-red-600 border-red-200",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtDatetime = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtEuro = (n) =>
  n != null ? `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €` : "—";

const fmtKm = (n) =>
  n != null ? `${Number(n).toLocaleString("fr-FR")} km` : "—";

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = "text-navy", bg = "bg-white" }) {
  return (
    <div className={`${bg} rounded-xl border border-slate-200 p-4 flex items-start gap-3`}>
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-slate-500 text-base">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest truncate">{label}</p>
        <p className={`text-xl font-bold ${color} leading-tight`}>{value ?? "—"}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatutBadge({ statut }) {
  const cfg = STATUT_CONFIG[statut] || { color: "bg-slate-100 text-slate-600", dot: "bg-slate-400", label: statut };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const p = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.ok;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.color}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 10 }}>{p.icon}</span>
      {p.label}
    </span>
  );
}

function UtilBar({ rate }) {
  const color = rate >= 85 ? "bg-red-500" : rate >= 60 ? "bg-amber-500" : rate >= 30 ? "bg-emerald-500" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-[80px]">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-600 flex-shrink-0">{rate}%</span>
    </div>
  );
}

function FuelBar({ level }) {
  const color = level <= 20 ? "bg-red-500" : level <= 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 12 }}>local_gas_station</span>
      <div className="w-12 bg-slate-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${level ?? 0}%` }} />
      </div>
      <span className="text-[10px] text-slate-500">{level ?? "—"}%</span>
    </div>
  );
}

// ─── Modal missions véhicule ─────────────────────────────────────────────────

function MissionsModal({ vehicle, onClose }) {
  const [missions, setMissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    if (!vehicle) return;
    setLoading(true);
    vehicleService.getVehicleMissions(vehicle.vehicleId, { page, limit: 15 })
      .then(({ data }) => setMissions(data))
      .catch(() => setMissions({ missions: [], pagination: null }))
      .finally(() => setLoading(false));
  }, [vehicle, page]);

  if (!vehicle) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-brand font-bold text-navy text-base">{vehicle.nom}</h3>
            <p className="text-xs text-slate-400">{vehicle.immatriculation} · {vehicle.type} · Historique missions</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-500 text-base">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div style={{ width: 24, height: 24, border: "2.5px solid #e2e8f0", borderTop: "2.5px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
            </div>
          ) : missions?.missions?.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Aucune mission pour ce véhicule</p>
          ) : (
            <div className="space-y-2">
              {missions?.missions?.map((m) => (
                <div
                  key={m._id}
                  onClick={() => navigate(`/transports/${m._id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-primary hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-slate-500 text-sm">ambulance</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-primary">{m.numero}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        ["COMPLETED","BILLED","PAID"].includes(m.statut) ? "bg-emerald-100 text-emerald-700" :
                        ["CANCELLED","NO_SHOW","FAILED"].includes(m.statut) ? "bg-red-100 text-red-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{m.statut}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {fmtDate(m.dateTransport)}
                      {m.adresseDepart?.ville || m.adresseDepart?.rue
                        ? ` · ${m.adresseDepart.ville || m.adresseDepart.rue}`
                        : ""}
                      {m.adresseDestination?.nom || m.adresseDestination?.ville
                        ? ` → ${m.adresseDestination.nom || m.adresseDestination.ville}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {m.distanceKm != null && (
                      <p className="text-xs font-mono text-slate-500">{m.distanceKm} km</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {missions?.pagination && missions.pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {missions.pagination.total} mission(s) · Page {page}/{missions.pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(missions.pagination.pages, p + 1))}
                disabled={page === missions.pagination.pages}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function FleetDashboard() {
  const navigate = useNavigate();

  // ── État global ──────────────────────────────────────────────────────────────
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [period, setPeriod]       = useState("month");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  // ── Disponibilité par créneau ────────────────────────────────────────────────
  const [availDate, setAvailDate]       = useState(new Date().toISOString().split("T")[0]);
  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);

  // ── Modal missions ───────────────────────────────────────────────────────────
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // ── Chargement dashboard ─────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await vehicleService.getFleetDashboard({ period });
      setStats(data);
    } catch {
      setError("Impossible de charger le tableau de bord flotte.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── Chargement disponibilité ──────────────────────────────────────────────────
  const loadAvailability = useCallback(async () => {
    setAvailLoading(true);
    try {
      const { data } = await vehicleService.getVehicleAvailability(availDate);
      setAvailability(data?.slots || []);
    } catch {
      setAvailability([]);
    } finally {
      setAvailLoading(false);
    }
  }, [availDate]);

  useEffect(() => {
    if (activeTab === "availability") loadAvailability();
  }, [activeTab, availDate, loadAvailability]);

  // ── Données filtrées ──────────────────────────────────────────────────────────
  const vehicleSummaries = (stats?.vehicleSummaries || []).filter(
    (v) => typeFilter === "all" || v.type === typeFilter
  );

  const upcomingMaintenances = stats?.upcomingMaintenances || [];
  const maintenanceAlerts    = stats?.maintenanceAlerts    || [];

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3">
        <div style={{ width: 24, height: 24, border: "2.5px solid #e2e8f0", borderTop: "2.5px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
        <span className="text-sm text-slate-500">Chargement du tableau de bord flotte…</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-slate-300 text-5xl block mb-3">error_outline</span>
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        <button onClick={loadDashboard} className="text-primary font-semibold hover:underline text-sm">
          Réessayer
        </button>
      </div>
    );
  }

  const v = stats?.vehicles || {};
  const m = stats?.missions  || {};
  const p = stats?.performance || {};
  const f = stats?.financial   || {};

  return (
    <div className="pb-20 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/flotte")}
              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-slate-500 text-base">arrow_back</span>
            </button>
            <div>
              <h1 className="font-brand font-bold text-navy text-lg">Tableau de bord flotte</h1>
              <p className="text-xs text-slate-400">
                {v.total} véhicule(s) · {stats?.dateRange?.start ? new Date(stats.dateRange.start).toLocaleDateString("fr-FR") : "—"} – {stats?.dateRange?.end ? new Date(stats.dateRange.end).toLocaleDateString("fr-FR") : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtre période */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary bg-white"
            >
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {/* Filtre type */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary bg-white"
            >
              {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button
              onClick={loadDashboard}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Actualiser
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── KPI cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard icon="directions_car"  label="Total véhicules"    value={v.total}        bg="bg-white" />
          <KpiCard icon="check_circle"    label="Disponibles"        value={v.available}    color="text-emerald-600" />
          <KpiCard icon="ambulance"       label="En mission"         value={v.inMission}    color="text-blue-600" />
          <KpiCard icon="build"           label="Maintenance"        value={v.inMaintenance} color="text-amber-600" />
          <KpiCard icon="cancel"          label="Hors service"       value={v.outOfService} color="text-red-600" />
          <KpiCard icon="speed"           label="Taux utilisation"   value={`${p.averageUtilizationRate ?? 0}%`} color={p.averageUtilizationRate >= 85 ? "text-red-600" : "text-primary"} />
          <KpiCard icon="route"           label="Km ce mois"         value={fmtKm(m.totalKm)} />
          <KpiCard icon="euro"            label="Coût estimé"        value={fmtEuro(f.estimatedTotalCost)} color="text-violet-600" />
        </div>

        {/* ── Alertes actives ───────────────────────────────────────────────── */}
        {maintenanceAlerts.filter((a) => a.severity !== "ok").length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-mono font-bold text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">warning</span>
              {maintenanceAlerts.filter((a) => a.severity !== "ok").length} alerte(s) active(s)
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {maintenanceAlerts.filter((a) => a.severity !== "ok").slice(0, 6).map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg p-2.5 border ${PRIORITY_CONFIG[a.severity]?.color || ""}`}>
                  <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">
                    {PRIORITY_CONFIG[a.severity]?.icon || "info"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{a.vehicleName}</p>
                    <p className="text-[10px] mt-0.5">{a.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="border-b border-slate-200">
          <div className="flex gap-1">
            {[
              { id: "overview",      icon: "dashboard",    label: "Véhicules" },
              { id: "availability",  icon: "calendar_view_week", label: "Disponibilité" },
              { id: "maintenances",  icon: "build_circle", label: "Maintenances" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="material-symbols-outlined text-base">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: Véhicules                                                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div>
            {vehicleSummaries.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-slate-300 text-5xl block mb-3">directions_car</span>
                <p className="text-slate-500 text-sm">Aucun véhicule trouvé</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Véhicule</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Statut</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Km mois</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Missions</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Utilisation</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Carburant</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Maintenance</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {vehicleSummaries.map((v) => (
                        <tr
                          key={String(v.vehicleId)}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          {/* Véhicule */}
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-semibold text-navy text-sm">{v.nom}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{v.immatriculation} · {v.type}</p>
                            </div>
                          </td>

                          {/* Statut */}
                          <td className="px-4 py-3">
                            <StatutBadge statut={v.statut} />
                          </td>

                          {/* Km */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-slate-700">{fmtKm(v.monthlyKm)}</span>
                            <p className="text-[10px] text-slate-400">{fmtKm(v.kmActuel)} total</p>
                          </td>

                          {/* Missions */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-slate-700">{v.monthlyMissions}</span>
                            <p className="text-[10px] text-slate-400">{v.completedMissions} terminées</p>
                          </td>

                          {/* Utilisation */}
                          <td className="px-4 py-3">
                            <UtilBar rate={v.utilizationRate} />
                          </td>

                          {/* Carburant */}
                          <td className="px-4 py-3">
                            <FuelBar level={v.carburant} />
                          </td>

                          {/* Maintenance */}
                          <td className="px-4 py-3">
                            <PriorityBadge priority={v.maintenancePriority} />
                            {v.alertCount > 0 && (
                              <p className="text-[10px] text-red-600 mt-0.5 truncate max-w-[120px]" title={v.topAlertMessage}>
                                {v.topAlertMessage}
                              </p>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSelectedVehicle(v)}
                                className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center hover:bg-blue-100"
                                title="Voir les missions"
                              >
                                <span className="material-symbols-outlined text-primary text-sm">history</span>
                              </button>
                              <button
                                onClick={() => navigate(`/flotte/${v.vehicleId}`)}
                                className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200"
                                title="Fiche véhicule"
                              >
                                <span className="material-symbols-outlined text-slate-600 text-sm">open_in_new</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: Disponibilité par créneau                                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "availability" && (
          <div className="space-y-4">
            {/* Date picker */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-700">Date :</label>
              <input
                type="date"
                value={availDate}
                onChange={(e) => setAvailDate(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {availLoading && (
                <div style={{ width: 18, height: 18, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              )}
            </div>

            {/* Légende */}
            <div className="flex items-center gap-4 flex-wrap text-xs">
              {[
                { status: "available",      label: "Disponible" },
                { status: "in_mission",     label: "En mission" },
                { status: "maintenance",    label: "Maintenance" },
                { status: "out_of_service", label: "Hors service" },
              ].map((l) => (
                <div key={l.status} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-sm border ${SLOT_COLORS[l.status]}`} />
                  <span className="text-slate-600">{l.label}</span>
                </div>
              ))}
            </div>

            {/* Grille créneaux */}
            {!availability || availability.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">Aucune donnée disponible pour cette date</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {availability.map((slot) => (
                  <div key={slot.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    {/* En-tête créneau */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-500 text-sm">schedule</span>
                        <span className="font-semibold text-navy text-sm">{slot.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="text-emerald-600 font-semibold">{slot.summary?.available ?? 0} dispo.</span>
                        <span className="text-blue-600 font-semibold">{slot.summary?.inMission ?? 0} en mission</span>
                        {(slot.summary?.inMaintenance ?? 0) > 0 && (
                          <span className="text-amber-600 font-semibold">{slot.summary.inMaintenance} maint.</span>
                        )}
                        {(slot.summary?.outOfService ?? 0) > 0 && (
                          <span className="text-red-600 font-semibold">{slot.summary.outOfService} H.S.</span>
                        )}
                      </div>
                    </div>

                    {/* Barre de répartition */}
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex mb-3">
                      {[
                        { key: "available",      color: "bg-emerald-400" },
                        { key: "in_mission",     color: "bg-blue-400" },
                        { key: "maintenance",    color: "bg-amber-400" },
                        { key: "out_of_service", color: "bg-red-400" },
                      ].map(({ key, color }) => {
                        const count = slot.summary?.[key] || 0;
                        const pct   = slot.summary?.total > 0 ? (count / slot.summary.total) * 100 : 0;
                        return pct > 0 ? (
                          <div key={key} className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                        ) : null;
                      })}
                    </div>

                    {/* Liste véhicules du créneau */}
                    <div className="flex flex-wrap gap-2">
                      {(slot.vehicles || []).slice(0, 12).map((veh) => (
                        <span
                          key={veh.id}
                          title={`${veh.nom} · ${veh.immatriculation} · ${veh.type}`}
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border ${SLOT_COLORS[veh.status] || "bg-slate-50 text-slate-500 border-slate-200"}`}
                        >
                          {veh.nom}
                          {veh.transportNumero && (
                            <span className="opacity-60">#{veh.transportNumero?.slice(-4)}</span>
                          )}
                        </span>
                      ))}
                      {(slot.vehicles || []).length > 12 && (
                        <span className="text-[10px] text-slate-400 px-2 py-1">+{slot.vehicles.length - 12}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: Maintenances                                               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "maintenances" && (
          <div className="space-y-5">

            {/* Alertes */}
            {maintenanceAlerts.length > 0 && (
              <div>
                <h2 className="font-brand font-bold text-navy text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-red-500 text-base">warning</span>
                  Alertes actives
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {maintenanceAlerts.map((a, i) => (
                    <div key={i} className={`rounded-xl border p-3 ${PRIORITY_CONFIG[a.severity]?.color || "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-base flex-shrink-0">
                          {PRIORITY_CONFIG[a.severity]?.icon || "info"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">{a.vehicleName}</p>
                          <p className="text-[10px] font-mono text-current opacity-80">{a.immatriculation}</p>
                          <p className="text-[10px] mt-1">{a.message}</p>
                        </div>
                        <PriorityBadge priority={a.severity} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prochaines maintenances */}
            <div>
              <h2 className="font-brand font-bold text-navy text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-base">build_circle</span>
                Prochaines maintenances (30 jours)
              </h2>

              {upcomingMaintenances.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-xl border border-slate-200">
                  <span className="material-symbols-outlined text-slate-300 text-4xl block mb-2">check_circle</span>
                  <p className="text-sm text-slate-400">Aucune maintenance planifiée dans les 30 prochains jours</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Véhicule</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Type</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Statut</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Garage</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Coût</th>
                        <th className="text-left px-4 py-3 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Priorité</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {upcomingMaintenances.map((m, i) => (
                        <tr key={m._id || i} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-navy text-xs">{m.vehicleName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{m.immatriculation}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700">{m.type}</td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-slate-700">
                              {m.dateDebut ? fmtDate(m.dateDebut) : "À planifier"}
                            </p>
                            {m.daysUntil != null && (
                              <p className="text-[10px] text-slate-400">
                                {m.daysUntil < 0 ? `${Math.abs(m.daysUntil)} j de retard` : `dans ${m.daysUntil} j`}
                              </p>
                            )}
                            {m.kmLeft != null && (
                              <p className="text-[10px] text-slate-400">
                                {m.kmLeft <= 0 ? `${Math.abs(m.kmLeft)} km dépassés` : `${m.kmLeft} km restants`}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              m.statut === "en-cours" ? "bg-blue-100 text-blue-700" :
                              m.statut === "planifié" ? "bg-indigo-100 text-indigo-700" :
                              "bg-slate-100 text-slate-600"
                            }`}>{m.statut}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{m.garage || "—"}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-700">
                            {m.cout ? fmtEuro(m.cout) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <PriorityBadge priority={m.priority} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal missions ───────────────────────────────────────────────── */}
      {selectedVehicle && (
        <MissionsModal vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
      )}
    </div>
  );
}
