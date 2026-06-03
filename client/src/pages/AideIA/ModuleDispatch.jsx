/**
 * BlancBleu — Aide IA · Module 1 : Smart Dispatch (recommandation véhicule).
 */
import { useState, useEffect, useMemo } from "react";
import { aiService, transportService } from "../../services/api";
import DurationBadge from "../../components/ai/DurationBadge";
import useDurationPredict from "../../hooks/useDurationPredict";
import { MOTIFS, MOBILITES, TYPES_VEHICULE, fmtApiError, buildDurationInput } from "./utils";

// ════════════════════════════════════════════════════════════════════════════
// MODULE 1 — DISPATCH IA
// ════════════════════════════════════════════════════════════════════════════
export default function ModuleDispatch() {
  const [transports, setTransports] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({
    motif: "",
    mobilite: "",
    oxygene: false,
    brancardage: false,
    adresseDepart: "",
    adresseDestination: "",
  });
  const [useManual, setUseManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    transportService
      .getAll({ limit: 100 })
      .then((res) => {
        const data = res?.data;
        const liste = data?.transports || data?.data || (Array.isArray(data) ? data : []);
        setTransports(liste);
        console.log("✅ Transports chargés :", liste.length);
      })
      .catch((err) => {
        console.error("❌ Erreur transports :", err.response?.status, err.message);
        setTransports([]);
      });
  }, []);

  const handleAnalyze = async () => {
    if (!useManual && !selectedId) {
      setError("Sélectionnez un transport dans la liste");
      return;
    }
    if (useManual && !form.mobilite) {
      setError("Sélectionnez la mobilité du patient");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const { data } =
        useManual && !selectedId
          ? await aiService.recommanderDispatchManuel(form)
          : await aiService.recommanderDispatch(selectedId);
      setResult(data);
    } catch (err) {
      setError(fmtApiError(err, "Erreur lors de l'analyse dispatch IA"));
    } finally {
      setLoading(false);
    }
  };

  const selectedTransport = transports.find((t) => String(t._id || t.id) === selectedId);

  // Prédiction durée XGBoost — silencieuse si microservice hors ligne
  const durationData = useMemo(
    () => buildDurationInput(selectedTransport),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTransport?._id],
  );
  const { loading: durationLoading, prediction: durationPrediction } = useDurationPredict(
    !useManual ? durationData : null,
  );

  return (
    <div className="grid grid-cols-2 gap-6 items-start">
      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-navy to-blue-900 px-6 py-4">
          <p className="font-mono text-xs text-blue-400 tracking-widest uppercase">
            Module 2 — Smart Dispatch
          </p>
          <h2 className="font-brand font-bold text-white text-base">Recommandation de véhicule</h2>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Sélection transport */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                Transport à dispatcher *
              </label>
              <button
                onClick={() => setUseManual(!useManual)}
                className="text-xs text-primary font-medium hover:underline"
              >
                {useManual ? "Choisir dans la liste" : "Saisie manuelle"}
              </button>
            </div>

            {!useManual ? (
              <select
                value={String(selectedId || "")}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-surface transition-all"
              >
                <option value="">Sélectionner un transport...</option>
                {transports.map((t) => (
                  <option key={String(t._id || t.id)} value={String(t._id || t.id)}>
                    {t.numero} — {t.patient?.nom} {t.patient?.prenom}
                    {" | "}
                    {t.motif}
                    {" | "}
                    {t.dateTransport ? new Date(t.dateTransport).toLocaleDateString("fr-FR") : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-4">
                <select
                  value={form.motif}
                  onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary bg-surface"
                >
                  <option value="">Motif du transport...</option>
                  {MOTIFS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Adresse de prise en charge"
                  value={form.adresseDepart}
                  onChange={(e) => setForm((f) => ({ ...f, adresseDepart: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary"
                />
                <input
                  type="text"
                  placeholder="Adresse de destination"
                  value={form.adresseDestination}
                  onChange={(e) => setForm((f) => ({ ...f, adresseDestination: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Aperçu transport sélectionné */}
          {selectedTransport && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1">
              <p className="font-mono font-bold text-navy text-sm">{selectedTransport.numero}</p>
              <p className="text-xs text-slate-600">
                Patient : {selectedTransport.patient?.nom} {selectedTransport.patient?.prenom}
              </p>
              <p className="text-xs text-slate-600">
                Motif : {selectedTransport.motif} · Mobilité :{" "}
                <strong>{selectedTransport.patient?.mobilite || "—"}</strong>
              </p>
              <p className="text-xs text-slate-500">
                {[selectedTransport.adresseDepart?.rue, selectedTransport.adresseDepart?.ville]
                  .filter(Boolean)
                  .join(", ") || "Non renseignée"}
                {" → "}
                {[
                  selectedTransport.adresseDestination?.nom ||
                    selectedTransport.adresseDestination?.rue,
                  selectedTransport.adresseDestination?.ville,
                ]
                  .filter(Boolean)
                  .join(", ") || "Non renseignée"}
              </p>
            </div>
          )}

          {/* Durée estimée XGBoost — sous l'aperçu transport */}
          {!useManual && selectedId && (
            <DurationBadge prediction={durationPrediction} loading={durationLoading} compact />
          )}

          {/* Mobilité (mode manuel) */}
          {useManual && (
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Mobilité du patient *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MOBILITES.map((m) => (
                  <button
                    key={m.v}
                    onClick={() => setForm((f) => ({ ...f, mobilite: m.v }))}
                    className={`py-3 px-3 rounded-xl border-2 text-xs font-semibold transition-all flex items-center gap-2 ${
                      form.mobilite === m.v
                        ? "border-primary bg-blue-50 text-primary"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{m.icon}</span>
                    <span>
                      {m.label}
                      <br />
                      <span className="font-normal opacity-70">→ {m.desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-4 mt-3">
                {[
                  { key: "oxygene", label: "Oxygène requis", icon: "air" },
                  { key: "brancardage", label: "Brancardage", icon: "transfer_within_a_station" },
                ].map(({ key, label, icon }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="material-symbols-outlined text-sm text-slate-400">{icon}</span>
                    <span className="text-xs text-slate-600">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading || (!selectedId && !useManual)}
            className="w-full py-4 bg-gradient-to-r from-primary to-navy text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyse dispatch en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">psychology</span>
                ANALYSER AVEC L'IA
              </>
            )}
          </button>
        </div>
      </div>

      {/* Résultat */}
      <div className="sticky top-24">
        {!result && !loading ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 min-h-96 flex flex-col items-center justify-center gap-4 text-slate-300 p-10">
            <span className="material-symbols-outlined text-7xl">local_shipping</span>
            <p className="font-brand font-semibold text-slate-400 text-lg text-center">
              Recommandation de véhicule
            </p>
            <p className="text-sm text-center text-slate-300">
              Sélectionnez un transport et cliquez sur analyser pour obtenir la meilleure
              affectation véhicule
            </p>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 min-h-96 flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 border-4 border-blue-100 border-t-primary rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-brand font-bold text-navy">Scoring en cours...</p>
              <p className="text-sm text-slate-400 mt-1">
                Évaluation compatibilité · Proximité · Fiabilité
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {["Compatibilité mobilité", "Proximité GPS", "Charge travail", "Fiabilité"].map(
                (s, i) => (
                  <span
                    key={i}
                    className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium animate-pulse"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  >
                    {s}
                  </span>
                ),
              )}
            </div>
          </div>
        ) : result ? (
          <DispatchResult result={result} />
        ) : null}
      </div>
    </div>
  );
}

function DispatchResult({ result }) {
  console.log("Réponse dispatch:", JSON.stringify(result, null, 2));

  const rec = result?.recommandation;
  if (!rec) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-8 text-center">
        <span className="material-symbols-outlined text-5xl text-amber-400">warning</span>
        <p className="font-brand font-bold text-navy mt-3">
          {result?.message || "Aucun véhicule compatible disponible"}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Vérifiez la disponibilité des véhicules ou modifiez les critères
        </p>
      </div>
    );
  }

  const typeInfo = TYPES_VEHICULE[rec.type] || {
    label: rec.type,
    color: "blue",
    icon: "directions_car",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5">
        <p className="text-emerald-100 text-xs font-mono uppercase tracking-wider mb-1">
          Véhicule recommandé par l'IA
        </p>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-3xl">local_shipping</span>
          <div>
            <p className="font-brand font-bold text-white text-2xl">{rec.immatriculation}</p>
            <p className="text-emerald-100 text-sm">
              {typeInfo.label}
              {rec.etaMinutes && ` · ETA ~${rec.etaMinutes} min`}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-mono font-bold text-white text-3xl">{rec.score}</p>
            <p className="text-emerald-100 text-xs">/ 100 pts</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Décomposition du score */}
        <div>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-3">
            Décomposition du score
          </p>
          <div className="space-y-2">
            {(() => {
              // Couvre les nommages camelCase (IA Python) et snake_case (fallback local)
              const sd = rec.scoreDetail ?? rec.scores_detail ?? rec.scoreDetails ?? {};
              const sousScores = [
                {
                  label: "Compatibilité mobilité",
                  max: 40,
                  val: sd.compatibiliteMobilite ?? sd.compatibilite_mobilite ?? sd.mobilite ?? null,
                },
                {
                  label: "Disponibilité",
                  max: 20,
                  val: sd.disponibilite ?? sd.availability_score ?? null,
                },
                {
                  label: "Proximité GPS",
                  max: 20,
                  val: sd.proximite ?? sd.proximite_gps ?? sd.proximity_score ?? null,
                },
                {
                  label: "Charge de travail",
                  max: 10,
                  val: sd.chargeTravail ?? sd.charge_travail ?? sd.workload_score ?? null,
                },
                {
                  label: "Fiabilité chauffeur",
                  max: 10,
                  val: sd.fiabilite ?? sd.fiabilite_chauffeur ?? sd.reliability_score ?? null,
                },
              ];

              // Si aucun sous-score n'est disponible, décomposer le score total proportionnellement
              const aucunDetail = sousScores.every((s) => s.val === null);
              if (aucunDetail && rec.score) {
                const total = rec.score;
                sousScores[0].val = Math.round(total * 0.4);
                sousScores[1].val = Math.round(total * 0.2);
                sousScores[2].val = Math.round(total * 0.2);
                sousScores[3].val = Math.round(total * 0.1);
                sousScores[4].val = Math.round(total * 0.1);
              }

              return sousScores.map(({ label, val, max }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-40 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full"
                      style={{ width: `${((val ?? 0) / max) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-bold text-navy w-12 text-right">
                    {val ?? 0}/{max}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Justification */}
        {rec.justification?.length > 0 && (
          <div>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
              Justification
            </p>
            <div className="space-y-1.5">
              {rec.justification.map((j, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                >
                  <span className="material-symbols-outlined text-primary text-sm mt-0.5">
                    check_circle
                  </span>
                  <span className="text-xs text-slate-700">{j}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alternatives */}
        {result.alternatives?.length > 0 && (
          <div>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
              Alternatives
            </p>
            <div className="space-y-2">
              {result.alternatives.map((alt, i) => (
                <div
                  key={alt.vehiculeId}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                    {i + 2}
                  </div>
                  <div className="flex-1">
                    <p className="font-mono font-bold text-navy text-sm">{alt.immatriculation}</p>
                    <p className="text-xs text-slate-400">
                      {TYPES_VEHICULE[alt.type]?.label || alt.type}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-sm text-slate-600">
                    {alt.score}/100
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-slate-300 text-center font-mono">
          Source : {result.source === "ia" ? "Microservice IA Python" : "Règles métier locales"}
        </p>
      </div>
    </div>
  );
}
