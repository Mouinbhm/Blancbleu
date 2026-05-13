// Fichier : client/src/components/vehicle/VehicleCard.jsx
const TYPE_CONFIG = {
  VSL:       { icon: "directions_car",  label: "VSL",        color: "bg-blue-100 text-blue-700"    },
  AMBULANCE: { icon: "airport_shuttle", label: "Ambulance",  color: "bg-red-100 text-red-700"      },
  TPMR:      { icon: "accessible",      label: "TPMR",       color: "bg-purple-100 text-purple-700" },
};

const STATUT_CONFIG = {
  // New canonical values
  "Disponible":   { label: "Disponible",   dot: "bg-green-500",  bg: "bg-green-100",  text: "text-green-700"  },
  "En service":   { label: "En service",   dot: "bg-blue-500",   bg: "bg-blue-100",   text: "text-blue-700"   },
  "Maintenance":  { label: "Maintenance",  dot: "bg-yellow-500", bg: "bg-yellow-100", text: "text-yellow-700" },
  "Hors service": { label: "Hors service", dot: "bg-red-500",    bg: "bg-red-100",    text: "text-red-700"    },
  // Legacy values (pre-migration fallback)
  "disponible":   { label: "Disponible",   dot: "bg-green-500",  bg: "bg-green-100",  text: "text-green-700"  },
  "en_mission":   { label: "En service",   dot: "bg-blue-500",   bg: "bg-blue-100",   text: "text-blue-700"   },
  "maintenance":  { label: "Maintenance",  dot: "bg-yellow-500", bg: "bg-yellow-100", text: "text-yellow-700" },
  "hors_service": { label: "Hors service", dot: "bg-red-500",    bg: "bg-red-100",    text: "text-red-700"    },
};

function FuelBar({ value }) {
  const color =
    value >= 50 ? "bg-green-400" : value >= 25 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-slate-400 text-base">local_gas_station</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(value || 0, 2)}%` }} />
      </div>
      <span className="text-xs text-slate-500 font-mono w-8 text-right">{value ?? "—"}%</span>
    </div>
  );
}

export default function VehicleCard({ vehicle, onClick }) {
  const typeCfg   = TYPE_CONFIG[vehicle.type]         || TYPE_CONFIG.VSL;
  const statutCfg = STATUT_CONFIG[vehicle.statut]     || STATUT_CONFIG["Hors service"];
  const driver    = vehicle.currentPersonnelId;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeCfg.color}`}>
            <span className="material-symbols-outlined text-xl">{typeCfg.icon}</span>
          </div>
          <div>
            <p className="font-bold text-navy text-sm">{vehicle.nom}</p>
            <p className="text-xs text-slate-400 font-mono">{vehicle.immatriculation}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${statutCfg.bg} ${statutCfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statutCfg.dot}`} />
          {statutCfg.label}
        </span>
      </div>

      {/* Chauffeur actif (shift en cours) */}
      {vehicle.statut === "En service" && (
        <div className="mb-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-500 text-base">person</span>
          <div className="min-w-0">
            {driver ? (
              <p className="text-xs font-semibold text-blue-800 truncate">
                {driver.prenom} {driver.nom}
              </p>
            ) : (
              <p className="text-xs text-blue-600">Chauffeur en service</p>
            )}
          </div>
        </div>
      )}

      {/* Métriques */}
      <div className="space-y-2 mb-3">
        <FuelBar value={vehicle.carburant} />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="material-symbols-outlined text-slate-400 text-base">speed</span>
          {(typeof vehicle.kilometrage === "object"
            ? vehicle.kilometrage?.actuel
            : vehicle.kilometrage
          )?.toLocaleString("fr-FR") ?? "—"} km
        </div>
      </div>

      {/* Capacités */}
      <div className="flex flex-wrap gap-1.5">
        {vehicle.equipeOxygene  && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Oxygène</span>}
        {vehicle.equipeFauteuil && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">Fauteuil</span>}
        {vehicle.equipeBrancard && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">Brancard</span>}
      </div>
    </div>
  );
}
