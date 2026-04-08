import { useState, useEffect } from "react";
import { escaladeService } from "../../services/api";

const COULEURS = {
  EMERGENCY: {
    bg: "bg-red-50",
    border: "border-red-400",
    text: "text-red-700",
    icon: "emergency",
    badge: "bg-red-500",
  },
  CRITICAL: {
    bg: "bg-orange-50",
    border: "border-orange-400",
    text: "text-orange-700",
    icon: "warning",
    badge: "bg-orange-500",
  },
  WARNING: {
    bg: "bg-yellow-50",
    border: "border-yellow-400",
    text: "text-yellow-700",
    icon: "info",
    badge: "bg-yellow-500",
  },
};

export default function EscaladeBanner() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const charger = async () => {
      try {
        const [d, u] = await Promise.all([
          escaladeService.dashboard(),
          escaladeService.unitesStatus(),
        ]);
        setData({ dash: d.data, unites: u.data });
      } catch {}
    };
    charger();
    const iv = setInterval(charger, 60000);
    return () => clearInterval(iv);
  }, []);

  if (!data || !open) return null;
  const { dash, unites } = data;
  const niveau = dash.resume?.niveau;
  if (niveau === "OK" && !unites.alerte) return null;

  const col =
    COULEURS[niveau] || COULEURS[unites.alerte?.niveau] || COULEURS.WARNING;

  return (
    <div className={`rounded-xl border-l-4 p-4 mb-5 ${col.bg} ${col.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${col.badge}`}
          >
            <span className="material-symbols-outlined text-white text-sm">
              {col.icon}
            </span>
          </div>
          <div className="flex-1">
            <p className={`font-bold text-sm ${col.text}`}>
              {niveau === "EMERGENCY"
                ? "🚨 ALERTE CRITIQUE"
                : "⚠ Attention requise"}
            </p>
            {unites.alerte && (
              <p className={`text-xs mt-1 ${col.text}`}>
                <strong>Unités :</strong> {unites.alerte.message} (
                {unites.disponibles}/{unites.total} disponibles)
              </p>
            )}
            {dash.resume?.necessitentAction > 0 && (
              <p className={`text-xs mt-1 ${col.text}`}>
                <strong>{dash.resume.necessitentAction} intervention(s)</strong>{" "}
                nécessitent une action immédiate
              </p>
            )}
            {dash.interventions
              ?.filter((i) => i.alertes > 0)
              .slice(0, 3)
              .map((i) => (
                <div
                  key={i.interventionId}
                  className={`text-xs mt-1 flex items-center gap-1 ${col.text} opacity-80`}
                >
                  <span className="material-symbols-outlined text-xs">
                    chevron_right
                  </span>
                  <span className="font-mono">{i.numero}</span> — {i.resume}
                </div>
              ))}
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className={`${col.text} opacity-60 hover:opacity-100`}
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    </div>
  );
}
