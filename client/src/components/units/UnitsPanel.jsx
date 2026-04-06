import { useNavigate } from "react-router-dom";

const statutColor = {
  disponible: "bg-emerald-400",
  en_mission: "bg-yellow-400",
  maintenance: "bg-red-400",
  indisponible: "bg-slate-400",
};
const statutLabel = {
  disponible: "Disponible",
  en_mission: "En mission",
  maintenance: "Maintenance",
  indisponible: "Indisponible",
};

export default function UnitsPanel({ units = [], loading = false }) {
  const navigate = useNavigate();
  const disponibles = units.filter((u) => u.statut === "disponible").length;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="font-brand font-bold text-navy text-sm">
          Unités ambulancières
        </h3>
        <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
          {disponibles} dispo
        </span>
      </div>

      {/* Liste */}
      <div className="overflow-y-auto" style={{ maxHeight: "420px" }}>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid #e2e8f0",
                borderTop: "2px solid #1D6EF5",
                borderRadius: "50%",
                animation: "spin .7s linear infinite",
              }}
            />
            <span className="text-xs">Chargement…</span>
          </div>
        ) : units.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs">
            Aucune unité enregistrée
          </div>
        ) : (
          units.map((u) => (
            <div
              key={u._id}
              onClick={() => navigate(`/carte?unitId=${u._id}`)}
              className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 hover:bg-blue-50 cursor-pointer transition-colors group"
            >
              {/* Indicateur statut */}
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statutColor[u.statut] || "bg-slate-400"}`}
              />

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="font-mono font-bold text-navy text-sm">{u.nom}</p>
                <p className="text-xs text-slate-400 truncate">
                  {u.interventionEnCours
                    ? `INT-${u.interventionEnCours.numero || "en cours"}`
                    : u.position?.adresse || u.type}
                </p>
              </div>

              {/* Statut + flèche */}
              <div className="flex items-center gap-1">
                <span
                  className={`text-xs font-semibold ${
                    u.statut === "disponible"
                      ? "text-emerald-600"
                      : u.statut === "en_mission"
                        ? "text-yellow-600"
                        : "text-red-500"
                  }`}
                >
                  {statutLabel[u.statut] || u.statut}
                </span>
                <span className="material-symbols-outlined text-slate-300 text-sm group-hover:text-primary transition-colors">
                  chevron_right
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
        <button
          onClick={() => navigate("/flotte")}
          className="w-full text-xs font-bold text-primary hover:text-blue-700 transition-colors text-center"
        >
          Gérer la flotte →
        </button>
      </div>
    </div>
  );
}
