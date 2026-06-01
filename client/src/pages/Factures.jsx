import { useState, useEffect, useCallback } from "react";
import api, { factureService, comptabiliteService } from "../services/api";
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
import { fmtDate, fmtMontant, fmtEur } from "../utils/formatters";
import { patientNom } from "./Comptabilite/utils/factureMappers";
import {
  MOIS_LABELS,
  MOIS_NOMS,
  ANNEES,
  STATUTS,
  STATUT_STYLE,
  PAYMENT_STATUS_STYLE,
} from "./Comptabilite/utils/factureConstants";

import ModalImpression from "./Comptabilite/modals/ModalImpression";
import ModalNouvelleFacture from "./Comptabilite/modals/ModalNouvelleFacture";
import ModalDetailFacture from "./Comptabilite/modals/ModalDetailFacture";
import ChargesDetail from "./Comptabilite/components/ChargesDetail";
import { ToastContainer, ConfirmToast } from "./Comptabilite/components/Toasts";
import {
  downloadBlob,
  downloadCsvBlob,
  downloadCsvString,
} from "./Comptabilite/utils/downloadHelpers";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

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
    downloadCsvString(csv, `factures-blancbleu-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportDSN = () => {
    if (!compta) return;
    const headers = ["SIRET", "NOM", "PRENOM", "PERIODE", "BRUT", "COT_SAL", "NET", "COT_PAT"];
    const periode = `${String(moisActuel).padStart(2, "0")}/${anneeActuelle}`;
    const csv = [
      headers.join(";"),
      `000000000000000;;(collectif);${periode};${compta.charges.salaires};${compta.urssaf.cotisationsSalariales};${compta.urssaf.salaireNet};${compta.urssaf.cotisationsPatronales}`,
    ].join("\n");
    downloadCsvString(csv, `DSN-URSSAF-${periode.replace("/", "-")}.csv`);
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
    downloadCsvString(lines.join("\n"), `rapport-comptable-${periode.replace(" ", "-")}.csv`);
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
