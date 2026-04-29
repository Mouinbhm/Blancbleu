const STEPS = [
  { key: "REQUESTED",              label: "Demandé"     },
  { key: "CONFIRMED",              label: "Confirmé"    },
  { key: "SCHEDULED",              label: "Planifié"    },
  { key: "ASSIGNED",               label: "Assigné"     },
  { key: "EN_ROUTE_TO_PICKUP",     label: "En route"    },
  { key: "ARRIVED_AT_PICKUP",      label: "Sur place"   },
  { key: "PATIENT_ON_BOARD",       label: "À bord"      },
  { key: "ARRIVED_AT_DESTINATION", label: "Destination" },
  { key: "COMPLETED",              label: "Terminé"     },
];

export default function TransportProgressBar({ statut, className = "" }) {
  const isTerminalBad = ["CANCELLED", "NO_SHOW"].includes(statut);
  const currentIdx = STEPS.findIndex((s) => s.key === statut);

  return (
    <div className={`flex items-start overflow-x-auto ${className}`} style={{ scrollbarWidth: "none" }}>
      <style>{`@keyframes pb-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      {STEPS.map((step, i) => {
        const isPast = currentIdx >= 0 && i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center" style={{ minWidth: 46 }}>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                  isTerminalBad && isCurrent
                    ? "border-red-500 bg-red-500"
                    : isCurrent
                    ? "border-blue-600 bg-blue-600 ring-4 ring-blue-100"
                    : isPast
                    ? "border-blue-500 bg-blue-500"
                    : "border-slate-200 bg-white"
                }`}
                style={isCurrent && !isTerminalBad ? { animation: "pb-pulse 1.5s ease infinite" } : undefined}
              >
                {isPast && (
                  <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                    <path d="M1 3.5L3 5.5L6 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p
                className={`text-[9px] font-semibold mt-1.5 text-center leading-none whitespace-nowrap ${
                  isTerminalBad && isCurrent
                    ? "text-red-500"
                    : isCurrent
                    ? "text-blue-600"
                    : isPast
                    ? "text-blue-400"
                    : "text-slate-300"
                }`}
              >
                {step.label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-shrink-0 mb-4 ${isPast ? "bg-blue-400" : "bg-slate-200"}`}
                style={{ width: 18 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
