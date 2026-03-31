import { useState } from "react";
import StatusBadge from "../components/ui/StatusBadge";

const FLEET = [
  {
    code: "AMB-01",
    model: "Mercedes Sprinter 4x4",
    status: "disponible",
    zone: "Nord",
    km: "48 320",
    mission: "14:22",
    crew: "Equipe A",
  },
  {
    code: "AMB-03",
    model: "Renault Master III",
    status: "en-route",
    zone: "Sud",
    km: "61 890",
    mission: "15:41",
    crew: "Equipe C",
  },
  {
    code: "AMB-05",
    model: "Ford Transit Custom",
    status: "sur-place",
    zone: "Est",
    km: "29 450",
    mission: "15:38",
    crew: "Equipe D",
  },
  {
    code: "AMB-07",
    model: "Renault Master III",
    status: "en-route",
    zone: "Ouest",
    km: "44 200",
    mission: "14:58",
    crew: "Equipe E",
  },
  {
    code: "AMB-09",
    model: "Mercedes Sprinter",
    status: "en-route",
    zone: "Centre",
    km: "55 780",
    mission: "15:30",
    crew: "Equipe F",
  },
  {
    code: "AMB-11",
    model: "Ford Transit Custom",
    status: "disponible",
    zone: "Nord",
    km: "38 990",
    mission: "13:15",
    crew: "Equipe G",
  },
  {
    code: "AMB-12",
    model: "Renault Master III",
    status: "en-route",
    zone: "Sud",
    km: "27 330",
    mission: "15:44",
    crew: "Equipe H",
  },
  {
    code: "AMB-15",
    model: "Mercedes Sprinter 4x4",
    status: "hors-service",
    zone: "—",
    km: "71 200",
    mission: "12:00",
    crew: "—",
  },
];

const TABS = ["Ambulances", "Personnel", "Équipements", "Maintenance"];

export default function Flotte() {
  const [tab, setTab] = useState("Ambulances");
  const [filter, setFilter] = useState("Tous");

  const filtered =
    filter === "Tous"
      ? FLEET
      : FLEET.filter(
          (u) => u.status === filter.toLowerCase().replace(" ", "-"),
        );

  const kpis = [
    { l: "Total unités", v: 16, bar: 100, color: "bg-slate-400" },
    {
      l: "Disponibles",
      v: FLEET.filter((u) => u.status === "disponible").length,
      bar: 56,
      color: "bg-emerald-500",
    },
    {
      l: "En mission",
      v: FLEET.filter(
        (u) => u.status === "en-route" || u.status === "sur-place",
      ).length,
      bar: 37,
      color: "bg-blue-500",
    },
    {
      l: "Maintenance",
      v: FLEET.filter((u) => u.status === "hors-service").length,
      bar: 7,
      color: "bg-yellow-500",
    },
  ];

  return (
    <div className="p-7 fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">
            Flotte & Ressources
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestion opérationnelle des unités de secours
          </p>
        </div>
        <button className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-lg">add</span>
          Nouvelle Unité
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {kpis.map((k) => (
          <div
            key={k.l}
            className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm"
          >
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">
              {k.l}
            </p>
            <p className="font-mono text-3xl font-bold text-navy mb-3">{k.v}</p>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${k.color}`}
                style={{ width: `${k.bar}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-navy"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        {["Tous", "Disponible", "En route", "Sur place", "Hors service"].map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                filter === f
                  ? "bg-navy text-white"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-navy"
              }`}
            >
              {f}
            </button>
          ),
        )}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full">
          <thead>
            <tr className="bg-navy">
              {[
                "ID",
                "Modèle",
                "Statut",
                "Zone",
                "Équipe",
                "Dernière mission",
                "KM",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-5 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr
                key={u.code}
                className={`border-b border-slate-100 hover:bg-blue-50 hover:border-l-4 hover:border-l-primary cursor-pointer transition-all ${
                  i % 2 === 1 ? "bg-slate-50/30" : "bg-white"
                }`}
              >
                <td className="px-5 py-4 font-mono font-bold text-navy text-sm">
                  {u.code}
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-700">
                  {u.model}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={u.status} />
                </td>
                <td className="px-5 py-4 text-sm text-slate-500">{u.zone}</td>
                <td className="px-5 py-4 text-sm text-slate-500">{u.crew}</td>
                <td className="px-5 py-4 font-mono text-sm text-slate-600">
                  {u.mission}
                </td>
                <td className="px-5 py-4 font-mono text-sm text-slate-600">
                  {u.km}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    {[
                      ["visibility", "Voir"],
                      ["location_on", "Carte"],
                      ["build", "Maintenance"],
                    ].map(([icon, title]) => (
                      <button
                        key={icon}
                        title={title}
                        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-surface hover:border-primary transition-all group"
                      >
                        <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                          {icon}
                        </span>
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Affichage de {filtered.length} sur {FLEET.length} unités
          </span>
          <button className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-all">
            <span className="material-symbols-outlined text-sm">download</span>
            Exporter CSV
          </button>
        </div>
      </div>

      {/* AI Insight */}
      <div className="mt-5 bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-100 p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-primary">
            psychology
          </span>
        </div>
        <div>
          <p className="font-bold text-navy text-sm mb-1">
            Optimisation IA Flotte
          </p>
          <p className="text-sm text-slate-600">
            Pic d'activité prévu dans{" "}
            <span className="font-mono font-bold text-primary">45 min</span> en
            Secteur Nord. Déployer{" "}
            <span className="font-mono font-bold text-primary">AMB-01</span> en
            position stratégique Zone B-12.
          </p>
          <button className="mt-3 bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Appliquer la recommandation
          </button>
        </div>
      </div>
    </div>
  );
}
