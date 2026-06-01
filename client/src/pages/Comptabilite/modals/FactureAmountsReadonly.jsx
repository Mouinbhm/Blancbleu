/**
 * FactureAmountsReadonly — bloc montants en lecture seule (facture payée/annulée).
 * Sous-bloc de ModalDetailFacture (séparé pour respecter <300 LOC).
 */
import { fmtEur, fmtDate } from "../../../utils/formatters";
import { labelF } from "../utils/factureConstants";

export default function FactureAmountsReadonly({ facture }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm">
      <p className={labelF}>Montants</p>
      <div className="flex justify-between">
        <span className="text-slate-500">Montant total</span>
        <span className="font-mono font-bold text-navy">{fmtEur(facture.montantTotal)}</span>
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
          <span className="font-semibold text-emerald-600">{fmtDate(facture.datePaiement)}</span>
        </div>
      )}
    </div>
  );
}
