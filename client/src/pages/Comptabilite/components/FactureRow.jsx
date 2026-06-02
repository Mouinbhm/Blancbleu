/**
 * FactureRow — une ligne du tableau de factures (mémoïsé).
 * Extrait du monolithe Factures.jsx (rendu + actions identiques).
 */
import { memo } from "react";
import { fmtDate, fmtMontant } from "../../../utils/formatters";
import { patientNom } from "../utils/factureMappers";
import FactureStatusBadge from "./FactureStatusBadge";
import FacturePaymentBadge from "./FacturePaymentBadge";

function FactureRow({
  facture: f,
  index,
  isPaying,
  onOpenDetail,
  onConfirmPay,
  onEmettre,
  onDownloadPdf,
  onDownloadReceipt,
  onPrint,
  onCancel,
}) {
  return (
    <tr
      onClick={() => onOpenDetail(f)}
      className={`cursor-pointer border-b border-slate-100 hover:bg-blue-50 transition-all ${index % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
    >
      <td className="px-4 py-3 font-mono font-bold text-primary text-sm">{f.numero}</td>
      <td className="px-4 py-3 font-mono text-sm text-slate-600">{fmtDate(f.dateEmission)}</td>
      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{f.transportId?.numero || "—"}</td>
      <td className="px-4 py-3 text-sm font-medium text-navy">{patientNom(f)}</td>
      <td className="px-4 py-3 font-mono font-bold text-navy text-sm">
        {fmtMontant(f.montantTotal)}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-emerald-600">{fmtMontant(f.montantCPAM)}</td>
      <td className="px-4 py-3 font-mono text-sm text-red-500">{fmtMontant(f.montantPatient)}</td>
      <td className="px-4 py-3">
        <FactureStatusBadge statut={f.statut} />
      </td>
      <td className="px-4 py-3">
        <FacturePaymentBadge paymentStatus={f.paymentStatus} />
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 flex-wrap">
          {["brouillon", "emise", "en_attente", "payment_failed"].includes(f.statut) && (
            <button
              title="Marquer payée"
              onClick={() => onConfirmPay({ id: f._id, numero: f.numero })}
              disabled={isPaying}
              className="w-7 h-7 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-emerald-600 text-sm">payments</span>
            </button>
          )}
          {f.statut === "brouillon" && (
            <button
              title="Émettre la facture"
              onClick={() => onEmettre(f._id, "emise")}
              className="w-7 h-7 rounded-lg border border-blue-200 bg-blue-50 flex items-center justify-center hover:bg-blue-100"
            >
              <span className="material-symbols-outlined text-blue-600 text-sm">send</span>
            </button>
          )}
          {/* Télécharger PDF facture */}
          <button
            title="Télécharger PDF facture"
            onClick={() => onDownloadPdf(f._id, f.numero)}
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
              onClick={() => onDownloadReceipt(f._id, f.numero)}
              className="w-7 h-7 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-all"
            >
              <span className="material-symbols-outlined text-emerald-600 text-sm">receipt</span>
            </button>
          )}
          <button
            title="Imprimer"
            onClick={() => onPrint(f)}
            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
          >
            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
              print
            </span>
          </button>
          {f.statut !== "annulee" && (
            <button
              title="Annuler"
              onClick={() => onCancel(f._id)}
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
}

export default memo(FactureRow);
