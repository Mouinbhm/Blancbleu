import { useState, useEffect, useCallback } from "react";
import { interventionService, unitService } from "../services/api";

const PERIODS = ["Aujourd'hui", "7 jours", "30 jours", "Personnalisé"];

const DONUT_COLORS = {
  "Arrêt cardiaque": "#DC2626",
  AVC: "#7C3AED",
  "Accident de la route": "#1D6EF5",
  "Traumatisme grave": "#0B1F4E",
  "Détresse respiratoire": "#60A5FA",
  "Douleur thoracique": "#F59E0B",
  Malaise: "#10B981",
  Chute: "#6B7280",
  Brûlure: "#EF4444",
  Intoxication: "#8B5CF6",
  Accouchement: "#EC4899",
  Autre: "#D97706",
};

const heatColor = (v) =>
  v < 0.2
    ? "#EFF6FF"
    : v < 0.4
      ? "#BFDBFE"
      : v < 0.6
        ? "#60A5FA"
        : v < 0.8
          ? "#1D6EF5"
          : "#0B1F4E";

export default function Rapports() {
  const [period, setPeriod] = useState("30 jours");
  const [stats, setStats] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allInts, setAllInts] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, unitsRes, allRes] = await Promise.all([
        interventionService.getStats(),
        unitService.getAll(),
        interventionService.getAll({ limit: 200 }),
      ]);
      setStats(statsRes.data);
      setUnits(unitsRes.data);
      setAllInts(allRes.data.interventions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── KPIs calculés ─────────────────────────────────────────────────────────
  const total = stats?.total || 0;
  const terminees = stats?.parStatut?.terminees || 0;
  const enCours = stats?.parStatut?.enCours || 0;
  const tauxSucces = total > 0 ? ((terminees / total) * 100).toFixed(1) : "0.0";
  const dispos = units.filter((u) => u.statut === "disponible").length;
  const enMission = units.filter((u) => u.statut === "en_mission").length;
  const utilFlotte =
    units.length > 0 ? Math.round((enMission / units.length) * 100) : 0;

  // TMR moyen depuis les données réelles
  const tmrMoyen = (() => {
    const avecTemps = allInts.filter((i) => i.heureDepart && i.heureAppel);
    if (!avecTemps.length) return "—";
    const avg =
      avecTemps.reduce((sum, i) => {
        return sum + (new Date(i.heureDepart) - new Date(i.heureAppel)) / 60000;
      }, 0) / avecTemps.length;
    return `${avg.toFixed(1)} min`;
  })();

  // ── Répartition par type (donut) ──────────────────────────────────────────
  const typeCounts = allInts.reduce((acc, i) => {
    acc[i.typeIncident] = (acc[i.typeIncident] || 0) + 1;
    return acc;
  }, {});
  const donutData = Object.entries(typeCounts)
    .map(([label, count]) => ({
      label,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: DONUT_COLORS[label] || "#6B7280",
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Interventions par heure (courbe) ──────────────────────────────────────
  const hourCounts = Array(24).fill(0);
  allInts.forEach((i) => {
    if (i.heureAppel) {
      const h = new Date(i.heureAppel).getHours();
      hourCounts[h]++;
    }
  });
  const maxHour = Math.max(...hourCounts, 1);
  const chartH = 140;
  const chartW = 400;
  const hourPoints = hourCounts.map((v, h) => ({
    x: (h / 23) * chartW,
    y: chartH - (v / maxHour) * chartH * 0.85 + 10,
    v,
    h,
  }));
  const pathD = hourPoints.reduce(
    (d, p, i) => (i === 0 ? `M${p.x},${p.y}` : `${d} L${p.x},${p.y}`),
    "",
  );
  const areaD = `${pathD} L${chartW},${chartH} L0,${chartH} Z`;

  // ── Temps de réponse par unité ────────────────────────────────────────────
  const unitTimes = units
    .map((u) => {
      const uInts = allInts.filter(
        (i) => i.unitAssignee?._id === u._id || i.unitAssignee === u._id,
      );
      const avecTemps = uInts.filter((i) => i.heureDepart && i.heureAppel);
      const avg =
        avecTemps.length > 0
          ? avecTemps.reduce(
              (s, i) =>
                s + (new Date(i.heureDepart) - new Date(i.heureAppel)) / 60000,
              0,
            ) / avecTemps.length
          : null;
      return {
        name: u.nom,
        time: avg ? avg.toFixed(1) : null,
        count: uInts.length,
      };
    })
    .filter((u) => u.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const maxTime = Math.max(
    ...unitTimes.map((u) => parseFloat(u.time) || 0),
    10,
  );

  // ── Heatmap 30 jours ──────────────────────────────────────────────────────
  const heatData = Array.from({ length: 30 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (29 - i));
    const dayStr = day.toISOString().split("T")[0];
    const count = allInts.filter((int) =>
      int.createdAt?.startsWith(dayStr),
    ).length;
    return {
      count,
      day: day.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    };
  });
  const maxDay = Math.max(...heatData.map((d) => d.count), 1);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    win.document.write(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
      <title>Rapport — Ambulances Blanc Bleu</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Segoe UI',Arial,sans-serif; color:#1e293b; padding:48px; }
        h1 { font-size:26px; font-weight:800; color:#0f172a; }
        .sub { font-size:12px; color:#64748b; margin-top:4px; margin-bottom:32px; }
        .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:32px; }
        .kpi { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; }
        .kpi-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px; }
        .kpi-val { font-size:28px; font-weight:800; color:#0f172a; font-family:monospace; }
        .kpi-trend { font-size:11px; color:#64748b; margin-top:4px; }
        .section { margin-bottom:28px; }
        .section-title { font-size:14px; font-weight:700; color:#0f172a; border-bottom:2px solid #1D6EF5; padding-bottom:6px; margin-bottom:14px; }
        table { width:100%; border-collapse:collapse; }
        th { background:#0f172a; color:#fff; padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
        td { padding:10px 14px; font-size:13px; border-bottom:1px solid #f1f5f9; }
        .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; }
        .p1 { background:#FEF2F2; color:#DC2626; }
        .p2 { background:#FFFBEB; color:#D97706; }
        .p3 { background:#EFF6FF; color:#1D6EF5; }
        .footer { margin-top:40px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; display:flex; justify-content:space-between; }
        @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
      </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <h1>Rapport Opérationnel</h1>
          <p class="sub">Ambulances Blanc Bleu · 59 Bd Madeleine, Nice · Période : ${period}</p>
        </div>
        <div style="text-align:right;font-size:12px;color:#64748b;">
          Généré le ${new Date().toLocaleDateString("fr-FR")}<br/>
          ${new Date().toLocaleTimeString("fr-FR")}
        </div>
      </div>
      <div class="grid4">
        <div class="kpi"><div class="kpi-label">TMR Moyen</div><div class="kpi-val">${tmrMoyen}</div><div class="kpi-trend">Temps moyen de réponse</div></div>
        <div class="kpi"><div class="kpi-label">Total interventions</div><div class="kpi-val">${total}</div><div class="kpi-trend">${enCours} actives maintenant</div></div>
        <div class="kpi"><div class="kpi-label">Taux de succès</div><div class="kpi-val">${tauxSucces}%</div><div class="kpi-trend">${terminees} terminées</div></div>
        <div class="kpi"><div class="kpi-label">Utilisation flotte</div><div class="kpi-val">${utilFlotte}%</div><div class="kpi-trend">${enMission} / ${units.length} unités</div></div>
      </div>
      <div class="section">
        <div class="section-title">Répartition par priorité</div>
        <table>
          <thead><tr><th>Priorité</th><th>Nombre</th><th>% du total</th></tr></thead>
          <tbody>
            <tr><td><span class="badge p1">P1 Critique</span></td><td>${stats?.parPriorite?.P1 || 0}</td><td>${total > 0 ? (((stats?.parPriorite?.P1 || 0) / total) * 100).toFixed(1) : 0}%</td></tr>
            <tr><td><span class="badge p2">P2 Urgent</span></td><td>${stats?.parPriorite?.P2 || 0}</td><td>${total > 0 ? (((stats?.parPriorite?.P2 || 0) / total) * 100).toFixed(1) : 0}%</td></tr>
            <tr><td><span class="badge p3">P3 Standard</span></td><td>${stats?.parPriorite?.P3 || 0}</td><td>${total > 0 ? (((stats?.parPriorite?.P3 || 0) / total) * 100).toFixed(1) : 0}%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Répartition par type d'incident</div>
        <table>
          <thead><tr><th>Type</th><th>Nombre</th><th>%</th></tr></thead>
          <tbody>${donutData.map((d) => `<tr><td>${d.label}</td><td>${d.count}</td><td>${d.pct}%</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Performance par unité</div>
        <table>
          <thead><tr><th>Unité</th><th>Missions</th><th>TMR moyen</th></tr></thead>
          <tbody>${unitTimes.map((u) => `<tr><td>${u.name}</td><td>${u.count}</td><td>${u.time ? u.time + " min" : "—"}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="footer">
        <span>Ambulances Blanc Bleu · SAMU 15 · Pompiers 18</span>
        <span>Document confidentiel — Usage interne</span>
      </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 600);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
        <div
          style={{
            width: 24,
            height: 24,
            border: "3px solid #e2e8f0",
            borderTop: "3px solid #1D6EF5",
            borderRadius: "50%",
            animation: "spin .7s linear infinite",
          }}
        />
        Chargement des rapports…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  return (
    <div className="p-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">
            Rapports Opérationnels
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Analyse de la performance en temps réel
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-surface rounded-lg p-1 border border-slate-200">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  period === p
                    ? "bg-white text-navy shadow-sm"
                    : "text-slate-500 hover:text-navy"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            PDF
          </button>
        </div>
      </div>

      {/* KPIs dynamiques */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {[
          {
            l: "TMR moyen",
            v: tmrMoyen,
            trend: `${enCours} actives maintenant`,
            good: true,
            icon: "timer",
          },
          {
            l: "Total interventions",
            v: total,
            trend: `P1: ${stats?.parPriorite?.P1 || 0} · P2: ${stats?.parPriorite?.P2 || 0} · P3: ${stats?.parPriorite?.P3 || 0}`,
            good: false,
            icon: "medical_services",
          },
          {
            l: "Taux de succès",
            v: `${tauxSucces}%`,
            trend: `${terminees} terminées`,
            good: true,
            icon: "task_alt",
          },
          {
            l: "Utilisation flotte",
            v: `${utilFlotte}%`,
            trend: `${enMission}/${units.length} unités en mission`,
            good: utilFlotte >= 70,
            icon: "local_shipping",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="bg-white rounded-xl border-t-4 border-blue-200 shadow-sm p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                {k.l}
              </p>
              <span className="material-symbols-outlined text-blue-200 text-2xl">
                {k.icon}
              </span>
            </div>
            <p className="font-mono text-3xl font-bold text-navy leading-none">
              {k.v}
            </p>
            <p
              className={`text-xs mt-2 font-medium ${k.good ? "text-emerald-600" : "text-slate-400"}`}
            >
              {k.trend}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* Courbe interventions par heure */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Interventions par heure
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Toutes les interventions enregistrées
          </p>
          <div className="relative h-44">
            <svg width="100%" height="100%" viewBox="0 0 400 160">
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D6EF5" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#1D6EF5" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 40, 80, 120, 160].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="400"
                  y2={y}
                  stroke="#F1F5F9"
                  strokeWidth="1"
                />
              ))}
              {total > 0 && (
                <>
                  <path d={areaD} fill="url(#areaGrad)" />
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#1D6EF5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {hourPoints
                    .filter((p) => p.v > 0)
                    .map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="4"
                        fill="#1D6EF5"
                        stroke="white"
                        strokeWidth="2"
                      >
                        <title>
                          {p.h}h : {p.v} intervention(s)
                        </title>
                      </circle>
                    ))}
                </>
              )}
              {[0, 4, 8, 12, 16, 20, 23].map((h) => (
                <text
                  key={h}
                  x={(h / 23) * 400}
                  y="158"
                  fontSize="9"
                  fill="#94A3B8"
                  fontFamily="monospace"
                >
                  {String(h).padStart(2, "0")}h
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Donut répartition par type */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Répartition par type
          </h3>
          <p className="text-xs text-slate-400 mb-4">Période sélectionnée</p>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg width="128" height="128" viewBox="0 0 128 128">
                {donutData.length > 0 ? (
                  (() => {
                    let offset = 0;
                    return donutData.map((d) => {
                      const dash = (d.pct / 100) * 314;
                      const gap = 314 - dash;
                      const el = (
                        <circle
                          key={d.label}
                          cx="64"
                          cy="64"
                          r="50"
                          fill="none"
                          stroke={d.color}
                          strokeWidth="24"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          transform="rotate(-90 64 64)"
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()
                ) : (
                  <circle
                    cx="64"
                    cy="64"
                    r="50"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="24"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono font-bold text-navy text-xl">
                  {total}
                </span>
                <span className="text-xs text-slate-400">Total</span>
              </div>
            </div>
            <div className="space-y-2 flex-1">
              {donutData.length > 0 ? (
                donutData.map((d) => (
                  <div key={d.label} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ background: d.color }}
                    />
                    <span className="text-xs text-slate-600 flex-1 truncate">
                      {d.label}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {d.pct}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">Aucune donnée</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-5">
        {/* Temps de réponse par unité */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Temps de réponse par unité
          </h3>
          <p className="text-xs text-slate-400 mb-5">Objectif : &lt; 6 min</p>
          {unitTimes.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              Aucune donnée disponible
            </p>
          ) : (
            <div className="space-y-4">
              {unitTimes.map((u) => {
                const t = parseFloat(u.time) || 0;
                const pct = Math.min((t / maxTime) * 100, 100);
                return (
                  <div key={u.name}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-slate-600">
                        {u.name}{" "}
                        <span className="font-normal text-slate-400">
                          ({u.count} missions)
                        </span>
                      </span>
                      <span
                        className={`font-mono ${!u.time ? "text-slate-300" : t > 6 ? "text-red-500" : "text-emerald-600"}`}
                      >
                        {u.time ? `${u.time} min` : "—"}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full ${pct > 80 ? "bg-red-400" : pct > 60 ? "bg-yellow-400" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-400/50"
                        style={{ left: "60%" }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                <div className="w-4 h-0.5 bg-red-400/50" />
                Ligne objectif (6 min)
              </div>
            </div>
          )}
        </div>

        {/* Heatmap 30 jours */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Charge opérationnelle
          </h3>
          <p className="text-xs text-slate-400 mb-4">30 derniers jours</p>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: "repeat(10,1fr)" }}
          >
            {heatData.map((d, i) => (
              <div
                key={i}
                className="h-8 rounded-lg cursor-pointer hover:scale-110 hover:shadow-md transition-all"
                style={{ background: heatColor(d.count / maxDay) }}
                title={`${d.day} : ${d.count} intervention(s)`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs text-slate-400 font-mono">Faible</span>
            {["#EFF6FF", "#BFDBFE", "#60A5FA", "#1D6EF5", "#0B1F4E"].map(
              (c) => (
                <div
                  key={c}
                  className="w-5 h-4 rounded"
                  style={{ background: c }}
                />
              ),
            )}
            <span className="text-xs text-slate-400 font-mono">Élevé</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 text-right">
            Max : {Math.max(...heatData.map((d) => d.count))} interventions /
            jour
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
