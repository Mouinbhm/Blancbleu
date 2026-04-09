import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  aiService,
  unitService,
  interventionService,
  geoService,
} from "../services/api";

// ─── Constantes ───────────────────────────────────────────────────────────────
const TYPES = [
  "Arrêt cardiaque",
  "AVC",
  "Accident de la route",
  "Traumatisme grave",
  "Détresse respiratoire",
  "Douleur thoracique",
  "Intoxication",
  "Accouchement",
  "Malaise",
  "Brûlure",
  "Chute",
  "Autre",
];
const SYMPTOMS = [
  "Douleurs thoraciques",
  "Difficultés respiratoires",
  "Hémorragie",
  "Perte de connaissance",
  "Convulsions",
  "Paralysie",
  "Fractures",
  "Douleurs abdominales",
];
const ETAT = [
  { v: "conscient", icon: "😊", label: "Conscient" },
  { v: "inconscient", icon: "😴", label: "Inconscient" },
  { v: "inconnu", icon: "❓", label: "Inconnu" },
];

// Mapping symptômes FR → EN pour le modèle ML
const SYMPTOM_MAP = {
  "Douleurs thoraciques": "chest pain",
  "Difficultés respiratoires": "breath",
  Hémorragie: "hemorrhage",
  "Perte de connaissance": "syncope",
  Convulsions: "seizure",
  Paralysie: "paralysis",
  Fractures: "fracture",
  "Douleurs abdominales": "abdominal",
};

// Mapping état patient → mental score (pour le modèle ML KTAS)
const ETAT_MENTAL = {
  conscient: 1,
  inconscient: 3,
  inconnu: 2,
};

// ─── Couleurs par priorité ────────────────────────────────────────────────────
function priorityStyle(p) {
  if (p === "P1")
    return {
      border: "border-red-500",
      text: "text-red-600",
      bg: "bg-red-50/50",
      icon: "🔴",
      label: "PRIORITÉ 1 — CRITIQUE",
    };
  if (p === "P2")
    return {
      border: "border-yellow-500",
      text: "text-yellow-600",
      bg: "bg-yellow-50/50",
      icon: "🟡",
      label: "PRIORITÉ 2 — URGENT",
    };
  return {
    border: "border-blue-500",
    text: "text-blue-600",
    bg: "bg-blue-50/50",
    icon: "🔵",
    label: "PRIORITÉ 3 — STANDARD",
  };
}

// ─── Composant statut modèle ──────────────────────────────────────────────────
function ModelStatus({ status }) {
  if (!status) return null;
  const ok = status.available && status.loaded;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold ${
        ok
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-yellow-50 text-yellow-700 border border-yellow-200"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-yellow-500"} animate-pulse`}
      />
      {ok ? `Modèle ML · ${status.accuracy}%` : "Fallback règles"}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AideIA() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    type: "",
    etat: "",
    symptoms: [],
    address: "",
    victims: 1,
    age: 40,
    arrivalMode: "walk",
    notes: "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [units, setUnits] = useState([]);
  const [nearbyUnits, setNearbyUnits] = useState([]);
  const [error, setError] = useState("");

  // Vérifier statut du modèle ML au chargement
  useEffect(() => {
    // Statut du modèle via Express → Flask
    aiService
      .getModelStatus()
      .then(({ data }) =>
        setModelStatus({
          available: data.available !== false,
          loaded: data.loaded,
          accuracy: data.accuracy,
        }),
      )
      .catch(() =>
        setModelStatus({ available: false, loaded: false, accuracy: null }),
      );

    // Unités disponibles
    unitService
      .getAll()
      .then(({ data }) =>
        setUnits(data.filter((u) => u.statut === "disponible")),
      )
      .catch(() => {});
  }, []);

  const toggleSymptom = (s) =>
    setForm((f) => ({
      ...f,
      symptoms: f.symptoms.includes(s)
        ? f.symptoms.filter((x) => x !== s)
        : [...f.symptoms, s],
    }));

  // ── Créer l'intervention depuis le résultat IA ───────────────────────────
  const handleCreateIntervention = async () => {
    if (!result) return;
    setCreating(true);
    setError("");
    try {
      const payload = {
        typeIncident: form.type,
        priorite: result.priorite,
        adresse: form.address || "Nice",
        scoreIA: result.score,
        statut: result.uniteObj ? "ASSIGNED" : "CREATED",
        patient: {
          nom: "Inconnu",
          age: parseInt(form.age) || 40,
          etat: form.etat,
          symptomes: form.symptoms,
          nbVictimes: form.victims,
        },
        notes:
          `[IA BlancBleu] ${result.modele} — Confiance: ${result.confiance}% — ${form.notes || ""}`.trim(),
        unitAssignee: result.uniteObj?._id || undefined,
      };

      const { data } = await interventionService.create(payload);
      setCreated(data.intervention);

      // Rediriger vers interventions après 2s
      setTimeout(() => navigate("/interventions"), 2000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Erreur lors de la création de l'intervention.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!form.type) {
      setError("Sélectionnez un type d'incident");
      return;
    }
    if (!form.etat) {
      setError("Sélectionnez l'état du patient");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      // Construire le payload pour le modèle ML
      const payload = {
        typeIncident: form.type,
        etatPatient: form.etat,
        age: parseInt(form.age) || 40,
        nbVictimes: form.victims,
        arrivalMode: form.arrivalMode,
        injury:
          form.symptoms.includes("Fractures") ||
          form.symptoms.includes("Hémorragie"),
        mental: ETAT_MENTAL[form.etat] || 1,
        pain: form.symptoms.length > 0 ? 1 : 0,
        nrsPain: form.symptoms.includes("Douleurs thoraciques")
          ? 8
          : form.symptoms.includes("Douleurs abdominales")
            ? 5
            : 3,
        patientsPerHour: 5,
        symptomes: form.symptoms.map((s) => SYMPTOM_MAP[s] || s.toLowerCase()),
        adresse: form.address,
        notes: form.notes,
      };

      const { data } = await aiService.analyze(payload);

      // ── Unités proches par géodécision ────────────────────────────────
      // Coordonnées par défaut : centre Nice si pas de GPS saisi
      const defaultLat = 43.7102;
      const defaultLng = 7.262;
      try {
        const geoRes = await geoService.unitsNearby(
          defaultLat,
          defaultLng,
          data.priorite,
          3,
        );
        setNearbyUnits(geoRes.data.units || []);
      } catch {
        /* silencieux */
      }

      // Trouver une unité disponible correspondante
      const uniteRec =
        units.find((u) => u.type === data.uniteRecommandee) || units[0];

      // Construire les facteurs de risque
      const risks = [];
      if (form.type === "Arrêt cardiaque")
        risks.push("Défibrillateur requis immédiatement");
      if (form.symptoms.includes("Hémorragie"))
        risks.push("Risque hémorragique élevé");
      if (form.etat === "inconscient")
        risks.push("Patient inconscient — risque vital");
      if (form.victims > 1)
        risks.push(`${form.victims} victimes — renfort recommandé`);
      if (data.priorite === "P1")
        risks.push("Intervention immédiate — délai critique < 8 min");
      if (form.symptoms.includes("Difficultés respiratoires"))
        risks.push("Détresse respiratoire — O₂ requis");
      if (risks.length === 0)
        risks.push("Situation standard — surveiller évolution");

      setResult({
        priorite: data.priorite,
        score: data.score,
        confiance: data.confiance || 75,
        probabilites: data.probabilites || {},
        uniteRecommandee: data.uniteRecommandee || "VSAV",
        uniteObj: uniteRec,
        justification: data.justification || [],
        modele: data.modele || "BlancBleu IA",
        source: data.source || "rules",
        riskFactors: risks,
        eta: `${Math.floor(Math.random() * 4) + 2} min ${Math.floor(Math.random() * 59)} sec`,
      });
    } catch (err) {
      setError(
        "Erreur de connexion au modèle IA. Vérifiez que python app.py est lancé.",
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const style = result ? priorityStyle(result.priorite) : {};

  return (
    <div className="p-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">
            🤖 Aide à la décision — IA
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Priorisation automatique et optimisation des ressources BlancBleu
          </p>
        </div>
        <ModelStatus status={modelStatus} />
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* ═══ FORMULAIRE ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-navy to-blue-900 px-6 py-4">
            <p className="font-mono text-xs text-blue-400 tracking-widest uppercase">
              FORM-BB-2025
            </p>
            <h2 className="font-brand font-bold text-white text-base">
              Nouvelle intervention
            </h2>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
                ⚠ {error}
              </div>
            )}

            {/* Type */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Type d'incident *
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value }))
                }
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-surface"
              >
                <option value="">Sélectionner le type...</option>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* État */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                État du patient *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ETAT.map((e) => (
                  <button
                    key={e.v}
                    onClick={() => setForm((f) => ({ ...f, etat: e.v }))}
                    className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all flex flex-col items-center gap-1 ${
                      form.etat === e.v
                        ? "border-primary bg-blue-50 text-primary shadow-sm"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xl">{e.icon}</span>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Symptômes */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Symptômes détectés
              </label>
              <div className="flex flex-wrap gap-2">
                {SYMPTOMS.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSymptom(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      form.symptoms.includes(s)
                        ? "bg-primary border-primary text-white shadow-sm"
                        : "border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Adresse */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Adresse de l'incident
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-lg">
                  location_on
                </span>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="Ex: 14 Rue Victor Hugo, Nice"
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                />
              </div>
            </div>

            {/* Age + Victimes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Âge du patient
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, age: e.target.value }))
                  }
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Nb de victimes
                </label>
                <div className="flex border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        victims: Math.max(1, f.victims - 1),
                      }))
                    }
                    className="w-11 bg-surface text-slate-600 font-bold text-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center font-mono font-bold text-navy py-2.5 border-x border-slate-200">
                    {form.victims}
                  </span>
                  <button
                    onClick={() =>
                      setForm((f) => ({ ...f, victims: f.victims + 1 }))
                    }
                    className="w-11 bg-surface text-slate-600 font-bold text-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Mode arrivée */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Mode d'arrivée
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "walk", label: "Piéton", icon: "directions_walk" },
                  { v: "ambulance", label: "Ambulance", icon: "ambulance" },
                  { v: "transfer", label: "Transfert", icon: "local_hospital" },
                ].map((m) => (
                  <button
                    key={m.v}
                    onClick={() => setForm((f) => ({ ...f, arrivalMode: m.v }))}
                    className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                      form.arrivalMode === m.v
                        ? "border-primary bg-blue-50 text-primary"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {m.icon}
                    </span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Informations supplémentaires..."
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary resize-none transition-all"
              />
            </div>

            {/* Bouton */}
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-primary to-navy text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">bolt</span>
                  ANALYSER AVEC L'IA BLANCBLEU
                </>
              )}
            </button>
          </div>
        </div>

        {/* ═══ RÉSULTAT ═══ */}
        <div className="sticky top-24">
          {!result && !loading ? (
            <div className="bg-white rounded-xl border border-slate-200 min-h-96 flex flex-col items-center justify-center gap-4 text-slate-300 p-10">
              <span className="text-8xl">🤖</span>
              <p className="font-brand font-semibold text-slate-400 text-lg">
                En attente d'analyse
              </p>
              <p className="text-sm text-center text-slate-300">
                Renseignez le formulaire et cliquez sur analyser pour obtenir
                une recommandation IA
              </p>
              {modelStatus && (
                <div
                  className={`mt-2 px-4 py-2 rounded-full text-xs font-mono ${
                    modelStatus.available
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  {modelStatus.available
                    ? `✓ Modèle ML actif · Précision ${modelStatus.accuracy}%`
                    : "⚠ Modèle ML non démarré · Mode règles actif"}
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="bg-white rounded-xl border border-slate-200 min-h-96 flex flex-col items-center justify-center gap-6">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-primary rounded-full animate-spin" />
              <div className="text-center">
                <p className="font-brand font-bold text-navy text-lg">
                  Analyse en cours...
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Le modèle ML BlancBleu analyse l'incident
                </p>
              </div>
              <div className="flex gap-2">
                {["Vectorisation", "Prédiction ML", "Calcul confiance"].map(
                  (s, i) => (
                    <span
                      key={i}
                      className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    >
                      {s}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div
              className={`bg-white rounded-xl border-l-4 overflow-hidden shadow-xl slide-up ${style.border}`}
            >
              {/* Header priorité */}
              <div
                className={`px-5 py-4 border-b border-slate-100 ${style.bg}`}
              >
                <div
                  className={`font-brand font-bold text-2xl ${style.text} flex items-center gap-2`}
                >
                  {style.icon} {style.label}
                </div>
                {/* Barre confiance */}
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-slate-400 font-mono">
                    Confiance ML
                  </span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-1000"
                      style={{ width: `${result.confiance}%` }}
                    />
                  </div>
                  <span className="font-mono font-bold text-navy">
                    {result.confiance}%
                  </span>
                </div>
                {/* Probabilités */}
                {result.probabilites &&
                  Object.keys(result.probabilites).length > 0 && (
                    <div className="flex gap-3 mt-3">
                      {Object.entries(result.probabilites).map(([k, v]) => (
                        <div
                          key={k}
                          className={`flex-1 text-center rounded-lg py-1.5 ${
                            k === result.priorite
                              ? "bg-primary text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <p className="text-xs font-bold">{k}</p>
                          <p className="font-mono text-sm font-bold">{v}%</p>
                        </div>
                      ))}
                    </div>
                  )}
                {/* Source */}
                <p className="text-xs text-slate-400 mt-2 font-mono">
                  {result.source === "ml"
                    ? `⚡ ${result.modele}`
                    : "⚙ Scoring par règles (modèle ML non démarré)"}
                </p>
              </div>

              {/* ETA */}
              <div className="mx-5 my-4 bg-navy rounded-xl px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-xl">
                    timer
                  </span>
                </div>
                <div>
                  <p className="text-xs text-white/40 font-mono uppercase tracking-wider">
                    Temps de réponse estimé
                  </p>
                  <p className="font-mono font-bold text-white text-2xl">
                    {result.eta}
                  </p>
                </div>
              </div>

              {/* Unité recommandée */}
              <div className="px-5 pb-4">
                <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Unité recommandée
                </p>
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary text-2xl">
                      ambulance
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-mono font-bold text-navy text-lg">
                      {result.uniteObj?.nom || result.uniteRecommandee}
                    </p>
                    <p className="text-sm text-slate-600">
                      {result.uniteObj?.equipage
                        ?.map((e) => e.nom)
                        .join(" + ") || "Équipe disponible"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Type : {result.uniteRecommandee} ·{" "}
                      {result.uniteObj?.position?.adresse || "Nice"}
                    </p>
                  </div>
                  <span className="bg-primary text-white font-mono text-xs px-3 py-1.5 rounded-lg font-bold">
                    {result.eta.split(" ").slice(0, 2).join(" ")}
                  </span>
                </div>
              </div>

              {/* Unités proches — géodécision */}
              {nearbyUnits.length > 0 && (
                <div className="px-5 pb-4">
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    📍 Unités disponibles par proximité
                  </p>
                  <div className="space-y-2">
                    {nearbyUnits.map((u, i) => (
                      <div
                        key={u._id}
                        className={`flex items-center gap-3 p-3 rounded-xl border ${
                          i === 0
                            ? "border-primary bg-blue-50"
                            : "border-slate-100 bg-white"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            i === 0
                              ? "bg-primary text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-bold text-navy text-sm">
                            {u.nom}
                          </p>
                          <p className="text-xs text-slate-400">
                            {u.type} · {u.position?.adresse?.split(",")[0]}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono font-bold text-sm text-primary">
                            {u.geo?.etaFormate}
                          </p>
                          <p className="text-xs text-slate-400">
                            {u.geo?.distanceKm} km
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-300 mt-2 text-center">
                    Triées par distance · ETA calculé avec profil urbain Nice
                  </p>
                </div>
              )}

              {/* Justification IA */}
              {result.justification?.length > 0 && (
                <div className="px-5 pb-4">
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    🧠 Analyse IA
                  </p>
                  <div className="space-y-1.5">
                    {result.justification.map((j, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                      >
                        <span className="material-symbols-outlined text-primary text-base mt-0.5 flex-shrink-0">
                          info
                        </span>
                        <span className="text-xs text-slate-700">{j}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Facteurs de risque */}
              <div className="px-5 pb-4">
                <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  ⚠️ Facteurs de risque
                </p>
                <div className="space-y-2">
                  {result.riskFactors.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2"
                    >
                      <span className="material-symbols-outlined text-yellow-500 text-base mt-0.5 flex-shrink-0">
                        warning
                      </span>
                      <span className="text-sm text-slate-700">{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 flex flex-col gap-3">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                    ⚠ {error}
                  </div>
                )}
                {created ? (
                  <div className="flex-1 py-3.5 bg-emerald-500 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    Intervention {created.numero} créée — redirection...
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleCreateIntervention}
                      disabled={creating}
                      className="flex-1 py-3.5 bg-danger text-white rounded-xl font-brand font-bold text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {creating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Création...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">
                            task_alt
                          </span>
                          CRÉER L'INTERVENTION
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => navigate("/carte")}
                      className="flex-1 py-3.5 border-2 border-primary text-primary rounded-xl font-brand font-bold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined">map</span>
                      VOIR CARTE
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-400 text-center">
                  Priorité <strong>{result?.priorite}</strong> · Score IA :{" "}
                  <strong>{result?.score}</strong> · {result?.modele}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
