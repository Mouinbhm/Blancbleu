/**
 * UrssafCard — bloc déclaration URSSAF du dashboard comptabilité.
 * Extrait de ComptabiliteDashboard (<300 LOC). Rendu identique.
 */
import { memo } from "react";
import { fmtEur } from "../../../utils/formatters";

function UrssafCard({ compta, moisNomActuel, anneeActuelle, onExportDSN }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-orange-500 text-base">account_balance</span>
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
                <span className="font-mono font-bold text-emerald-600">{fmtEur(u.salaireNet)}</span>
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
                  <span className="material-symbols-outlined text-sm">schedule</span>À payer avant
                  le {new Date(u.echeance).toLocaleDateString("fr-FR")}
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
                    onClick={onExportDSN}
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
  );
}

export default memo(UrssafCard);
