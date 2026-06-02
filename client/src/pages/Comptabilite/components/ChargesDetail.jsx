/**
 * ChargesDetail — détail des charges (salaires, URSSAF, maintenances).
 * Section du dashboard Comptabilité. Extrait du monolithe Factures.jsx.
 * fmtEur reçu en prop (rétro-compat) — signature inchangée.
 */
import { useState } from "react";

export default function ChargesDetail({ compta, fmtEur }) {
  const [carburantOpen, setCarburantOpen] = useState(false);
  const meta = compta.charges.carburantMeta;
  const total = compta.charges.total || 1;

  const lignes = [
    { label: "Salaires bruts", val: compta.charges.salaires, color: "bg-blue-400" },
    { label: "Cotis. URSSAF", val: compta.charges.urssaf, color: "bg-orange-400" },
    { label: "Maintenances", val: compta.charges.maintenances, color: "bg-yellow-400" },
  ];

  const carburantVal = compta.charges.carburant;
  const carburantPct = total > 0 ? Math.round((carburantVal / total) * 100) : 0;

  return (
    <div className="space-y-2.5">
      {lignes.map((l) => {
        const pct = total > 0 ? Math.round((l.val / total) * 100) : 0;
        return (
          <div key={l.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 font-medium">{l.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-500">{fmtEur(l.val)}</span>
                <span className="text-slate-400 w-8 text-right">{pct}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${l.color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      {/* Carburant — ligne dépliable */}
      <div>
        <button
          type="button"
          onClick={() => setCarburantOpen((o) => !o)}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">Carburant</span>
              {meta?.nbCalcules > 0 && (
                <span className="text-slate-400 text-xs">
                  ({meta.nbCalcules} transport{meta.nbCalcules > 1 ? "s" : ""} ·{" "}
                  {meta.distanceTotaleKm} km)
                </span>
              )}
              <span
                className={`transition-transform inline-block text-slate-400 ${carburantOpen ? "rotate-180" : ""}`}
                style={{ fontSize: 12 }}
              >
                ▾
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-500">{fmtEur(carburantVal)}</span>
              <span className="text-slate-400 w-8 text-right">{carburantPct}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full"
              style={{ width: `${carburantPct}%` }}
            />
          </div>
        </button>

        {carburantOpen && meta && (
          <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs space-y-1.5 border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="material-symbols-outlined text-sm">local_gas_station</span>
              <span>
                Calculé depuis <strong>{meta.nbCalcules}</strong> transport(s) terminé(s)
              </span>
            </div>
            <div className="text-slate-500">
              Distance totale : <strong>{meta.distanceTotaleKm} km</strong>
            </div>
            <div className="text-slate-500">
              Prix moyen : <strong>{meta.prixMoyen} €/L</strong>
            </div>
            {meta.nbSansCoordonnees > 0 && (
              <div className="text-slate-400 italic">
                {meta.nbSansCoordonnees} transport(s) sans coordonnées GPS ignoré(s)
              </div>
            )}

            {/* Avertissement véhicules sans consommation */}
            {meta.vehiculesSansInfo?.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span className="text-amber-600">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-700">
                      Consommation non renseignée sur {meta.vehiculesSansInfo.length} véhicule(s)
                    </p>
                    <p className="text-amber-600 mt-0.5">
                      {meta.vehiculesSansInfo.join(", ")} — 8 L/100km utilisé par défaut
                    </p>
                    <p className="text-amber-500 mt-1">
                      → Aller dans <strong>Flotte</strong> pour renseigner la consommation
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tableau détail si pas trop long */}
            {meta.detail?.length > 0 && meta.detail.length <= 10 && (
              <table className="w-full mt-2 text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-200">
                    <th className="text-left py-1 font-medium">Véhicule</th>
                    <th className="text-right py-1 font-medium">km</th>
                    <th className="text-right py-1 font-medium">L</th>
                    <th className="text-right py-1 font-medium">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.detail.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 text-slate-600">
                        {d.vehicule}
                        {d.usedDefault && <span className="ml-1 text-amber-500">*</span>}
                      </td>
                      <td className="py-1 text-right font-mono text-slate-500">{d.distanceKm}</td>
                      <td className="py-1 text-right font-mono text-slate-500">{d.litres}</td>
                      <td className="py-1 text-right font-mono font-semibold text-slate-700">
                        {fmtEur(d.cout)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {meta.detail?.length > 10 && (
              <p className="text-slate-400 italic">
                {meta.detail.length} lignes — trop nombreuses pour affichage détaillé
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">TOTAL CHARGES</span>
        <span className="text-sm font-mono font-bold text-red-600">
          {fmtEur(compta.charges.total)}
        </span>
      </div>
    </div>
  );
}
