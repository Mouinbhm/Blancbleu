import { useState, useEffect, useRef, useCallback } from "react";
import api, {
  factureService,
  transportService,
  paymentService,
  comptabiliteService,
} from "../services/api";
import useSocket from "../hooks/useSocket";
import { FactureRowSkeleton } from "../components/ui/Skeleton";
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

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMontant = (m) =>
  m != null ? `${Number(m).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €` : "—";
const fmtEur = (m) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(m || 0);

const patientNom = (f) => {
  if (f.patientId?.nom) return `${f.patientId.nom} ${f.patientId.prenom || ""}`.trim();
  if (f.transportId?.patient?.nom)
    return `${f.transportId.patient.nom} ${f.transportId.patient.prenom || ""}`.trim();
  return "—";
};

const MOIS_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];
const MOIS_NOMS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const ANNEES = [2024, 2025, 2026, 2027];

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "brouillon", label: "Brouillon" },
  { value: "emise", label: "Émise" },
  { value: "en_attente", label: "En attente" },
  { value: "payee", label: "Payée" },
  { value: "payment_failed", label: "Échec paiement" },
  { value: "remboursee", label: "Remboursée" },
  { value: "partiellement_remboursee", label: "Part. remboursée" },
  { value: "en_retard", label: "En retard" },
  { value: "annulee", label: "Annulée" },
];

const STATUT_STYLE = {
  brouillon: { cls: "bg-slate-100 text-slate-600", label: "Brouillon" },
  emise: { cls: "bg-blue-100 text-blue-700", label: "Émise" },
  en_attente: { cls: "bg-yellow-100 text-yellow-700", label: "En attente" },
  payee: { cls: "bg-emerald-100 text-emerald-700", label: "Payée" },
  payment_failed: { cls: "bg-red-100 text-red-700", label: "Échec paiement" },
  remboursee: { cls: "bg-purple-100 text-purple-700", label: "Remboursée" },
  partiellement_remboursee: { cls: "bg-violet-100 text-violet-700", label: "Part. remboursée" },
  en_retard: { cls: "bg-orange-100 text-orange-700", label: "En retard" },
  annulee: { cls: "bg-red-100 text-red-700", label: "Annulée" },
};

const PAYMENT_STATUS_STYLE = {
  UNPAID: { cls: "bg-slate-100 text-slate-500", icon: "pending", label: "Non payé" },
  PENDING: { cls: "bg-yellow-100 text-yellow-700", icon: "hourglass_empty", label: "En attente" },
  SUCCEEDED: { cls: "bg-emerald-100 text-emerald-700", icon: "check_circle", label: "Payé" },
  FAILED: { cls: "bg-red-100 text-red-700", icon: "error", label: "Échec" },
  REFUNDED: { cls: "bg-purple-100 text-purple-700", icon: "undo", label: "Remboursé" },
  PARTIALLY_REFUNDED: {
    cls: "bg-violet-100 text-violet-700",
    icon: "undo",
    label: "Part. remboursé",
  },
};

// ─── Téléchargement PDF blob ──────────────────────────────────────────────────
async function downloadBlob(promise, filename) {
  const response = await promise;
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

async function downloadCsvBlob(promise, filename) {
  const response = await promise;
  const url = window.URL.createObjectURL(
    new Blob([response.data], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// ─── Modal Impression ─────────────────────────────────────────────────────────
function ModalImpression({ facture, onClose }) {
  const handlePrint = () => {
    const content = document.getElementById("facture-print-content").innerHTML;
    const win = window.open("", "_blank", "width=800,height=900");
    win.document.write(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
      <title>Facture ${facture.numero}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff}
        .page{max-width:780px;margin:0 auto;padding:48px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #1D6EF5}
        .logo-name{font-size:26px;font-weight:800}
        .logo-sub{font-size:10px;color:#64748b;letter-spacing:0.1em;text-transform:uppercase}
        .logo-addr{font-size:11px;color:#64748b;margin-top:8px;line-height:1.6}
        .facture-num{font-size:22px;font-weight:800;color:#1D6EF5}
        .facture-date{font-size:12px;color:#64748b;margin-top:4px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
        .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
        .info-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px}
        .info-value{font-size:14px;font-weight:600;color:#0f172a}
        table{width:100%;border-collapse:collapse}
        thead tr{background:#0f172a;color:white}
        thead th{padding:10px 14px;text-align:left;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.8);font-weight:600}
        tbody tr{border-bottom:1px solid #f1f5f9}
        tbody td{padding:14px;font-size:13px}
        tfoot tr{background:#EFF6FF}
        tfoot td{padding:14px}
        .notes-box{background:#f8fafc;border-left:4px solid #1D6EF5;padding:14px;border-radius:4px;font-size:13px;color:#475569;margin-top:20px}
        .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><div class="page">${content}</div></body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 500);
  };

  const motif = facture.transportId?.motif || "Transport sanitaire";
  const patient = patientNom(facture);
  const statCfg = STATUT_STYLE[facture.statut] || STATUT_STYLE.en_attente;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "720px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid #f1f5f9",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="material-symbols-outlined"
              style={{ color: "#1D6EF5", fontSize: "22px" }}
            >
              receipt
            </span>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>
              Aperçu — {facture.numero}
            </span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handlePrint}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                borderRadius: "8px",
                background: "#1D6EF5",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                print
              </span>
              Imprimer / PDF
            </button>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px", color: "#94a3b8" }}
              >
                close
              </span>
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "32px 40px", flex: 1 }}>
          <div id="facture-print-content">
            <div
              className="header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "36px",
                paddingBottom: "20px",
                borderBottom: "3px solid #1D6EF5",
              }}
            >
              <div>
                <div
                  className="logo-name"
                  style={{ fontSize: "24px", fontWeight: 800, marginBottom: "2px" }}
                >
                  <span style={{ color: "#0f172a" }}>Ambulances </span>
                  <span style={{ color: "#1D6EF5" }}>Blanc Bleu</span>
                </div>
                <div
                  className="logo-sub"
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                  }}
                >
                  Transport Sanitaire · Nice
                </div>
                <div
                  className="logo-addr"
                  style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.7 }}
                >
                  59 Boulevard Madeleine
                  <br />
                  06000 Nice · SIRET : 000 000 000 00000
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "4px",
                  }}
                >
                  Facture N°
                </div>
                <div
                  className="facture-num"
                  style={{ fontSize: "22px", fontWeight: 800, color: "#1D6EF5" }}
                >
                  {facture.numero}
                </div>
                <div
                  className="facture-date"
                  style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}
                >
                  Émise le : {fmtDate(facture.dateEmission)}
                </div>
                <div
                  style={{
                    display: "inline-block",
                    marginTop: "8px",
                    padding: "4px 14px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    backgroundColor: "#fef3c7",
                    color: "#92400e",
                  }}
                >
                  {statCfg.label.toUpperCase()}
                </div>
              </div>
            </div>

            <div
              className="info-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "28px",
              }}
            >
              <div
                className="info-box"
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <div
                  className="info-label"
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "8px",
                  }}
                >
                  Patient
                </div>
                <div
                  className="info-value"
                  style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}
                >
                  {patient}
                </div>
                {facture.patientId?.numeroPatient && (
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    N° {facture.patientId.numeroPatient}
                  </div>
                )}
              </div>
              <div
                className="info-box"
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <div
                  className="info-label"
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "8px",
                  }}
                >
                  Transport
                </div>
                <div
                  className="info-value"
                  style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}
                >
                  {facture.transportId?.numero || "—"}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{motif}</div>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "10px",
                }}
              >
                Détail de la prestation
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#0f172a" }}>
                    {[
                      "Désignation",
                      "Montant base",
                      "Majoration",
                      "Total TTC",
                      "Part CPAM",
                      "Part Patient",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: "10px",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.8)",
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#0f172a",
                      }}
                    >
                      {motif}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "13px",
                        color: "#475569",
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtMontant(facture.montantBase)}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "13px",
                        color: "#475569",
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtMontant(facture.majoration)}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#0f172a",
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtMontant(facture.montantTotal)}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "13px",
                        color: "#16a34a",
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtMontant(facture.montantCPAM)} ({facture.tauxPriseEnCharge}%)
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "13px",
                        color: "#dc2626",
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtMontant(facture.montantPatient)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: "#EFF6FF" }}>
                    <td colSpan={3} style={{ padding: "14px" }}></td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#1D6EF5",
                      }}
                    >
                      TOTAL : {fmtMontant(facture.montantTotal)}
                    </td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#16a34a" }}>
                      CPAM : {fmtMontant(facture.montantCPAM)}
                    </td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#dc2626" }}>
                      Patient : {fmtMontant(facture.montantPatient)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {facture.notes && (
              <div
                className="notes-box"
                style={{
                  backgroundColor: "#f8fafc",
                  borderLeft: "4px solid #1D6EF5",
                  padding: "14px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  color: "#475569",
                }}
              >
                <strong style={{ color: "#0f172a" }}>Notes :</strong> {facture.notes}
              </div>
            )}

            <div
              className="footer"
              style={{
                marginTop: "32px",
                paddingTop: "16px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "#94a3b8",
              }}
            >
              <span>Ambulances Blanc Bleu · 59 Bd Madeleine, 06000 Nice</span>
              <span>Document généré le {new Date().toLocaleDateString("fr-FR")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Charges détail avec carburant interactif ─────────────────────────────────
function ChargesDetail({ compta, fmtEur }) {
  const [carburantOpen, setCarburantOpen] = useState(false);
  const meta = compta.charges.carburantMeta;
  const total = compta.charges.total || 1;

  const lignes = [
    { label: "Salaires bruts", val: compta.charges.salaires, color: "bg-blue-400" },
    { label: "Cotis. URSSAF", val: compta.charges.urssaf, color: "bg-orange-400" },
    { label: "Maintenances", val: compta.charges.maintenances, color: "bg-yellow-400" },
  ];

  const carburantVal = compta.charges.carburant;
  const carburantPct = total > 0 ? Math.round((carburantVal / total) * 100) : 0;

  return (
    <div className="space-y-2.5">
      {lignes.map((l) => {
        const pct = total > 0 ? Math.round((l.val / total) * 100) : 0;
        return (
          <div key={l.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 font-medium">{l.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-500">{fmtEur(l.val)}</span>
                <span className="text-slate-400 w-8 text-right">{pct}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${l.color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      {/* Carburant — ligne dépliable */}
      <div>
        <button
          type="button"
          onClick={() => setCarburantOpen((o) => !o)}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">Carburant</span>
              {meta?.nbCalcules > 0 && (
                <span className="text-slate-400 text-xs">
                  ({meta.nbCalcules} transport{meta.nbCalcules > 1 ? "s" : ""} ·{" "}
                  {meta.distanceTotaleKm} km)
                </span>
              )}
              <span
                className={`transition-transform inline-block text-slate-400 ${carburantOpen ? "rotate-180" : ""}`}
                style={{ fontSize: 12 }}
              >
                ▾
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-500">{fmtEur(carburantVal)}</span>
              <span className="text-slate-400 w-8 text-right">{carburantPct}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full"
              style={{ width: `${carburantPct}%` }}
            />
          </div>
        </button>

        {carburantOpen && meta && (
          <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs space-y-1.5 border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="material-symbols-outlined text-sm">local_gas_station</span>
              <span>
                Calculé depuis <strong>{meta.nbCalcules}</strong> transport(s) terminé(s)
              </span>
            </div>
            <div className="text-slate-500">
              Distance totale : <strong>{meta.distanceTotaleKm} km</strong>
            </div>
            <div className="text-slate-500">
              Prix moyen : <strong>{meta.prixMoyen} €/L</strong>
            </div>
            {meta.nbSansCoordonnees > 0 && (
              <div className="text-slate-400 italic">
                {meta.nbSansCoordonnees} transport(s) sans coordonnées GPS ignoré(s)
              </div>
            )}

            {/* Avertissement véhicules sans consommation */}
            {meta.vehiculesSansInfo?.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span className="text-amber-600">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-700">
                      Consommation non renseignée sur {meta.vehiculesSansInfo.length} véhicule(s)
                    </p>
                    <p className="text-amber-600 mt-0.5">
                      {meta.vehiculesSansInfo.join(", ")} — 8 L/100km utilisé par défaut
                    </p>
                    <p className="text-amber-500 mt-1">
                      → Aller dans <strong>Flotte</strong> pour renseigner la consommation
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tableau détail si pas trop long */}
            {meta.detail?.length > 0 && meta.detail.length <= 10 && (
              <table className="w-full mt-2 text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-200">
                    <th className="text-left py-1 font-medium">Véhicule</th>
                    <th className="text-right py-1 font-medium">km</th>
                    <th className="text-right py-1 font-medium">L</th>
                    <th className="text-right py-1 font-medium">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.detail.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 text-slate-600">
                        {d.vehicule}
                        {d.usedDefault && <span className="ml-1 text-amber-500">*</span>}
                      </td>
                      <td className="py-1 text-right font-mono text-slate-500">{d.distanceKm}</td>
                      <td className="py-1 text-right font-mono text-slate-500">{d.litres}</td>
                      <td className="py-1 text-right font-mono font-semibold text-slate-700">
                        {fmtEur(d.cout)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {meta.detail?.length > 10 && (
              <p className="text-slate-400 italic">
                {meta.detail.length} lignes — trop nombreuses pour affichage détaillé
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">TOTAL CHARGES</span>
        <span className="text-sm font-mono font-bold text-red-600">
          {fmtEur(compta.charges.total)}
        </span>
      </div>
    </div>
  );
}

// ─── Constantes formulaires ───────────────────────────────────────────────────
const MOTIFS_FAC = [
  "Consultation",
  "Hospitalisation",
  "Sortie hospitalisation",
  "Rééducation",
  "Analyse",
  "Autre",
];
const TYPES_VEH = ["VSL", "TPMR", "AMBULANCE"];
const MODES_PAI = [
  { value: "", label: "Non renseigné" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "cb", label: "Carte bancaire" },
  { value: "especes", label: "Espèces" },
  { value: "cpam_direct", label: "CPAM direct" },
];
const inputF =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary bg-white";
const labelF = "text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5";

// ─── Toast ────────────────────────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  const CFG = {
    success: { bg: "bg-emerald-600", icon: "check_circle" },
    error: { bg: "bg-red-600", icon: "error" },
    warning: { bg: "bg-orange-500", icon: "warning" },
  };
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const c = CFG[t.type] || CFG.warning;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-3 ${c.bg} text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium min-w-64 max-w-xs`}
            style={{ animation: "slideInRight .2s ease" }}
          >
            <span className="material-symbols-outlined text-base flex-shrink-0">{c.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmToast({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-[200]" style={{ transform: "translateX(-50%)" }}>
      <div className="flex items-center gap-4 bg-slate-800 text-white rounded-2xl shadow-2xl px-5 py-3.5 text-sm font-medium whitespace-nowrap">
        <span className="material-symbols-outlined text-yellow-400 text-base">help</span>
        <span>{message}</span>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white text-xs font-bold"
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400"
        >
          Confirmer
        </button>
      </div>
    </div>
  );
}

// ─── Modal : Nouvelle facture ─────────────────────────────────────────────────
function ModalNouvelleFacture({ onClose, onCreated }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    transportId: "",
    patientId: null,
    patientNom: "",
    patientPrenom: "",
    typeVehicule: "VSL",
    motif: "Consultation",
    allerRetour: false,
    distanceKm: "",
    dateEmission: today,
    montantTotal: "",
    tauxPriseEnCharge: 65,
    statut: "emise",
    notes: "",
  });
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);
  const sf = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const montant = parseFloat(form.montantTotal) || 0;
  const taux = parseFloat(form.tauxPriseEnCharge) || 0;
  const partCPAM = Math.round(((montant * taux) / 100) * 100) / 100;
  const partPatient = Math.round((montant - partCPAM) * 100) / 100;

  useEffect(() => {
    transportService
      .getAll({ limit: 200 })
      .then((r) => setTransports(r.data?.transports || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleTransportSelect = (tId) => {
    const t = transports.find((tr) => tr._id === tId);
    if (t) {
      setForm((f) => ({
        ...f,
        transportId: tId,
        patientId: t.patientId || null,
        patientNom: t.patient?.nom || f.patientNom,
        patientPrenom: t.patient?.prenom || f.patientPrenom,
        typeVehicule: t.typeTransport || f.typeVehicule,
        motif: t.motif || f.motif,
        allerRetour: t.allerRetour || false,
      }));
    } else {
      sf("transportId", "");
    }
  };

  const handleSubmit = async () => {
    if (montant <= 0) {
      setErreur("Le montant total est obligatoire (> 0 €).");
      return;
    }
    if (!form.dateEmission) {
      setErreur("La date d'émission est obligatoire.");
      return;
    }
    setLoading(true);
    setErreur(null);
    try {
      const payload = {
        patientNom: form.patientNom,
        patientPrenom: form.patientPrenom,
        ...(form.patientId ? { patientId: form.patientId } : {}),
        typeVehicule: form.typeVehicule,
        motif: form.motif,
        allerRetour: form.allerRetour,
        distanceKm: parseFloat(form.distanceKm) || 0,
        dateEmission: new Date(form.dateEmission),
        montantTotal: montant,
        montantBase: montant,
        tauxPriseEnCharge: taux,
        montantCPAM: partCPAM,
        montantPatient: partPatient,
        statut: form.statut,
        notes: form.notes,
      };
      if (form.transportId) payload.transportId = form.transportId;
      const { data } = await factureService.create(payload);
      onCreated(data.facture?.numero || "—");
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/* Inner panel: stop propagation pour ne pas fermer en cliquant dedans.
          Le keyDown reste pris en charge sur le wrapper externe (Escape). */}
      <div
        role="document"
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg">receipt_long</span>
            </div>
            <div>
              <h3 className="font-brand font-bold text-navy text-base">Nouvelle facture</h3>
              <p className="text-xs text-slate-400">Création manuelle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {erreur}
            </div>
          )}

          {/* Transport */}
          <div>
            <label className={labelF}>Transport associé (optionnel)</label>
            <select
              value={form.transportId}
              onChange={(e) => handleTransportSelect(e.target.value)}
              className={inputF}
            >
              <option value="">— Aucun transport —</option>
              {transports.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.numero} · {t.patient?.nom || "Patient"} {t.patient?.prenom || ""} · {t.motif}
                  {t.dateTransport
                    ? ` (${new Date(t.dateTransport).toLocaleDateString("fr-FR")})`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Patient */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelF}>Nom patient</label>
              <input
                type="text"
                value={form.patientNom}
                onChange={(e) => sf("patientNom", e.target.value)}
                placeholder="Dupont"
                className={inputF}
              />
            </div>
            <div>
              <label className={labelF}>Prénom</label>
              <input
                type="text"
                value={form.patientPrenom}
                onChange={(e) => sf("patientPrenom", e.target.value)}
                placeholder="Marie"
                className={inputF}
              />
            </div>
          </div>

          {/* Type + Motif */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelF}>Type de transport</label>
              <select
                value={form.typeVehicule}
                onChange={(e) => sf("typeVehicule", e.target.value)}
                className={inputF}
              >
                {TYPES_VEH.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelF}>Motif</label>
              <select
                value={form.motif}
                onChange={(e) => sf("motif", e.target.value)}
                className={inputF}
              >
                {MOTIFS_FAC.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Aller-retour + Distance */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-1">
              <input
                type="checkbox"
                checked={form.allerRetour}
                onChange={(e) => sf("allerRetour", e.target.checked)}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm font-medium text-slate-600">Aller-retour</span>
            </label>
            <div>
              <label className={labelF}>Distance (km)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.distanceKm}
                onChange={(e) => sf("distanceKm", e.target.value)}
                placeholder="0"
                className={inputF}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className={labelF}>Date d'émission *</label>
            <input
              type="date"
              value={form.dateEmission}
              onChange={(e) => sf("dateEmission", e.target.value)}
              className={inputF}
            />
          </div>

          {/* Montants */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
            <p className={labelF}>Montants</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelF}>Montant total (€) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montantTotal}
                  onChange={(e) => sf("montantTotal", e.target.value)}
                  placeholder="0.00"
                  className={inputF}
                />
              </div>
              <div>
                <label className={labelF}>Taux CPAM (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.tauxPriseEnCharge}
                  onChange={(e) => sf("tauxPriseEnCharge", e.target.value)}
                  className={inputF}
                />
              </div>
            </div>
            {montant > 0 && (
              <div className="flex items-center gap-4 text-xs bg-white rounded-lg px-3 py-2 border border-slate-200">
                <span className="text-slate-500">
                  Part CPAM : <strong className="text-emerald-600">{fmtEur(partCPAM)}</strong>
                </span>
                <span className="text-slate-200">|</span>
                <span className="text-slate-500">
                  Part patient : <strong className="text-red-500">{fmtEur(partPatient)}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Statut */}
          <div>
            <label className={labelF}>Statut initial</label>
            <div className="flex gap-3 flex-wrap">
              {["brouillon", "emise", "en_attente", "payee"].map((s) => {
                const cfg = STATUT_STYLE[s];
                return (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="statut-init"
                      value={s}
                      checked={form.statut === s}
                      onChange={() => sf("statut", s)}
                      className="accent-primary"
                    />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelF}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => sf("notes", e.target.value)}
              placeholder="Référence CPAM, remarques…"
              className={`${inputF} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,.4)",
                    borderTop: "2px solid white",
                    borderRadius: "50%",
                    animation: "spin .7s linear infinite",
                  }}
                />
                Création…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">add</span>Créer la facture
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Détail / Modification facture ────────────────────────────────────
function ModalDetailFacture({ facture, onClose, onUpdated }) {
  const readonly = ["payee", "annulee"].includes(facture.statut);
  const [form, setForm] = useState({
    montantTotal: String(facture.montantTotal || 0),
    tauxPriseEnCharge: String(facture.tauxPriseEnCharge || 65),
    statut: facture.statut,
    datePaiement: facture.datePaiement
      ? new Date(facture.datePaiement).toISOString().split("T")[0]
      : "",
    modePaiement: facture.modePaiement || "",
    notes: facture.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);
  const sf = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const montant = parseFloat(form.montantTotal) || 0;
  const taux = parseFloat(form.tauxPriseEnCharge) || 0;
  const partCPAM = Math.round(((montant * taux) / 100) * 100) / 100;
  const partPatient = Math.round((montant - partCPAM) * 100) / 100;

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSave = async () => {
    if (montant <= 0) {
      setErreur("Montant obligatoire.");
      return;
    }
    setLoading(true);
    setErreur(null);
    try {
      await factureService.update(facture._id, {
        montantTotal: montant,
        tauxPriseEnCharge: taux,
        montantCPAM: partCPAM,
        montantPatient: partPatient,
        statut: form.statut,
        datePaiement:
          form.statut === "payee"
            ? form.datePaiement
              ? new Date(form.datePaiement)
              : new Date()
            : null,
        modePaiement: form.modePaiement,
        notes: form.notes,
      });
      onUpdated("success", facture.numero);
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnnulerFacture = async () => {
    if (!window.confirm(`Annuler ${facture.numero} ? Cette action est irréversible.`)) return;
    try {
      await factureService.update(facture._id, { statut: "annulee" });
      onUpdated("annulee", facture.numero);
    } catch {
      setErreur("Erreur lors de l'annulation.");
    }
  };

  const statCfg = STATUT_STYLE[facture.statut] || STATUT_STYLE.en_attente;
  const nomPatient = patientNom(facture);

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/* Inner panel: stop propagation pour ne pas fermer en cliquant dedans.
          Le keyDown reste pris en charge sur le wrapper externe (Escape). */}
      <div
        role="document"
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-brand font-bold text-navy text-base">{facture.numero}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statCfg.cls}`}>
                  {statCfg.label}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {fmtDate(facture.dateEmission)} · {nomPatient}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {erreur}
            </div>
          )}

          {/* Infos transport/patient */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm border border-slate-100">
            <p className={labelF}>Informations</p>
            {facture.transportId?.numero && (
              <div className="flex justify-between">
                <span className="text-slate-500">Transport</span>
                <span className="font-mono text-navy">{facture.transportId.numero}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Patient</span>
              <span className="font-semibold text-navy">{nomPatient}</span>
            </div>
            {facture.motif && (
              <div className="flex justify-between">
                <span className="text-slate-500">Motif</span>
                <span className="text-slate-600">{facture.motif}</span>
              </div>
            )}
            {facture.typeVehicule && (
              <div className="flex justify-between">
                <span className="text-slate-500">Type</span>
                <span className="font-mono text-slate-600">{facture.typeVehicule}</span>
              </div>
            )}
            {facture.allerRetour !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-500">Aller-retour</span>
                <span className="text-slate-600">{facture.allerRetour ? "Oui" : "Non"}</span>
              </div>
            )}
          </div>

          {/* Montants — lecture seule si payée/annulée */}
          {readonly ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm">
              <p className={labelF}>Montants</p>
              <div className="flex justify-between">
                <span className="text-slate-500">Montant total</span>
                <span className="font-mono font-bold text-navy">
                  {fmtEur(facture.montantTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Part CPAM ({facture.tauxPriseEnCharge}%)</span>
                <span className="font-mono text-emerald-600">{fmtEur(facture.montantCPAM)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Part patient</span>
                <span className="font-mono text-red-500">{fmtEur(facture.montantPatient)}</span>
              </div>
              {facture.statut === "payee" && facture.datePaiement && (
                <div className="flex justify-between pt-1 border-t border-blue-100">
                  <span className="text-slate-500">Payée le</span>
                  <span className="font-semibold text-emerald-600">
                    {fmtDate(facture.datePaiement)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className={labelF}>Montants (modifiables)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelF}>Montant total (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.montantTotal}
                    onChange={(e) => sf("montantTotal", e.target.value)}
                    className={inputF}
                  />
                </div>
                <div>
                  <label className={labelF}>Taux CPAM (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.tauxPriseEnCharge}
                    onChange={(e) => sf("tauxPriseEnCharge", e.target.value)}
                    className={inputF}
                  />
                </div>
              </div>
              {montant > 0 && (
                <div className="flex items-center gap-4 text-xs bg-white rounded-lg px-3 py-2 border border-slate-200">
                  <span className="text-slate-500">
                    Part CPAM : <strong className="text-emerald-600">{fmtEur(partCPAM)}</strong>
                  </span>
                  <span className="text-slate-200">|</span>
                  <span className="text-slate-500">
                    Part patient : <strong className="text-red-500">{fmtEur(partPatient)}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Statut + mode paiement (modifiable uniquement) */}
          {!readonly && (
            <>
              <div>
                <label className={labelF}>Statut</label>
                <div className="flex gap-3 flex-wrap">
                  {["brouillon", "emise", "en_attente", "payee"].map((s) => {
                    const cfg = STATUT_STYLE[s];
                    return (
                      <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="statut-edit"
                          value={s}
                          checked={form.statut === s}
                          onChange={() => sf("statut", s)}
                          className="accent-primary"
                        />
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {form.statut === "payee" && (
                <div>
                  <label className={labelF}>Date de paiement</label>
                  <input
                    type="date"
                    value={form.datePaiement}
                    onChange={(e) => sf("datePaiement", e.target.value)}
                    className={inputF}
                  />
                </div>
              )}
              <div>
                <label className={labelF}>Mode de paiement</label>
                <select
                  value={form.modePaiement}
                  onChange={(e) => sf("modePaiement", e.target.value)}
                  className={inputF}
                >
                  {MODES_PAI.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className={labelF}>Notes</label>
            {readonly ? (
              <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                {facture.notes || "—"}
              </p>
            ) : (
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => sf("notes", e.target.value)}
                placeholder="Référence CPAM, remarques…"
                className={`${inputF} resize-none`}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          {readonly ? (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                onClick={handleAnnulerFacture}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50"
              >
                <span className="material-symbols-outlined text-sm">delete</span>Annuler la facture
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? (
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,.4)",
                      borderTop: "2px solid white",
                      borderRadius: "50%",
                      animation: "spin .7s linear infinite",
                    }}
                  />
                ) : (
                  <span className="material-symbols-outlined text-base">save</span>
                )}
                {loading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Factures() {
  const now = new Date();
  const [moisActuel, setMoisActuel] = useState(now.getMonth() + 1);
  const [anneeActuelle, setAnneeActuelle] = useState(now.getFullYear());

  // Factures existantes
  const [factures, setFactures] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [factureImprimer, setFactureImprimer] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [modalNouvelle, setModalNouvelle] = useState(false);
  const [factureDetail, setFactureDetail] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmPay, setConfirmPay] = useState(null);

  // Comptabilité
  const [compta, setCompta] = useState(null);
  const [comptaLoading, setComptaLoading] = useState(true);

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const reloadFactures = useCallback(() => {
    const params = { limit: 100 };
    if (filterStatut) params.statut = filterStatut;
    Promise.all([factureService.getAll(params), factureService.getStats()])
      .then(([f, s]) => {
        setFactures(f.data.factures || []);
        setStats(s.data);
      })
      .catch(() => {});
  }, [filterStatut]);

  // ── Socket : mise à jour temps réel quand une facture est payée ────────────
  const { subscribe } = useSocket();
  useEffect(() => {
    const unsub = subscribe("facture:updated", (data) => {
      setFactures((prev) =>
        prev.map((f) =>
          f._id === data._id
            ? {
                ...f,
                statut: data.statut,
                datePaiement: data.datePaiement,
                modePaiement: data.modePaiement,
                referenceExterne: data.referenceExterne,
              }
            : f,
        ),
      );
      addToast(`Facture ${data.numero} payée en ligne par le patient`);
    });
    return unsub;
  }, [subscribe, addToast]);

  // ── Chargement factures ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 100 };
    if (filterStatut) params.statut = filterStatut;

    Promise.all([factureService.getAll(params), factureService.getStats()])
      .then(([f, s]) => {
        if (cancelled) return;
        setFactures(f.data.factures || []);
        setStats(s.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filterStatut]);

  // ── Chargement comptabilité ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setComptaLoading(true);
    api
      .get("/comptabilite/dashboard", { params: { annee: anneeActuelle, mois: moisActuel } })
      .then(({ data }) => {
        if (!cancelled) setCompta(data);
      })
      .catch(() => {
        if (!cancelled) setCompta(null);
      })
      .finally(() => {
        if (!cancelled) setComptaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moisActuel, anneeActuelle]);

  // ── Filtrage ────────────────────────────────────────────────────────────────
  const filtered = factures.filter((f) => {
    const q = search.toLowerCase();
    return (
      !q ||
      f.numero?.toLowerCase().includes(q) ||
      f.transportId?.numero?.toLowerCase().includes(q) ||
      f.transportId?.motif?.toLowerCase().includes(q) ||
      patientNom(f).toLowerCase().includes(q)
    );
  });

  // ── Actions factures ────────────────────────────────────────────────────────
  const handleStatut = async (id, statut) => {
    setActionId(id);
    setConfirmPay(null);
    try {
      const { data } = await factureService.updateStatut(id, statut);
      setFactures((prev) => prev.map((f) => (f._id === id ? data.facture : f)));
      addToast(`Facture marquée ${STATUT_STYLE[statut]?.label || statut}`);
    } catch {
      addToast("Erreur mise à jour statut.", "error");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id) => {
    const facture = factures.find((f) => f._id === id);
    const label = facture?.numero ? `la facture ${facture.numero}` : "cette facture";
    if (
      !window.confirm(`Êtes-vous sûr de vouloir annuler ${label} ?\nCette action est irréversible.`)
    )
      return;
    try {
      await factureService.delete(id);
      reloadFactures();
      addToast("Facture annulée.", "warning");
    } catch (err) {
      const msg = err?.response?.data?.message || "Erreur lors de l'annulation.";
      addToast(msg, "error");
    }
  };

  // ── PDF facture / reçu ──────────────────────────────────────────────────────
  const handleDownloadPdf = async (factureId, numero) => {
    try {
      await downloadBlob(factureService.downloadPdf(factureId), `facture-${numero}.pdf`);
      addToast("PDF facture téléchargé");
    } catch (err) {
      addToast(err?.response?.data?.message || "Erreur téléchargement PDF", "error");
    }
  };

  const handleDownloadReceipt = async (factureId, numero) => {
    try {
      await downloadBlob(factureService.downloadReceipt(factureId), `recu-${numero}.pdf`);
      addToast("PDF reçu téléchargé");
    } catch (err) {
      addToast(
        err?.response?.data?.message || "Reçu disponible uniquement après paiement",
        "error",
      );
    }
  };

  // ── Export comptable (backend CSV) ──────────────────────────────────────────
  const handleRecalculateAmounts = async () => {
    if (
      !window.confirm(
        "Recalculer les montants de toutes les factures à 0 € depuis le barème CPAM ?",
      )
    )
      return;
    try {
      const { data } = await factureService.recalculateAmounts();
      addToast(data.message || "Recalcul terminé", data.fixed > 0 ? "success" : "info");
      if (data.fixed > 0) {
        reloadFactures();
        // Recharger le dashboard comptable
        api
          .get("/comptabilite/dashboard", { params: { annee: anneeActuelle, mois: moisActuel } })
          .then(({ data: d }) => setCompta(d))
          .catch(() => {});
      }
    } catch (err) {
      addToast(err?.response?.data?.message || "Erreur lors du recalcul", "error");
    }
  };

  const handleExportInvoicesCsv = async () => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsvBlob(comptabiliteService.exportInvoicesCsv(), `factures-${date}.csv`);
      addToast("Export CSV factures généré");
    } catch (err) {
      addToast(err?.response?.data?.message || "Erreur export CSV", "error");
    }
  };

  const handleExportPaymentsCsv = async () => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsvBlob(comptabiliteService.exportPaymentsCsv(), `paiements-${date}.csv`);
      addToast("Export CSV paiements généré");
    } catch (err) {
      addToast(err?.response?.data?.message || "Erreur export paiements", "error");
    }
  };

  // ── Exports ─────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = [
      "N° Facture",
      "Date émission",
      "Transport",
      "Patient",
      "Motif",
      "Total €",
      "CPAM €",
      "Patient €",
      "Statut",
    ];
    const rows = filtered.map((f) => [
      f.numero,
      fmtDate(f.dateEmission),
      f.transportId?.numero || "",
      patientNom(f),
      f.transportId?.motif || "",
      f.montantTotal,
      f.montantCPAM,
      f.montantPatient,
      f.statut,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    _downloadCSV(csv, `factures-blancbleu-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportDSN = () => {
    if (!compta) return;
    const headers = ["SIRET", "NOM", "PRENOM", "PERIODE", "BRUT", "COT_SAL", "NET", "COT_PAT"];
    const periode = `${String(moisActuel).padStart(2, "0")}/${anneeActuelle}`;
    const csv = [
      headers.join(";"),
      `000000000000000;;(collectif);${periode};${compta.charges.salaires};${compta.urssaf.cotisationsSalariales};${compta.urssaf.salaireNet};${compta.urssaf.cotisationsPatronales}`,
    ].join("\n");
    _downloadCSV(csv, `DSN-URSSAF-${periode.replace("/", "-")}.csv`);
  };

  const exportRapport = () => {
    if (!compta) {
      exportCSV();
      return;
    }
    const periode = `${MOIS_NOMS[moisActuel - 1]} ${anneeActuelle}`;
    const lines = [
      `"=== RAPPORT COMPTABLE — ${periode} ==="`,
      `""`,
      `"=== CHIFFRE D'AFFAIRES ==="`,
      `"CA encaissé (paiements reçus ce mois)","${fmtEur(compta.ca.encaisse ?? 0)}"`,
      `"CA facturé (émissions ce mois)","${fmtEur(compta.ca.facture ?? compta.ca.total)}"`,
      `"Part CPAM","${fmtEur(compta.ca.partCPAM)}"`,
      `"Part patient","${fmtEur(compta.ca.partPatient)}"`,
      `""`,
      `"=== CHARGES ==="`,
      `"Salaires bruts","${fmtEur(compta.charges.salaires)}"`,
      `"Cotisations patronales (URSSAF)","${fmtEur(compta.charges.urssaf)}"`,
      `"Maintenances","${fmtEur(compta.charges.maintenances)}"`,
      `"Total charges","${fmtEur(compta.charges.total)}"`,
      `""`,
      `"=== RÉSULTAT ==="`,
      `"Résultat net","${fmtEur(compta.resultatNet)}"`,
      `""`,
      `"=== FACTURES ==="`,
      `"N° Facture","Date","Patient","Montant","CPAM","Statut"`,
      ...factures.map(
        (f) =>
          `"${f.numero}","${fmtDate(f.dateEmission)}","${patientNom(f)}","${f.montantTotal}","${f.montantCPAM}","${f.statut}"`,
      ),
    ];
    _downloadCSV(lines.join("\n"), `rapport-comptable-${periode.replace(" ", "-")}.csv`);
  };

  const _downloadCSV = (csv, filename) => {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalFiltre = filtered.reduce(
    (sum, f) => sum + (f.statut !== "annulee" ? f.montantTotal || 0 : 0),
    0,
  );

  // ── Données graphique barres ────────────────────────────────────────────────
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

  // ── Données graphique doughnut ──────────────────────────────────────────────
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

  // ── Résultat net ────────────────────────────────────────────────────────────
  const resultatNet = compta?.resultatNet ?? null;
  const isPositif = resultatNet !== null && resultatNet >= 0;

  const moisNomActuel = MOIS_NOMS[moisActuel - 1];

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideInRight{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}`}</style>

      <ToastContainer toasts={toasts} />
      {confirmPay && (
        <ConfirmToast
          message={`Marquer ${confirmPay.numero} comme payée ?`}
          onConfirm={() => handleStatut(confirmPay.id, "payee")}
          onCancel={() => setConfirmPay(null)}
        />
      )}
      {modalNouvelle && (
        <ModalNouvelleFacture
          onClose={() => setModalNouvelle(false)}
          onCreated={(num) => {
            setModalNouvelle(false);
            addToast(`Facture ${num} créée avec succès`);
            reloadFactures();
          }}
        />
      )}
      {factureDetail && (
        <ModalDetailFacture
          facture={factureDetail}
          onClose={() => setFactureDetail(null)}
          onUpdated={(type, num) => {
            setFactureDetail(null);
            addToast(
              type === "annulee" ? `Facture ${num} annulée` : `Facture ${num} mise à jour`,
              type === "annulee" ? "warning" : "success",
            );
            reloadFactures();
          }}
        />
      )}

      {factureImprimer && (
        <ModalImpression facture={factureImprimer} onClose={() => setFactureImprimer(null)} />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">Comptabilité</h1>
          <p className="text-slate-500 text-sm mt-1">
            Finances & Facturation CPAM — Ambulances Blanc Bleu
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary hover:text-white transition-all"
          >
            <span className="material-symbols-outlined text-sm">download</span>Exporter CSV
          </button>
          <button
            onClick={handleExportInvoicesCsv}
            className="flex items-center gap-2 text-xs font-bold text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
            title="Export comptable factures (avec statut paiement Stripe)"
          >
            <span className="material-symbols-outlined text-sm">account_balance</span>CSV Comptable
          </button>
          <button
            onClick={handleExportPaymentsCsv}
            className="flex items-center gap-2 text-xs font-bold text-violet-600 border border-violet-200 px-4 py-2 rounded-lg hover:bg-violet-600 hover:text-white transition-all"
            title="Export paiements Stripe"
          >
            <span className="material-symbols-outlined text-sm">credit_card</span>CSV Paiements
          </button>
          <button
            onClick={exportDSN}
            className="flex items-center gap-2 text-xs font-bold text-orange-600 border border-orange-300 px-4 py-2 rounded-lg hover:bg-orange-600 hover:text-white transition-all"
          >
            <span className="material-symbols-outlined text-sm">description</span>Export DSN URSSAF
          </button>
          <button
            onClick={exportRapport}
            className="flex items-center gap-2 text-xs font-bold text-emerald-600 border border-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"
          >
            <span className="material-symbols-outlined text-sm">bar_chart</span>Rapport complet
          </button>
          {stats?.parStatut?.brouillons > 0 ||
          (compta?.ca?.total === 0 && stats?.parStatut?.payees > 0) ? (
            <button
              onClick={handleRecalculateAmounts}
              className="flex items-center gap-2 text-xs font-bold text-red-600 border border-red-300 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white transition-all"
              title="Recalculer les montants des factures à 0 €"
            >
              <span className="material-symbols-outlined text-sm">calculate</span>Recalculer
              montants
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Section A : Sélecteur de période ───────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3 w-fit">
        <span className="material-symbols-outlined text-slate-400 text-base">calendar_month</span>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Période :
        </span>
        <select
          value={moisActuel}
          onChange={(e) => setMoisActuel(Number(e.target.value))}
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
          onChange={(e) => setAnneeActuelle(Number(e.target.value))}
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
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-orange-500 text-base">
              account_balance
            </span>
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
              URSSAF — Déclaration {moisNomActuel} {anneeActuelle}
            </p>
          </div>
          {compta ? (
            (() => {
              const u = compta.urssaf;
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">Masse salariale</span>
                    <span className="font-mono font-semibold text-navy">
                      {fmtEur(u.masseSalariale)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">Cotis. salariales (23%)</span>
                    <span className="font-mono text-slate-600">
                      − {fmtEur(u.cotisationsSalariales)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50 bg-slate-50 rounded px-2">
                    <span className="text-slate-700 font-semibold">Salaires nets</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {fmtEur(u.salaireNet)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">Cotis. patronales (42%)</span>
                    <span className="font-mono text-slate-600">
                      + {fmtEur(u.cotisationsPatronales)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 bg-orange-50 rounded px-2">
                    <span className="text-orange-700 font-semibold">Coût total employeur</span>
                    <span className="font-mono font-bold text-orange-700">
                      {fmtEur(u.coutTotalEmployeur)}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-xs text-orange-600 font-semibold">
                      <span className="material-symbols-outlined text-sm">schedule</span>À payer
                      avant le {new Date(u.echeance).toLocaleDateString("fr-FR")}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => alert("Déclaration URSSAF marquée payée (simulation)")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Marquer payée
                      </button>
                      <button
                        onClick={exportDSN}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-orange-50 border border-orange-200 text-xs font-bold text-orange-700 hover:bg-orange-100"
                      >
                        <span className="material-symbols-outlined text-sm">description</span>
                        Export DSN
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-slate-400 text-sm">Données indisponibles</p>
          )}
        </div>
      </div>

      {/* ── Filtres & recherche ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUTS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatut(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterStatut === value ? "bg-navy text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-navy"}`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setModalNouvelle(true)}
            style={{
              background: "#1D6EF5",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + Nouvelle facture
          </button>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 w-56">
          <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="N°, transport, patient…"
            className="bg-transparent text-sm outline-none w-full text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* ── Sous-titre section factures ────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-primary text-base">receipt_long</span>
        <h2 className="font-brand font-bold text-navy text-base">Factures — Facturation CPAM</h2>
      </div>

      {/* ── Tableau factures (existant — intact) ───────────────────────────── */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full">
          <thead>
            <tr className="bg-navy">
              {[
                "N° Facture",
                "Date",
                "Transport",
                "Patient",
                "Montant total",
                "Part CPAM",
                "Part patient",
                "Statut",
                "Paiement",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <FactureRowSkeleton />
                <FactureRowSkeleton />
                <FactureRowSkeleton />
                <FactureRowSkeleton />
                <FactureRowSkeleton />
              </>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <span
                    className="material-symbols-outlined text-slate-300"
                    style={{ fontSize: 48 }}
                  >
                    receipt_long
                  </span>
                  <p className="text-slate-400 mt-3 text-sm">Aucune facture trouvée</p>
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => {
                const statCfg = STATUT_STYLE[f.statut] || STATUT_STYLE.en_attente;
                const isPaying = actionId === f._id;
                return (
                  <tr
                    key={f._id}
                    onClick={() => setFactureDetail(f)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-primary text-sm">
                      {f.numero}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-600">
                      {fmtDate(f.dateEmission)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                      {f.transportId?.numero || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-navy">{patientNom(f)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-navy text-sm">
                      {fmtMontant(f.montantTotal)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-emerald-600">
                      {fmtMontant(f.montantCPAM)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-red-500">
                      {fmtMontant(f.montantPatient)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statCfg.cls}`}>
                        {statCfg.label}
                      </span>
                    </td>
                    {/* Badge statut paiement */}
                    <td className="px-4 py-3">
                      {(() => {
                        const ps = f.paymentStatus || "UNPAID";
                        const pCfg = PAYMENT_STATUS_STYLE[ps] || PAYMENT_STATUS_STYLE.UNPAID;
                        return (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${pCfg.cls}`}
                          >
                            <span className="material-symbols-outlined text-[11px]">
                              {pCfg.icon}
                            </span>
                            {pCfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 flex-wrap">
                        {["brouillon", "emise", "en_attente", "payment_failed"].includes(
                          f.statut,
                        ) && (
                          <button
                            title="Marquer payée"
                            onClick={() => setConfirmPay({ id: f._id, numero: f.numero })}
                            disabled={isPaying}
                            className="w-7 h-7 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-emerald-600 text-sm">
                              payments
                            </span>
                          </button>
                        )}
                        {f.statut === "brouillon" && (
                          <button
                            title="Émettre la facture"
                            onClick={() => handleStatut(f._id, "emise")}
                            className="w-7 h-7 rounded-lg border border-blue-200 bg-blue-50 flex items-center justify-center hover:bg-blue-100"
                          >
                            <span className="material-symbols-outlined text-blue-600 text-sm">
                              send
                            </span>
                          </button>
                        )}
                        {/* Télécharger PDF facture */}
                        <button
                          title="Télécharger PDF facture"
                          onClick={() => handleDownloadPdf(f._id, f.numero)}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                            picture_as_pdf
                          </span>
                        </button>
                        {/* Télécharger reçu — uniquement si payée */}
                        {f.paymentStatus === "SUCCEEDED" && (
                          <button
                            title="Télécharger reçu PDF"
                            onClick={() => handleDownloadReceipt(f._id, f.numero)}
                            className="w-7 h-7 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-all"
                          >
                            <span className="material-symbols-outlined text-emerald-600 text-sm">
                              receipt
                            </span>
                          </button>
                        )}
                        <button
                          title="Imprimer"
                          onClick={() => setFactureImprimer(f)}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                            print
                          </span>
                        </button>
                        {f.statut !== "annulee" && (
                          <button
                            title="Annuler"
                            onClick={() => handleDelete(f._id)}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-400 transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-red-500">
                              cancel
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">{filtered.length} facture(s) affichée(s)</span>
          <span className="text-xs font-mono font-bold text-navy">
            Total affiché : {fmtMontant(totalFiltre)}
          </span>
        </div>
      </div>

      {/* ── Section E : Récapitulatif annuel ───────────────────────────────── */}
      {compta?.recapAnnuel && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-slate-500 text-base">bar_chart</span>
            <h2 className="font-brand font-bold text-navy text-base">
              Récapitulatif annuel {anneeActuelle}
            </h2>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Mois", "CA", "Charges", "Résultat", "Marge"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-mono font-bold text-slate-400 uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {compta.recapAnnuel.map((r) => {
                  const estMoisActuel = r.mois === moisActuel;
                  const estFutur = r.mois > moisActuel;
                  const rowBg = estMoisActuel ? "bg-blue-50" : "";
                  const numCls = estFutur ? "text-slate-300" : "text-slate-600";
                  const resCls = r.resultat >= 0 ? "text-emerald-600" : "text-red-500";
                  return (
                    <tr key={r.mois} className={`${rowBg} hover:bg-slate-50 transition-colors`}>
                      <td
                        className={`px-4 py-2.5 font-semibold ${estMoisActuel ? "text-primary" : numCls}`}
                      >
                        {MOIS_LABELS[r.mois - 1]}
                        {estMoisActuel && (
                          <span className="ml-1.5 text-xs text-primary font-normal">← actuel</span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 font-mono ${numCls}`}>{fmtEur(r.ca)}</td>
                      <td className={`px-4 py-2.5 font-mono ${numCls}`}>{fmtEur(r.charges)}</td>
                      <td
                        className={`px-4 py-2.5 font-mono font-semibold ${estFutur ? "text-slate-300" : resCls}`}
                      >
                        {fmtEur(r.resultat)}
                      </td>
                      <td
                        className={`px-4 py-2.5 font-mono text-xs ${estFutur ? "text-slate-300" : r.marge !== null && r.marge >= 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {estFutur || r.marge === null
                          ? "—"
                          : `${r.marge > 0 ? "+" : ""}${r.marge}×`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-200 font-bold">
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 uppercase tracking-widest">
                    TOTAL
                  </td>
                  <td className="px-4 py-3 font-mono text-navy">
                    {fmtEur(compta.recapAnnuel.reduce((s, r) => s + r.ca, 0))}
                  </td>
                  <td className="px-4 py-3 font-mono text-navy">
                    {fmtEur(compta.recapAnnuel.reduce((s, r) => s + r.charges, 0))}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {(() => {
                      const tot = compta.recapAnnuel.reduce((s, r) => s + r.resultat, 0);
                      return (
                        <span className={tot >= 0 ? "text-emerald-600" : "text-red-500"}>
                          {fmtEur(tot)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
