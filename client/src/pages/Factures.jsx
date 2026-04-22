import { useState, useEffect } from "react";
import { factureService } from "../services/api";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMontant = (m) =>
  m != null ? `${Number(m).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €` : "—";

const patientNom = (f) => {
  if (f.patientId?.nom) return `${f.patientId.nom} ${f.patientId.prenom || ""}`.trim();
  if (f.transportId?.patient?.nom) return `${f.transportId.patient.nom} ${f.transportId.patient.prenom || ""}`.trim();
  return "—";
};

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "brouillon", label: "Brouillon" },
  { value: "emise", label: "Émise" },
  { value: "en_attente", label: "En attente" },
  { value: "payee", label: "Payée" },
  { value: "annulee", label: "Annulée" },
];

const STATUT_STYLE = {
  brouillon:  { cls: "bg-slate-100 text-slate-600",    label: "Brouillon" },
  emise:      { cls: "bg-blue-100 text-blue-700",      label: "Émise" },
  en_attente: { cls: "bg-yellow-100 text-yellow-700",  label: "En attente" },
  payee:      { cls: "bg-emerald-100 text-emerald-700",label: "Payée" },
  annulee:    { cls: "bg-red-100 text-red-700",        label: "Annulée" },
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  fontSize: "14px",
  color: "#0f172a",
  outline: "none",
  width: "100%",
  backgroundColor: "#f8fafc",
  fontFamily: "inherit",
};

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
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const motif = facture.transportId?.motif || "Transport sanitaire";
  const patient = patientNom(facture);
  const statCfg = STATUT_STYLE[facture.statut] || STATUT_STYLE.en_attente;

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "720px", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="material-symbols-outlined" style={{ color: "#1D6EF5", fontSize: "22px" }}>receipt</span>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>Aperçu — {facture.numero}</span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 18px", borderRadius: "8px", background: "#1D6EF5", border: "none", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>print</span>Imprimer / PDF
            </button>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid #e2e8f0", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "#94a3b8" }}>close</span>
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "32px 40px", flex: 1 }}>
          <div id="facture-print-content">
            {/* En-tête */}
            <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "36px", paddingBottom: "20px", borderBottom: "3px solid #1D6EF5" }}>
              <div>
                <div className="logo-name" style={{ fontSize: "24px", fontWeight: 800, marginBottom: "2px" }}>
                  <span style={{ color: "#0f172a" }}>Ambulances </span>
                  <span style={{ color: "#1D6EF5" }}>Blanc Bleu</span>
                </div>
                <div className="logo-sub" style={{ fontSize: "10px", color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px" }}>Transport Sanitaire · Nice</div>
                <div className="logo-addr" style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.7 }}>
                  59 Boulevard Madeleine<br />06000 Nice · SIRET : 000 000 000 00000
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Facture N°</div>
                <div className="facture-num" style={{ fontSize: "22px", fontWeight: 800, color: "#1D6EF5" }}>{facture.numero}</div>
                <div className="facture-date" style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>Émise le : {fmtDate(facture.dateEmission)}</div>
                <div style={{ display: "inline-block", marginTop: "8px", padding: "4px 14px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, backgroundColor: statCfg.cls.split(" ")[0].replace("bg-", "#").includes("#") ? "#fef3c7" : "#f8fafc", color: "#92400e" }}>
                  {statCfg.label.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Infos patient + transport */}
            <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
              <div className="info-box" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                <div className="info-label" style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Patient</div>
                <div className="info-value" style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{patient}</div>
                {facture.patientId?.numeroPatient && <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>N° {facture.patientId.numeroPatient}</div>}
              </div>
              <div className="info-box" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                <div className="info-label" style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Transport</div>
                <div className="info-value" style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{facture.transportId?.numero || "—"}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{motif}</div>
              </div>
            </div>

            {/* Tableau */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Détail de la prestation</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#0f172a" }}>
                    {["Désignation", "Montant base", "Majoration", "Total TTC", "Part CPAM", "Part Patient"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "14px", fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>{motif}</td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#475569", fontFamily: "monospace" }}>{fmtMontant(facture.montantBase)}</td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#475569", fontFamily: "monospace" }}>{fmtMontant(facture.majoration)}</td>
                    <td style={{ padding: "14px", fontSize: "13px", fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{fmtMontant(facture.montantTotal)}</td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#16a34a", fontFamily: "monospace" }}>{fmtMontant(facture.montantCPAM)} ({facture.tauxPriseEnCharge}%)</td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#dc2626", fontFamily: "monospace" }}>{fmtMontant(facture.montantPatient)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: "#EFF6FF" }}>
                    <td colSpan={3} style={{ padding: "14px" }}></td>
                    <td style={{ padding: "14px", fontSize: "14px", fontWeight: 700, color: "#1D6EF5" }}>TOTAL : {fmtMontant(facture.montantTotal)}</td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#16a34a" }}>CPAM : {fmtMontant(facture.montantCPAM)}</td>
                    <td style={{ padding: "14px", fontSize: "13px", color: "#dc2626" }}>Patient : {fmtMontant(facture.montantPatient)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {facture.notes && (
              <div className="notes-box" style={{ backgroundColor: "#f8fafc", borderLeft: "4px solid #1D6EF5", padding: "14px", borderRadius: "4px", fontSize: "13px", color: "#475569" }}>
                <strong style={{ color: "#0f172a" }}>Notes :</strong> {facture.notes}
              </div>
            )}

            <div className="footer" style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8" }}>
              <span>Ambulances Blanc Bleu · 59 Bd Madeleine, 06000 Nice</span>
              <span>Document généré le {new Date().toLocaleDateString("fr-FR")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Factures() {
  const [factures, setFactures] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [factureImprimer, setFactureImprimer] = useState(null);
  const [actionId, setActionId] = useState(null);

  const loadData = () => {
    const params = { limit: 100 };
    if (filterStatut) params.statut = filterStatut;
    Promise.all([factureService.getAll(params), factureService.getStats()])
      .then(([f, s]) => {
        setFactures(f.data.factures || []);
        setStats(s.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { setLoading(true); loadData(); }, [filterStatut]); // eslint-disable-line

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

  const handleStatut = async (id, statut) => {
    setActionId(id);
    try {
      const { data } = await factureService.updateStatut(id, statut);
      setFactures((prev) => prev.map((f) => (f._id === id ? data.facture : f)));
    } catch {
      alert("Erreur mise à jour statut.");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Annuler cette facture ?")) return;
    try {
      await factureService.delete(id);
      setFactures((prev) =>
        prev.map((f) => (f._id === id ? { ...f, statut: "annulee" } : f))
      );
    } catch {
      alert("Erreur annulation.");
    }
  };

  const exportCSV = () => {
    const headers = ["N° Facture", "Date émission", "Transport", "Patient", "Motif", "Total €", "CPAM €", "Patient €", "Statut"];
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
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `factures-blancbleu-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalFiltre = filtered.reduce(
    (sum, f) => sum + (f.statut !== "annulee" ? (f.montantTotal || 0) : 0),
    0
  );

  return (
    <div className="p-7 fade-in">
      {factureImprimer && (
        <ModalImpression facture={factureImprimer} onClose={() => setFactureImprimer(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">Factures</h1>
          <p className="text-slate-500 text-sm mt-1">Facturation CPAM — Ambulances Blanc Bleu</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary hover:text-white transition-all">
          <span className="material-symbols-outlined text-sm">download</span>Exporter CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        {[
          { l: "Total", v: stats?.total || 0, icon: "receipt_long", c: "text-navy" },
          { l: "Brouillons", v: stats?.parStatut?.brouillons || 0, icon: "draft", c: "text-slate-500" },
          { l: "En attente", v: stats?.parStatut?.enAttente || 0, icon: "pending", c: "text-yellow-600" },
          { l: "Payées", v: stats?.parStatut?.payees || 0, icon: "check_circle", c: "text-emerald-600" },
          { l: "Chiffre d'affaires", v: fmtMontant(stats?.chiffreAffaires), icon: "euro", c: "text-blue-600" },
        ].map((k) => (
          <div key={k.l} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <span className={`material-symbols-outlined ${k.c}`}>{k.icon}</span>
            <div>
              <p className="text-xs text-slate-400">{k.l}</p>
              <p className={`text-lg font-mono font-bold ${k.c}`}>{k.v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {STATUTS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatut(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterStatut === value ? "bg-navy text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-navy"}`}
            >
              {label}
            </button>
          ))}
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

      {/* Tableau */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <table className="w-full">
          <thead>
            <tr className="bg-navy">
              {["N° Facture", "Date", "Transport", "Patient", "Montant total", "CPAM", "Patient", "Statut", "Actions"].map((h) => (
                <th key={h} className="px-4 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-16 text-slate-400">
                  <div style={{ display: "inline-block", width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 48 }}>receipt_long</span>
                  <p className="text-slate-400 mt-3 text-sm">Aucune facture trouvée</p>
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => {
                const statCfg = STATUT_STYLE[f.statut] || STATUT_STYLE.en_attente;
                const isPaying = actionId === f._id;
                return (
                  <tr key={f._id} className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}>
                    <td className="px-4 py-3 font-mono font-bold text-primary text-sm">{f.numero}</td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-600">{fmtDate(f.dateEmission)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">{f.transportId?.numero || "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-navy">{patientNom(f)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-navy text-sm">{fmtMontant(f.montantTotal)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-emerald-600">{fmtMontant(f.montantCPAM)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-red-500">{fmtMontant(f.montantPatient)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statCfg.cls}`}>
                        {statCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {/* Payer */}
                        {["brouillon", "emise", "en_attente"].includes(f.statut) && (
                          <button
                            title="Marquer payée"
                            onClick={() => handleStatut(f._id, "payee")}
                            disabled={isPaying}
                            className="flex items-center gap-1 text-xs bg-emerald-50 border border-emerald-300 text-emerald-700 px-2 py-1 rounded-lg font-semibold hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-xs">payments</span>
                            Payer
                          </button>
                        )}
                        {/* Émettre */}
                        {f.statut === "brouillon" && (
                          <button
                            title="Émettre la facture"
                            onClick={() => handleStatut(f._id, "emise")}
                            className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-300 text-blue-700 px-2 py-1 rounded-lg font-semibold hover:bg-blue-100"
                          >
                            <span className="material-symbols-outlined text-xs">send</span>
                            Émettre
                          </button>
                        )}
                        {/* Imprimer */}
                        <button
                          title="Imprimer"
                          onClick={() => setFactureImprimer(f)}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">print</span>
                        </button>
                        {/* Annuler */}
                        {f.statut !== "annulee" && (
                          <button
                            title="Annuler"
                            onClick={() => handleDelete(f._id)}
                            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-400 transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-red-500">cancel</span>
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
          <span className="text-xs font-mono font-bold text-navy">Total affiché : {fmtMontant(totalFiltre)}</span>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
