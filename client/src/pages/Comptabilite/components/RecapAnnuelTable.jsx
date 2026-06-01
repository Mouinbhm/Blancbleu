/**
 * RecapAnnuelTable — tableau récapitulatif annuel (CA/charges/résultat/marge).
 * Extrait du monolithe Factures.jsx (rendu identique). Totaux via
 * comptabiliteCalculs (fonctions pures testables).
 */
import { memo } from "react";
import { fmtEur } from "../../../utils/formatters";
import { MOIS_LABELS } from "../utils/factureConstants";
import { totalCA, totalCharges, totalResultat } from "../utils/comptabiliteCalculs";

function RecapAnnuelTable({ recapAnnuel, anneeActuelle, moisActuel }) {
  if (!recapAnnuel) return null;
  const totResultat = totalResultat(recapAnnuel);

  return (
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
            {recapAnnuel.map((r) => {
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
                    {estFutur || r.marge === null ? "—" : `${r.marge > 0 ? "+" : ""}${r.marge}×`}
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
              <td className="px-4 py-3 font-mono text-navy">{fmtEur(totalCA(recapAnnuel))}</td>
              <td className="px-4 py-3 font-mono text-navy">{fmtEur(totalCharges(recapAnnuel))}</td>
              <td className="px-4 py-3 font-mono">
                <span className={totResultat >= 0 ? "text-emerald-600" : "text-red-500"}>
                  {fmtEur(totResultat)}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-400">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default memo(RecapAnnuelTable);
