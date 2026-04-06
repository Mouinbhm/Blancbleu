import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import KpiCard from "../components/ui/KpiCard";
import InterventionCard from "../components/interventions/InterventionCard";
import UnitsPanel from "../components/units/UnitsPanel";
import { interventionService, unitService } from "../services/api";

const FILTERS = ["Tout", "P1 Critique", "P2 Urgent", "P3 Standard"];

// ─── Calcul durée écoulée ─────────────────────────────────────────────────────
function elapsed(heureAppel) {
  if (!heureAppel) return "—";
  const diff = Math.floor((Date.now() - new Date(heureAppel)) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
  const s = String(diff % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ─── Convertit une intervention backend → format InterventionCard ─────────────
function toCardData(i) {
  const statusMap = {
    en_cours: "en-route",
    en_attente: "attente",
    terminee: "terminee",
    annulee: "annulee",
  };
  const priorityMap = { P1: 1, P2: 2, P3: 3 };
  return {
    id: i._id,
    ref: i.numero || `#${i._id.slice(-6).toUpperCase()}`,
    priority: priorityMap[i.priorite] || 3,
    type: i.typeIncident,
    address: i.adresse,
    unit: i.unitAssignee?.nom || "—",
    status: statusMap[i.statut] || i.statut,
    elapsed: elapsed(i.heureAppel),
    aiScore: i.scoreIA || 0,
    raw: i,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("Tout");
  const [selected, setSelected] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // pour rafraîchir les durées

  // ── Chargement initial ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [intRes, unitRes, statsRes] = await Promise.all([
        interventionService.getAll({ statut: "en_cours", limit: 20 }),
        unitService.getAll(),
        interventionService.getStats(),
      ]);
      setInterventions((intRes.data.interventions || []).map(toCardData));
      setUnits(unitRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Refresh auto toutes les 30s ───────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(loadData, 30000);
    return () => clearInterval(iv);
  }, [loadData]);

  // ── Tick toutes les secondes pour mettre à jour les durées ────────────────
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Recalcul des durées à chaque tick ─────────────────────────────────────
  const liveInterventions = interventions.map((i) => ({
    ...i,
    elapsed: elapsed(i.raw?.heureAppel),
  }));

  // ── Filtres ───────────────────────────────────────────────────────────────
  const filtered =
    filter === "Tout"
      ? liveInterventions
      : liveInterventions.filter((i) =>
          filter === "P1 Critique"
            ? i.priority === 1
            : filter === "P2 Urgent"
              ? i.priority === 2
              : i.priority === 3,
        );

  // ── KPIs dynamiques ───────────────────────────────────────────────────────
  const actives = stats?.parStatut?.enCours || 0;
  const enAttente = stats?.parStatut?.enAttente || 0;
  const terminees = stats?.parStatut?.terminees || 0;
  const disponibles = units.filter((u) => u.statut === "disponible").length;

  // ── Action : changer statut intervention ──────────────────────────────────
  const handleChangeStatus = async (id, statut) => {
    try {
      await interventionService.updateStatus(id, statut);
      await loadData();
      setSelected(null);
    } catch {
      alert("Erreur lors de la mise à jour.");
    }
  };

  return (
    <div className="p-7 fade-in">
      {/* KPI STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        <KpiCard
          label="Interventions actives"
          value={loading ? "…" : actives}
          color="danger"
          icon="emergency"
          trend={loading ? "" : `${enAttente} en attente`}
          trendType="bad"
        />
        <KpiCard
          label="En attente"
          value={loading ? "…" : enAttente}
          color="warning"
          icon="hourglass_empty"
          trend={`${disponibles} unités dispo`}
        />
        <KpiCard
          label="Terminées aujourd'hui"
          value={loading ? "…" : terminees}
          color="success"
          icon="check_circle"
          trend={`Total : ${stats?.total || 0}`}
          trendType="good"
        />
        <KpiCard
          label="Unités disponibles"
          value={loading ? "…" : disponibles}
          color="primary"
          icon="ambulance"
          trend={`/ ${units.length} total`}
          trendType={disponibles > 0 ? "good" : "bad"}
        />
      </div>

      {/* IA INSIGHT BANNER */}
      <div className="bg-gradient-to-r from-navy to-blue-900 rounded-xl p-4 mb-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/30 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-white text-xl">
            psychology
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-blue-300 uppercase tracking-widest mb-0.5">
            Aide IA
          </p>
          <p className="text-sm text-white font-medium">
            {interventions.filter((i) => i.priority === 1).length > 0 ? (
              <>
                <span className="text-yellow-400 font-bold">
                  {interventions.filter((i) => i.priority === 1).length}{" "}
                  intervention(s) P1
                </span>{" "}
                en cours — {disponibles} unité(s) disponible(s) pour renfort.
              </>
            ) : (
              <>
                Système opérationnel —{" "}
                <span className="text-green-400 font-bold">
                  {disponibles} unité(s)
                </span>{" "}
                disponible(s).
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate("/aide-ia")}
          className="text-xs font-bold text-primary border border-primary/40 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-all flex-shrink-0"
        >
          Analyser
        </button>
      </div>

      {/* MAIN GRID */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 300px" }}>
        {/* Interventions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-brand font-bold text-navy text-base uppercase tracking-tight">
                Interventions en cours
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {loading
                  ? "Chargement…"
                  : `${filtered.length} intervention(s) affichée(s)`}
              </p>
            </div>
            <div className="flex gap-1 bg-surface rounded-lg p-1 border border-slate-200">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    filter === f
                      ? "bg-white text-navy shadow-sm"
                      : "text-slate-500 hover:text-navy"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
              <div
                style={{
                  width: 20,
                  height: 20,
                  border: "2px solid #e2e8f0",
                  borderTop: "2px solid #1D6EF5",
                  borderRadius: "50%",
                  animation: "spin .7s linear infinite",
                }}
              />
              Chargement des interventions…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <span
                className="material-symbols-outlined text-slate-300"
                style={{ fontSize: 48 }}
              >
                emergency
              </span>
              <p className="text-slate-400 mt-3 text-sm">
                Aucune intervention en cours
              </p>
              <button
                onClick={() => navigate("/interventions")}
                className="mt-4 bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Voir toutes les interventions
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((i) => (
                <InterventionCard
                  key={i.id}
                  data={i}
                  onClick={() => setSelected(selected?.id === i.id ? null : i)}
                />
              ))}
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div className="mt-4 bg-white rounded-xl border border-slate-200 p-5 slide-up shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-brand font-bold text-navy">
                  {selected.ref} — Détails
                </h3>
                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  ["Type", selected.type],
                  ["Unité", selected.unit],
                  ["Statut", selected.status],
                  ["Priorité", `P${selected.priority}`],
                  ["Durée", selected.elapsed],
                  ["Score IA", `${selected.aiScore}%`],
                  ["Adresse", selected.address],
                  ["Patient", selected.raw?.patient?.nom || "Inconnu"],
                  ["État patient", selected.raw?.patient?.etat || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface rounded-lg p-3">
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">
                      {k}
                    </p>
                    <p className="font-bold text-navy text-sm">{v}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() =>
                    navigate(
                      `/carte?unitId=${selected.raw?.unitAssignee?._id || ""}`,
                    )
                  }
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
                >
                  Voir sur la carte
                </button>
                {selected.status === "en-route" && (
                  <button
                    onClick={() => handleChangeStatus(selected.id, "terminee")}
                    className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-colors"
                  >
                    Marquer terminée
                  </button>
                )}
                {selected.status === "attente" && (
                  <button
                    onClick={() => navigate("/interventions")}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-surface transition-colors"
                  >
                    Assigner une unité
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Units Panel — données dynamiques */}
        <UnitsPanel units={units} loading={loading} />
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
