import { useState, useCallback } from "react";
import api, { factureService, comptabiliteService } from "../services/api";
import { fmtDate, fmtEur } from "../utils/formatters";
import { patientNom } from "./Comptabilite/utils/factureMappers";
import { MOIS_LABELS, MOIS_NOMS } from "./Comptabilite/utils/factureConstants";

import ModalImpression from "./Comptabilite/modals/ModalImpression";
import ModalNouvelleFacture from "./Comptabilite/modals/ModalNouvelleFacture";
import ModalDetailFacture from "./Comptabilite/modals/ModalDetailFacture";
import { ToastContainer, ConfirmToast } from "./Comptabilite/components/Toasts";
import FactureFilters from "./Comptabilite/components/FactureFilters";
import FactureTable from "./Comptabilite/components/FactureTable";
import ComptabiliteDashboard from "./Comptabilite/components/ComptabiliteDashboard";
import { downloadCsvBlob, downloadCsvString } from "./Comptabilite/utils/downloadHelpers";
import { useFactures } from "./Comptabilite/hooks/useFactures";
import { useComptabilite } from "./Comptabilite/hooks/useComptabilite";
import { useFactureMutations } from "./Comptabilite/hooks/useFactureMutations";

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Factures() {
  const now = new Date();
  const [moisActuel, setMoisActuel] = useState(now.getMonth() + 1);
  const [anneeActuelle, setAnneeActuelle] = useState(now.getFullYear());

  // UI factures (filtres + état des modals/actions)
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [factureImprimer, setFactureImprimer] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [modalNouvelle, setModalNouvelle] = useState(false);
  const [factureDetail, setFactureDetail] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmPay, setConfirmPay] = useState(null);

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  // ── Données (hooks dédiés) ───────────────────────────────────────────────────
  const { factures, setFactures, stats, loading, reloadFactures } = useFactures(
    filterStatut,
    addToast,
  );
  const { compta, setCompta, comptaLoading } = useComptabilite(anneeActuelle, moisActuel);

  const { handleStatut, handleDelete, handleDownloadPdf, handleDownloadReceipt } =
    useFactureMutations({
      factures,
      setFactures,
      reloadFactures,
      addToast,
      setActionId,
      setConfirmPay,
    });

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

      {/* ── Dashboard comptabilité (période, alertes, KPI, graphiques, charges) ── */}
      <ComptabiliteDashboard
        compta={compta}
        comptaLoading={comptaLoading}
        stats={stats}
        moisActuel={moisActuel}
        anneeActuelle={anneeActuelle}
        onMois={setMoisActuel}
        onAnnee={setAnneeActuelle}
        onExportDSN={exportDSN}
      />

      {/* ── Filtres & recherche ─────────────────────────────────────────────── */}
      <FactureFilters
        filterStatut={filterStatut}
        onFilterStatut={setFilterStatut}
        search={search}
        onSearch={setSearch}
        onNouvelle={() => setModalNouvelle(true)}
      />

      {/* ── Sous-titre section factures ────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-primary text-base">receipt_long</span>
        <h2 className="font-brand font-bold text-navy text-base">Factures — Facturation CPAM</h2>
      </div>

      {/* ── Tableau factures ───────────────────────────────────────────────── */}
      <FactureTable
        factures={filtered}
        loading={loading}
        totalFiltre={totalFiltre}
        actionId={actionId}
        onOpenDetail={setFactureDetail}
        onConfirmPay={setConfirmPay}
        onEmettre={handleStatut}
        onDownloadPdf={handleDownloadPdf}
        onDownloadReceipt={handleDownloadReceipt}
        onPrint={setFactureImprimer}
        onCancel={handleDelete}
      />

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
