/**
 * BlancBleu — DurationBadge
 * Affiche la prédiction de durée retournée par le microservice XGBoost.
 *
 * Props :
 *   prediction  object|null  Résultat de predictDuree()
 *   loading     bool         En attente de la réponse
 *   compact     bool         Version réduite pour l'onglet Dispatch
 */

const CONFIANCE_STYLE = {
  HAUTE:   { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  MOYENNE: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   dot: "bg-amber-500" },
  FAIBLE:  { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",      dot: "bg-red-500"   },
};

function ImpactPill({ impact, feature, valeur }) {
  const isPositive = impact.startsWith("+");
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs ${
      isPositive
        ? "bg-red-50 border-red-100 text-red-700"
        : "bg-emerald-50 border-emerald-100 text-emerald-700"
    }`}>
      <span className="flex items-center gap-1 font-medium">
        <span className="material-symbols-outlined text-sm">
          {isPositive ? "trending_up" : "trending_down"}
        </span>
        {feature.replace(/^(mobilite_|type_vehicule_|type_etablissement_|motif_)/, "")}
      </span>
      <span className="font-mono font-bold">{impact}</span>
    </div>
  );
}

export default function DurationBadge({ prediction, loading, compact = false }) {
  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${compact ? "px-3 py-2" : "px-4 py-3"} bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-500 font-medium`}>
        <div className="w-4 h-4 border-2 border-blue-200 border-t-primary rounded-full animate-spin flex-shrink-0" />
        Prédiction durée en cours...
      </div>
    );
  }

  if (!prediction) return null;

  const confiance = prediction.confiance || "FAIBLE";
  const style = CONFIANCE_STYLE[confiance] || CONFIANCE_STYLE.FAIBLE;
  const contributions = prediction.contributions?.slice(0, 3) || [];

  if (compact) {
    return (
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-base">schedule</span>
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              Durée estimée (XGBoost)
            </span>
          </div>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${style.bg} ${style.border} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {confiance}
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-brand font-bold text-2xl text-navy">
            {prediction.duree_minutes} min
          </span>
          <span className="text-xs text-slate-400 font-mono">
            [{prediction.duree_min}–{prediction.duree_max}]
          </span>
          <span className="ml-auto text-xs font-mono text-slate-500">
            fin ~{prediction.heure_fin_estimee}
          </span>
        </div>

        {contributions.length > 0 && (
          <div className="space-y-1">
            {contributions.map((c, i) => (
              <ImpactPill key={i} {...c} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Version complète (onglet Prédiction durée)
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-4">
        <p className="font-mono text-xs text-indigo-200 tracking-widest uppercase mb-1">
          Module 4 — XGBoost Duration Predictor
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-brand font-bold text-white text-3xl">
              {prediction.duree_minutes} min
            </span>
            <span className="text-indigo-200 text-sm font-mono">
              [{prediction.duree_min}–{prediction.duree_max}]
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-indigo-200 font-mono">Heure de fin estimée</p>
            <p className="font-mono font-bold text-white text-xl">{prediction.heure_fin_estimee}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Badge confiance */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold border ${style.bg} ${style.border} ${style.text}`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${style.dot}`} />
          Confiance : {confiance}
        </div>

        {/* Intervalle */}
        <div>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
            Intervalle de confiance (±15 %)
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-slate-500 w-14">{prediction.duree_min} min</span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full relative overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-indigo-400 to-blue-500 rounded-full"
                style={{
                  left:  `${(prediction.duree_min / prediction.duree_max) * 100 * 0.2}%`,
                  right: `${(1 - prediction.duree_max / (prediction.duree_max * 1.1)) * 100}%`,
                  width: "60%",
                }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-navy"
                style={{
                  left: `${((prediction.duree_minutes - prediction.duree_min) / (prediction.duree_max - prediction.duree_min)) * 100}%`,
                }}
              />
            </div>
            <span className="font-mono text-sm text-slate-500 w-14 text-right">{prediction.duree_max} min</span>
          </div>
        </div>

        {/* Contributions SHAP */}
        {contributions.length > 0 && (
          <div>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
              Facteurs explicatifs (SHAP — top {contributions.length})
            </p>
            <div className="space-y-1.5">
              {contributions.map((c, i) => (
                <ImpactPill key={i} {...c} />
              ))}
            </div>
            <p className="text-xs text-slate-300 mt-2 font-mono">
              Rouge = allonge la durée · Vert = réduit la durée
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
