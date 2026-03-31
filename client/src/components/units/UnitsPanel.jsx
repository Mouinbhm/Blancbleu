import { useState } from "react";

const initialUnits = [
  {
    code: "AMB-01",
    status: "disponible",
    location: "Secteur Nord",
    zone: "Nord",
  },
  { code: "AMB-03", status: "en-route", location: "ETA 4 min", zone: "Sud" },
  { code: "AMB-05", status: "sur-place", location: "INT-0841", zone: "Est" },
  { code: "AMB-07", status: "en-route", location: "ETA 6 min", zone: "Ouest" },
  { code: "AMB-09", status: "en-route", location: "ETA 2 min", zone: "Centre" },
  {
    code: "AMB-11",
    status: "disponible",
    location: "Secteur Est",
    zone: "Est",
  },
  { code: "AMB-15", status: "hors-service", location: "Garage", zone: "—" },
];

const statusConfig = {
  disponible: {
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    label: "DISPONIBLE",
    pulse: true,
  },
  "en-route": {
    dot: "bg-yellow-500",
    text: "text-yellow-600",
    label: "EN ROUTE",
    pulse: false,
  },
  "sur-place": {
    dot: "bg-red-500",
    text: "text-red-600",
    label: "SUR PLACE",
    pulse: false,
  },
  "hors-service": {
    dot: "bg-slate-400",
    text: "text-slate-500",
    label: "HORS SERVICE",
    pulse: false,
  },
};

export default function UnitsPanel() {
  const [units] = useState(initialUnits);
  const available = units.filter((u) => u.status === "disponible").length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-brand font-bold text-navy text-sm">
          Unités ambulancières
        </h3>
        <span className="bg-blue-100 text-blue-700 text-xs font-mono font-bold px-2 py-0.5 rounded-full">
          {available} dispo
        </span>
      </div>

      {/* List */}
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-80">
        {units.map((unit) => {
          const s = statusConfig[unit.status] || statusConfig["hors-service"];
          return (
            <div
              key={unit.code}
              className="px-4 py-3 flex items-center gap-3 hover:bg-blue-50/50 cursor-pointer transition-colors group"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot} ${s.pulse ? "animate-pulse" : ""}`}
              />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-bold text-navy">
                  {unit.code}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {unit.location}
                </p>
              </div>
              <span
                className={`text-xs font-mono font-bold ${s.text} hidden group-hover:hidden`}
              >
                {s.label}
              </span>
              <button className="opacity-0 group-hover:opacity-100 text-xs text-primary border border-primary px-2 py-1 rounded-lg transition-all hover:bg-primary hover:text-white font-medium">
                Affecter
              </button>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="p-3 border-t border-slate-100">
        <button className="w-full py-3 bg-primary text-white rounded-xl font-brand font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Nouvelle intervention
        </button>
      </div>
    </div>
  );
}
