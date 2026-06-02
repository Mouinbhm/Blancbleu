/**
 * FactureTable — tableau des factures (en-tête, lignes, pied total).
 * Extrait du monolithe Factures.jsx (rendu identique).
 */
import { FactureRowSkeleton } from "../../../components/ui/Skeleton";
import { fmtMontant } from "../../../utils/formatters";
import FactureRow from "./FactureRow";

const HEADERS = [
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
];

export default function FactureTable({
  factures,
  loading,
  totalFiltre,
  actionId,
  onOpenDetail,
  onConfirmPay,
  onEmettre,
  onDownloadPdf,
  onDownloadReceipt,
  onPrint,
  onCancel,
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
      <table className="w-full">
        <thead>
          <tr className="bg-navy">
            {HEADERS.map((h) => (
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
          ) : factures.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-center py-16">
                <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 48 }}>
                  receipt_long
                </span>
                <p className="text-slate-400 mt-3 text-sm">Aucune facture trouvée</p>
              </td>
            </tr>
          ) : (
            factures.map((f, i) => (
              <FactureRow
                key={f._id}
                facture={f}
                index={i}
                isPaying={actionId === f._id}
                onOpenDetail={onOpenDetail}
                onConfirmPay={onConfirmPay}
                onEmettre={onEmettre}
                onDownloadPdf={onDownloadPdf}
                onDownloadReceipt={onDownloadReceipt}
                onPrint={onPrint}
                onCancel={onCancel}
              />
            ))
          )}
        </tbody>
      </table>

      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">{factures.length} facture(s) affichée(s)</span>
        <span className="text-xs font-mono font-bold text-navy">
          Total affiché : {fmtMontant(totalFiltre)}
        </span>
      </div>
    </div>
  );
}
