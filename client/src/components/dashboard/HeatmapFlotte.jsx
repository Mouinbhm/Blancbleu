/**
 * HeatmapFlotte — Grille 7 jours × 3 types de véhicules
 *
 * Affiche pour chaque cellule le ratio transports attendus / véhicules disponibles.
 * Colorisation par tension :
 *   Vert  : < 70 %
 *   Orange : 70–90 %
 *   Rouge  : ≥ 90 %
 */

const TYPES = [
  { key: "VSL", icon: "directions_car" },
  { key: "TPMR", icon: "accessible" },
  { key: "AMBULANCE", icon: "airport_shuttle" },
];

function cellCls(tension) {
  if (tension >= 0.9) return "bg-red-100 text-red-700 border-red-200";
  if (tension >= 0.7) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

export default function HeatmapFlotte({ predictions }) {
  if (!predictions?.length) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate" style={{ borderSpacing: "3px" }}>
        <thead>
          <tr>
            <th className="text-left text-slate-400 font-semibold pb-2 pr-2 w-20" />
            {predictions.map((p) => (
              <th key={p.date} className="text-center pb-2 px-0.5">
                <div className="text-slate-600 font-semibold">{p.jourSemaine.slice(0, 3)}</div>
                <div className="text-slate-400 font-normal text-[10px]">
                  {new Date(p.date + "T12:00:00").toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TYPES.map((t) => (
            <tr key={t.key}>
              <td className="pr-2 py-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="material-symbols-outlined text-slate-400"
                    style={{ fontSize: 13 }}
                  >
                    {t.icon}
                  </span>
                  <span className="text-slate-500 font-semibold">{t.key}</span>
                </div>
              </td>

              {predictions.map((p) => {
                const cell = p.parType[t.key];
                const pct = Math.round(cell.tension * 100);
                return (
                  <td key={p.date} className="py-0.5 px-0.5">
                    <div
                      className={`rounded-lg border text-center py-1.5 min-w-[36px] ${cellCls(cell.tension)}`}
                      title={`${cell.attendus} attendus / ${cell.disponibles} véhicules — ${pct}%`}
                    >
                      <div className="font-bold leading-none">{cell.attendus}</div>
                      <div className="text-[10px] opacity-60 leading-none mt-0.5">
                        /{cell.disponibles}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Légende */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-200 inline-block" />
          &lt; 70 % — Confortable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-200 inline-block" />
          70–90 % — Tendu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-200 inline-block" />
          &gt; 90 % — Critique
        </span>
        <span className="ml-auto italic">
          Valeur = transports prévus / véhicules disponibles
        </span>
      </div>
    </div>
  );
}
