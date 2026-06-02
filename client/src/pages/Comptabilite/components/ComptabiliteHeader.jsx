/**
 * ComptabiliteHeader — titre + barre de boutons d'export du dashboard.
 * Extrait du monolithe Factures.jsx (rendu identique).
 */
import { memo } from "react";

function ComptabiliteHeader({
  showRecalculate,
  onExportCsv,
  onExportInvoicesCsv,
  onExportPaymentsCsv,
  onExportDSN,
  onExportRapport,
  onRecalculate,
}) {
  return (
    <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div>
        <h1 className="font-brand font-bold text-2xl text-navy">Comptabilité</h1>
        <p className="text-slate-500 text-sm mt-1">
          Finances & Facturation CPAM — Ambulances Blanc Bleu
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onExportCsv}
          className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary hover:text-white transition-all"
        >
          <span className="material-symbols-outlined text-sm">download</span>Exporter CSV
        </button>
        <button
          onClick={onExportInvoicesCsv}
          className="flex items-center gap-2 text-xs font-bold text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
          title="Export comptable factures (avec statut paiement Stripe)"
        >
          <span className="material-symbols-outlined text-sm">account_balance</span>CSV Comptable
        </button>
        <button
          onClick={onExportPaymentsCsv}
          className="flex items-center gap-2 text-xs font-bold text-violet-600 border border-violet-200 px-4 py-2 rounded-lg hover:bg-violet-600 hover:text-white transition-all"
          title="Export paiements Stripe"
        >
          <span className="material-symbols-outlined text-sm">credit_card</span>CSV Paiements
        </button>
        <button
          onClick={onExportDSN}
          className="flex items-center gap-2 text-xs font-bold text-orange-600 border border-orange-300 px-4 py-2 rounded-lg hover:bg-orange-600 hover:text-white transition-all"
        >
          <span className="material-symbols-outlined text-sm">description</span>Export DSN URSSAF
        </button>
        <button
          onClick={onExportRapport}
          className="flex items-center gap-2 text-xs font-bold text-emerald-600 border border-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"
        >
          <span className="material-symbols-outlined text-sm">bar_chart</span>Rapport complet
        </button>
        {showRecalculate ? (
          <button
            onClick={onRecalculate}
            className="flex items-center gap-2 text-xs font-bold text-red-600 border border-red-300 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white transition-all"
            title="Recalculer les montants des factures à 0 €"
          >
            <span className="material-symbols-outlined text-sm">calculate</span>Recalculer montants
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(ComptabiliteHeader);
