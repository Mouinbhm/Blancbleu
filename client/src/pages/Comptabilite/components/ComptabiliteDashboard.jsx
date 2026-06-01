/**
 * ComptabiliteDashboard — sections compta du dashboard (hors récap annuel).
 *
 * Regroupe (comportement identique au monolithe) :
 *   A. sélecteur de période (mois/année)
 *   F. alertes
 *   B. KPI cards (total/brouillons/en attente/payées/CA encaissé + résultat net)
 *   C. graphiques Bar (CA & charges) + Doughnut (répartition charges)
 *   D. détail charges (ChargesDetail) + bloc URSSAF
 *
 * Les données dérivées (barData/doughnutData/resultatNet) sont calculées ici,
 * seul consommateur. Le récap annuel (section E) reste géré ailleurs.
 */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { fmtMontant, fmtEur } from "../../../utils/formatters";
import { MOIS_LABELS, MOIS_NOMS, ANNEES } from "../utils/factureConstants";
import ChargesDetail from "./ChargesDetail";
import UrssafCard from "./UrssafCard";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export default function ComptabiliteDashboard({
  compta,
  comptaLoading,
  stats,
  moisActuel,
  anneeActuelle,
  onMois,
  onAnnee,
  onExportDSN,
}) {
  // ── Données graphiques ─────────────────────────────────────────────────────
  const barData = {
    labels: MOIS_LABELS,
    datasets: [
      {
        label: "CA (€)",
        data: compta?.ca?.parMois || Array(12).fill(0),
        backgroundColor: "#3B82F6",
        borderRadius: 4,
      },
      {
        label: "Charges (€)",
        data: compta?.charges?.parMois || Array(12).fill(0),
        backgroundColor: "#EF4444",
        borderRadius: 4,
      },
    ],
  };
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "top", labels: { font: { size: 11 }, boxWidth: 12 } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 }, callback: (v) => `${v} €` } },
    },
  };

  const doughnutData = {
    labels: ["Salaires", "URSSAF", "Maintenances"],
    datasets: [
      {
        data: [
          compta?.charges?.salaires || 0,
          compta?.charges?.urssaf || 0,
          compta?.charges?.maintenances || 0,
        ],
        backgroundColor: ["#3B82F6", "#F97316", "#EF4444"],
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
    },
    cutout: "65%",
  };

  const resultatNet = compta?.resultatNet ?? null;
  const isPositif = resultatNet !== null && resultatNet >= 0;
  const moisNomActuel = MOIS_NOMS[moisActuel - 1];

  return (
    <>
      {/* ── Section A : Sélecteur de période ───────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3 w-fit">
        <span className="material-symbols-outlined text-slate-400 text-base">calendar_month</span>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Période :
        </span>
        <select
          value={moisActuel}
          onChange={(e) => onMois(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none bg-white"
        >
          {MOIS_NOMS.map((n, i) => (
            <option key={i} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={anneeActuelle}
          onChange={(e) => onAnnee(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none bg-white"
        >
          {ANNEES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {comptaLoading && (
          <div
            style={{
              width: 14,
              height: 14,
              border: "2px solid #e2e8f0",
              borderTop: "2px solid #1D6EF5",
              borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }}
          />
        )}
      </div>

      {/* ── Section F : Alertes ────────────────────────────────────────────── */}
      {compta?.alertes?.length > 0 && (
        <div className="flex flex-col gap-2 mb-5">
          {compta.alertes.map((a, i) => {
            const cfg = {
              danger: {
                bg: "bg-red-50",
                border: "border-red-200",
                text: "text-red-700",
                icon: "error",
              },
              warning: {
                bg: "bg-orange-50",
                border: "border-orange-200",
                text: "text-orange-700",
                icon: "warning",
              },
              success: {
                bg: "bg-green-50",
                border: "border-green-200",
                text: "text-green-700",
                icon: "check_circle",
              },
            }[a.type] || {
              bg: "bg-slate-50",
              border: "border-slate-200",
              text: "text-slate-600",
              icon: "info",
            };
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}
              >
                <span className="material-symbols-outlined text-base">{cfg.icon}</span>
                {a.message}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Section B : KPI cards (5 existantes + Résultat net) ────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-5">
        {[
          { l: "Total", v: stats?.total || 0, icon: "receipt_long", c: "text-navy" },
          {
            l: "Brouillons",
            v: stats?.parStatut?.brouillons || 0,
            icon: "draft",
            c: "text-slate-500",
          },
          {
            l: "En attente",
            v: stats?.parStatut?.enAttente || 0,
            icon: "pending",
            c: "text-yellow-600",
          },
          {
            l: "Payées",
            v: stats?.parStatut?.payees || 0,
            icon: "check_circle",
            c: "text-emerald-600",
          },
          {
            l: `CA encaissé — ${MOIS_NOMS[moisActuel - 1]}`,
            v: fmtMontant(compta?.ca?.encaisse ?? compta?.ca?.total ?? stats?.chiffreAffaires ?? 0),
            icon: "euro",
            c: "text-blue-600",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3"
          >
            <span className={`material-symbols-outlined ${k.c}`}>{k.icon}</span>
            <div>
              <p className="text-xs text-slate-400">{k.l}</p>
              <p className={`text-lg font-mono font-bold ${k.c}`}>{k.v}</p>
            </div>
          </div>
        ))}

        {/* Résultat net */}
        <div
          className={`rounded-xl border p-4 flex flex-col gap-1 ${isPositif ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-slate-500">analytics</span>
            <p className="text-xs text-slate-500 font-semibold">Résultat net</p>
          </div>
          <p
            className={`text-lg font-mono font-bold ${isPositif ? "text-green-700" : "text-red-700"}`}
          >
            {resultatNet !== null ? fmtEur(resultatNet) : "—"}
          </p>
          <p className={`text-xs font-semibold ${isPositif ? "text-green-600" : "text-red-600"}`}>
            {resultatNet === null ? "—" : isPositif ? "✅ Bénéfice" : "🔴 Déficit"}
          </p>
          <p className="text-xs text-slate-400">CA − Charges</p>
        </div>
      </div>

      {/* ── Section C : Graphiques ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">
            Évolution CA &amp; Charges — {anneeActuelle}
          </p>
          <div style={{ height: 220 }}>
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">
            Répartition des charges — {moisNomActuel}
          </p>
          <div style={{ height: 220 }}>
            {(compta?.charges?.total || 0) > 0 ? (
              <Doughnut data={doughnutData} options={doughnutOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Aucune charge ce mois
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section D : Charges + URSSAF ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Charges */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-red-500 text-base">trending_down</span>
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
              Charges — {moisNomActuel} {anneeActuelle}
            </p>
          </div>
          {compta ? (
            <ChargesDetail compta={compta} fmtEur={fmtEur} />
          ) : (
            <p className="text-slate-400 text-sm">Données indisponibles</p>
          )}
        </div>

        {/* URSSAF */}
        <UrssafCard
          compta={compta}
          moisNomActuel={moisNomActuel}
          anneeActuelle={anneeActuelle}
          onExportDSN={onExportDSN}
        />
      </div>
    </>
  );
}
