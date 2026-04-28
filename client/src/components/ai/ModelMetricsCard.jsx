/**
 * BlancBleu — ModelMetricsCard
 * Affiche les métriques du modèle XGBoost entraîné.
 * Appelle GET /optimizer/model/metrics au montage.
 * Échoue silencieusement si le service IA est hors ligne.
 */

import { useState, useEffect } from "react";
import { getModelMetrics } from "../../services/optimizerService";

const METRIC_ITEMS = [
  { key: "MAE",    label: "MAE",    unit: "min",  icon: "straighten",  desc: "Erreur absolue moyenne" },
  { key: "R2",     label: "R²",     unit: "",     icon: "show_chart",  desc: "Coefficient de détermination" },
  { key: "MAPE",   label: "MAPE",   unit: "%",    icon: "percent",     desc: "Erreur relative moyenne" },
  { key: "CV_MAE", label: "CV-MAE", unit: "min",  icon: "verified",    desc: "Validation croisée 5 folds" },
];

export default function ModelMetricsCard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline]  = useState(false);

  useEffect(() => {
    getModelMetrics()
      .then((data) => {
        setMetrics(data);
        setOffline(false);
      })
      .catch(() => {
        setOffline(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Service hors ligne → ne pas afficher la carte du tout
  if (offline) return null;

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex items-center gap-3 text-slate-400 text-sm">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
        Chargement des métriques du modèle...
      </div>
    );
  }

  // Modèle non entraîné
  if (!metrics || metrics.status) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-amber-500">warning</span>
        <div>
          <p className="text-sm font-semibold text-amber-700">Modèle non entraîné</p>
          <p className="text-xs text-amber-600 font-mono mt-0.5">
            POST /optimizer/model/train · ou : python scripts/train_model.py
          </p>
        </div>
      </div>
    );
  }

  const gagnant    = metrics.gagnant || "XGBoost";
  const bestMae    = metrics.meilleur_mae;
  const modeles    = metrics.modeles || {};
  const gagnantMetrics = modeles[gagnant] || {};

  // Nombre de features issu des métriques ou valeur par défaut
  const nbFeatures = metrics.nb_features || 25;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">model_training</span>
          <div>
            <p className="font-brand font-bold text-navy text-sm">Modèle de prédiction</p>
            <p className="text-xs text-slate-400 font-mono">{gagnant} · {nbFeatures} features</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Prêt
        </div>
      </div>

      {/* Métriques principales */}
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {METRIC_ITEMS.map(({ key, label, unit, icon, desc }) => {
            const val = gagnantMetrics[key];
            if (val === undefined) return null;
            return (
              <div key={key} className="bg-blue-50/60 border border-blue-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-primary text-sm">{icon}</span>
                  <span className="text-xs text-slate-400 font-mono">{desc}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-bold text-navy text-xl">{val}</span>
                  {unit && <span className="text-xs text-slate-400 font-mono">{unit}</span>}
                </div>
                <p className="text-xs font-mono font-bold text-primary mt-0.5">{label}</p>
              </div>
            );
          })}
        </div>

        {/* Benchmark tous modèles */}
        {Object.keys(modeles).length > 1 && (
          <div>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
              Benchmark complet
            </p>
            <div className="space-y-1.5">
              {Object.entries(modeles).map(([nom, m]) => {
                const isWinner = nom === gagnant;
                const maxMae   = Math.max(...Object.values(modeles).map(x => x.MAE || 0)) || 1;
                return (
                  <div
                    key={nom}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${
                      isWinner
                        ? "bg-primary/5 border-primary/20"
                        : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    {isWinner && (
                      <span className="material-symbols-outlined text-primary text-sm">emoji_events</span>
                    )}
                    <span className={`font-medium flex-1 ${isWinner ? "text-navy font-bold" : "text-slate-500"}`}>
                      {nom}
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isWinner ? "bg-primary" : "bg-slate-300"}`}
                        style={{ width: `${100 - (m.MAE / maxMae) * 70}%` }}
                      />
                    </div>
                    <span className={`font-mono font-bold w-16 text-right ${isWinner ? "text-primary" : "text-slate-400"}`}>
                      {m.MAE} min
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-slate-300 text-center font-mono mt-3">
          Entraîné sur 1 500 transports synthétiques · Zone Nice 06
        </p>
      </div>
    </div>
  );
}
