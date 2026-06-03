import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { factureService, comptabiliteService } from "../../services/api";
import {
  useFactures,
  useFactureStats,
  useComptabiliteDashboard,
  factureKeys,
  comptabiliteKeys,
} from "../../hooks/queries/useFactures";
import useSocket from "../../hooks/useSocket";
import { patientNom } from "./utils/factureMappers";
import { ToastContainer, ConfirmToast } from "./components/Toasts";
import FactureFilters from "./components/FactureFilters";
import FactureTable from "./components/FactureTable";
import ComptabiliteDashboard from "./components/ComptabiliteDashboard";
import ComptabiliteHeader from "./components/ComptabiliteHeader";
import RecapAnnuelTable from "./components/RecapAnnuelTable";
import { downloadCsvBlob } from "./utils/downloadHelpers";
import { exportFacturesCsv, exportDsnCsv, exportRapportCsv } from "./utils/factureExports";
import { useFactureMutations } from "./hooks/useFactureMutations";

// Modals chargées à la demande (split de bundle — non rendues au montage).
const ModalImpression = lazy(() => import("./modals/ModalImpression"));
const ModalNouvelleFacture = lazy(() => import("./modals/ModalNouvelleFacture"));
const ModalDetailFacture = lazy(() => import("./modals/ModalDetailFacture"));

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

  // ── Données (React Query — source unique) ────────────────────────────────────
  const qc = useQueryClient();
  const factureParams = { limit: 100, ...(filterStatut ? { statut: filterStatut } : {}) };
  const {
    data: facturesData,
    isLoading: loading,
    isError: facturesError,
  } = useFactures(factureParams);
  const factures = facturesData?.factures || [];
  const { data: stats, isError: statsError } = useFactureStats();
  const {
    data: compta,
    isLoading: comptaLoading,
    isError: comptaError,
  } = useComptabiliteDashboard(anneeActuelle, moisActuel);
  // On ne masque jamais un échec réseau derrière un tableau vide / des 0 €.
  const dataError = facturesError || statsError || comptaError;

  const reloadFactures = useCallback(
    () => qc.invalidateQueries({ queryKey: factureKeys.all }),
    [qc],
  );

  // ── Socket : facture payée en ligne par le patient ───────────────────────────
  // La donnée est rafraîchie centralement par useSocketSync (invalidation
  // factureKeys) ; ici on ne garde que le toast informatif côté page.
  const { subscribe } = useSocket();
  useEffect(() => {
    const unsub = subscribe("facture:updated", (data) => {
      addToast(`Facture ${data.numero} payée en ligne par le patient`);
    });
    return unsub;
  }, [subscribe, addToast]);

  const { handleStatut, handleDelete, handleDownloadPdf, handleDownloadReceipt } =
    useFactureMutations({
      factures,
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
        qc.invalidateQueries({ queryKey: comptabiliteKeys.all });
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
      {/* Modals lazy-loadées : Suspense fallback null (overlay instantané géré
          par la modal elle-même au chargement). */}
      <Suspense fallback={null}>
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
      </Suspense>

      {/* ── Bannière d'erreur réseau (jamais de tableau vide / 0 € masquant un échec) ── */}
      {dataError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          <span className="flex-1">
            Impossible de charger les données de comptabilité — vérifiez votre connexion.
          </span>
          <button
            onClick={() => {
              reloadFactures();
              qc.invalidateQueries({ queryKey: comptabiliteKeys.all });
            }}
            className="font-semibold underline hover:no-underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <ComptabiliteHeader
        showRecalculate={
          stats?.parStatut?.brouillons > 0 ||
          (compta?.ca?.total === 0 && stats?.parStatut?.payees > 0)
        }
        onExportCsv={exportCSV}
        onExportInvoicesCsv={handleExportInvoicesCsv}
        onExportPaymentsCsv={handleExportPaymentsCsv}
        onExportDSN={exportDSN}
        onExportRapport={exportRapport}
        onRecalculate={handleRecalculateAmounts}
      />

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
      {facturesError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 text-center text-sm">
          <span className="material-symbols-outlined text-2xl block mb-2">error</span>
          Impossible de charger les factures.
          <div className="mt-3">
            <button onClick={reloadFactures} className="text-primary font-semibold hover:underline">
              Réessayer
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {/* ── Récapitulatif annuel ────────────────────────────────────────────── */}
      <RecapAnnuelTable
        recapAnnuel={compta?.recapAnnuel}
        anneeActuelle={anneeActuelle}
        moisActuel={moisActuel}
      />
    </div>
  );
}
