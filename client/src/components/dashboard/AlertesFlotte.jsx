/**
 * AlertesFlotte — Liste des alertes de tension prédites sur 7 jours
 *
 * Génère automatiquement des alertes CRITIQUE et TENDU à partir des
 * prédictions retournées par /api/analytics/prediction-flotte.
 */

function genererAlertes(predictions) {
  const alertes = [];

  for (const p of predictions) {
    const typesCritiques = Object.entries(p.parType)
      .filter(([, v]) => v.tension >= 0.9)
      .map(([k]) => k);

    const typesTendus = Object.entries(p.parType)
      .filter(([, v]) => v.tension >= 0.7 && v.tension < 0.9)
      .map(([k]) => k);

    const dateLabel = new Date(p.date + "T12:00:00").toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    if (typesCritiques.length > 0) {
      alertes.push({
        niveau: "CRITIQUE",
        date: p.date,
        message: `Surcharge critique prévue ${dateLabel} — ${typesCritiques.join(", ")}`,
        tensionMax: p.tensionMax,
      });
    } else if (typesTendus.length > 0) {
      alertes.push({
        niveau: "TENDU",
        date: p.date,
        message: `Flotte tendue ${dateLabel} — ${typesTendus.join(", ")}`,
        tensionMax: p.tensionMax,
      });
    }
  }

  return alertes;
}

export default function AlertesFlotte({ predictions, onVoirPlanning }) {
  if (!predictions?.length) return null;

  const alertes = genererAlertes(predictions);

  if (alertes.length === 0) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <span className="material-symbols-outlined text-base">check_circle</span>
        Flotte suffisante sur les 7 prochains jours
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alertes.map((a, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
            a.niveau === "CRITIQUE"
              ? "bg-red-50 border border-red-200 text-red-800"
              : "bg-amber-50 border border-amber-200 text-amber-800"
          }`}
        >
          <span
            className="material-symbols-outlined text-base flex-shrink-0 mt-0.5"
          >
            {a.niveau === "CRITIQUE" ? "error" : "warning"}
          </span>
          <span className="flex-1 leading-snug">{a.message}</span>
          <span className="text-xs font-bold opacity-60 flex-shrink-0 mt-0.5">
            {Math.round(a.tensionMax * 100)}%
          </span>
        </div>
      ))}

      <button
        onClick={onVoirPlanning}
        className="text-xs text-primary font-semibold hover:underline mt-1 flex items-center gap-1"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
          calendar_month
        </span>
        Voir le planning →
      </button>
    </div>
  );
}
