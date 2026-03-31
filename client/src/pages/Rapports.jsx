import { useState } from "react";

const ZONES = [
  { name: "Centre-Ville", time: 4.2, pct: 42 },
  { name: "Zone Nord", time: 7.8, pct: 78 },
  { name: "Quartier Universitaire", time: 5.1, pct: 51 },
  { name: "Périphérie Sud", time: 9.4, pct: 94 },
  { name: "Zone Ouest", time: 5.0, pct: 50 },
];

const DONUT = [
  { label: "Cardiologie", pct: 45, color: "#1D6EF5" },
  { label: "Traumatologie", pct: 25, color: "#0B1F4E" },
  { label: "Respiratoire", pct: 15, color: "#60A5FA" },
  { label: "Critique P1", pct: 10, color: "#DC2626" },
  { label: "Autre", pct: 5, color: "#D97706" },
];

const PERIODS = ["Aujourd'hui", "7 jours", "30 jours", "Personnalisé"];

export default function Rapports() {
  const [period, setPeriod] = useState("30 jours");

  const heatData = Array.from({ length: 30 }, () => Math.random());

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
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-lg">download</span>
            PDF
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {[
          {
            l: "TMR moyen",
            v: "6.2 min",
            trend: "↓12% vs mois dernier",
            good: true,
            icon: "timer",
          },
          {
            l: "Total interventions",
            v: "47",
            trend: "3 actives maintenant",
            good: false,
            icon: "medical_services",
          },
          {
            l: "Taux de succès",
            v: "94.3%",
            trend: "+2.1% amélioration",
            good: true,
            icon: "task_alt",
          },
          {
            l: "Utilisation flotte",
            v: "78%",
            trend: "Cible: 80%",
            good: false,
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
        {/* Area chart simulé */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Interventions par heure
          </h3>
          <p className="text-xs text-slate-400 mb-5">Aujourd'hui, 00h–24h</p>
          <div className="relative h-44">
            <svg width="100%" height="100%" viewBox="0 0 400 160">
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D6EF5" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#1D6EF5" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* Grid */}
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
              {/* Area */}
              <path
                d="M0,130 C30,110 50,60 80,80 C110,100 130,30 160,20 C190,10 210,70 240,55 C270,40 300,90 330,60 C360,30 380,50 400,40 L400,160 L0,160 Z"
                fill="url(#areaGrad)"
              />
              {/* Line */}
              <path
                d="M0,130 C30,110 50,60 80,80 C110,100 130,30 160,20 C190,10 210,70 240,55 C270,40 300,90 330,60 C360,30 380,50 400,40"
                fill="none"
                stroke="#1D6EF5"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Points */}
              {[
                [80, 80],
                [160, 20],
                [240, 55],
                [330, 60],
              ].map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#1D6EF5"
                  stroke="white"
                  strokeWidth="2"
                />
              ))}
              {/* Labels */}
              {["08h", "10h", "12h", "14h", "16h", "18h", "20h"].map((l, i) => (
                <text
                  key={l}
                  x={i * 60 + 10}
                  y="158"
                  fontSize="9"
                  fill="#94A3B8"
                  fontFamily="monospace"
                >
                  {l}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Donut */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Répartition par type
          </h3>
          <p className="text-xs text-slate-400 mb-4">Période sélectionnée</p>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg width="128" height="128" viewBox="0 0 128 128">
                {(() => {
                  let offset = 0;
                  return DONUT.map((d) => {
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
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono font-bold text-navy text-xl">
                  47
                </span>
                <span className="text-xs text-slate-400">Total</span>
              </div>
            </div>
            <div className="space-y-2 flex-1">
              {DONUT.map((d) => (
                <div key={d.label} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: d.color }}
                  />
                  <span className="text-xs text-slate-600 flex-1">
                    {d.label}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {d.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-5">
        {/* Zones bar */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Temps de réponse par zone
          </h3>
          <p className="text-xs text-slate-400 mb-5">Objectif : &lt; 6 min</p>
          <div className="space-y-4">
            {ZONES.map((z) => (
              <div key={z.name}>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-600">{z.name}</span>
                  <span
                    className={`font-mono ${z.time > 6 ? "text-red-500" : "text-emerald-600"}`}
                  >
                    {z.time} min
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all ${z.pct > 80 ? "bg-red-400" : z.pct > 60 ? "bg-yellow-400" : "bg-primary"}`}
                    style={{ width: `${z.pct}%` }}
                  />
                  {/* Objectif marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-400/50"
                    style={{ left: "60%" }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
              <div className="w-4 h-0.5 bg-red-400/50" />
              Ligne objectif (6 min)
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-brand font-bold text-navy mb-1">
            Charge opérationnelle
          </h3>
          <p className="text-xs text-slate-400 mb-4">30 derniers jours</p>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: "repeat(10, 1fr)" }}
          >
            {heatData.map((v, i) => (
              <div
                key={i}
                className="h-8 rounded-lg cursor-pointer hover:scale-110 hover:shadow-md transition-all"
                style={{ background: heatColor(v) }}
                title={`Jour ${i + 1}: ${Math.round(v * 20)} interventions`}
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
        </div>
      </div>
    </div>
  );
}
