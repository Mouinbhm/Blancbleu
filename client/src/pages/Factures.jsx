import { useState, useCallback } from "react";
import api, { factureService, comptabiliteService } from "../services/api";
import { patientNom } from "./Comptabilite/utils/factureMappers";

import ModalImpression from "./Comptabilite/modals/ModalImpression";
import ModalNouvelleFacture from "./Comptabilite/modals/ModalNouvelleFacture";
import ModalDetailFacture from "./Comptabilite/modals/ModalDetailFacture";
import { ToastContainer, ConfirmToast } from "./Comptabilite/components/Toasts";
import FactureFilters from "./Comptabilite/components/FactureFilters";
import FactureTable from "./Comptabilite/components/FactureTable";
import ComptabiliteDashboard from "./Comptabilite/components/ComptabiliteDashboard";
import RecapAnnuelTable from "./Comptabilite/components/RecapAnnuelTable";
import { downloadCsvBlob } from "./Comptabilite/utils/downloadHelpers";
import {
  exportFacturesCsv,
  exportDsnCsv,
  exportRapportCsv,
} from "./Comptabilite/utils/factureExports";
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
  const exportCSV = () => exportFacturesCsv(filtered);
  const exportDSN = () => exportDsnCsv(compta, moisActuel, anneeActuelle);
  const exportRapport = () =>
    exportRapportCsv(compta, factures, filtered, moisActuel, anneeActuelle);

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

      {/* ── Récapitulatif annuel ────────────────────────────────────────────── */}
      <RecapAnnuelTable
        recapAnnuel={compta?.recapAnnuel}
        anneeActuelle={anneeActuelle}
        moisActuel={moisActuel}
      />
    </div>
  );
}
