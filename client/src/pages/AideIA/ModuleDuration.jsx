/**
 * BlancBleu — Aide IA · Module 4 : Prédiction de durée (XGBoost).
 *
 * Exporte aussi DurationHonestyWrapper (panneau d'honnêteté du modèle) et
 * SectionPedagogique (bloc explicatif du scoring dispatch), consommés par
 * l'orchestrateur (index.jsx).
 */
import { useState, useEffect } from "react";
import { transportService } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import DurationBadge from "../../components/ai/DurationBadge";
import ModelMetricsCard from "../../components/ai/ModelMetricsCard";
import { ModelHonestyPanel } from "../../components/ai/ModelHonestyPanel";
import useDurationPredict from "../../hooks/useDurationPredict";
import {
  MOBILITES,
  TYPES_VEHICULE,
  normalizeMotif,
  motifToEtab,
  buildDurationInput,
} from "./utils";

// ════════════════════════════════════════════════════════════════════════════
// MODULE 4 — PRÉDICTION DE DURÉE (XGBoost)
// ════════════════════════════════════════════════════════════════════════════
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const TYPES_ETAB = [
  { v: "hopital_public", label: "Hôpital public" },
  { v: "clinique_privee", label: "Clinique privée" },
  { v: "centre_dialyse", label: "Centre de dialyse" },
  { v: "domicile", label: "Domicile" },
];
const MOTIFS_ML = ["Dialyse", "Chimiotherapie", "Consultation", "Hospitalisation"];

export default function ModuleDuration() {
  const [form, setForm] = useState({
    distance_km: 12.5,
    heure_depart: 8,
    jour_semaine: 0,
    mobilite: "ASSIS",
    type_vehicule: "VSL",
    type_etablissement: "hopital_public",
    motif: "Consultation",
    aller_retour: false,
    nb_patients: 1,
    experience_chauffeur: 0.7,
  });
  const [submitted, setSubmitted] = useState(false);
  const [inputForHook, setInputForHook] = useState(null);
  const [transports, setTransports] = useState([]);
  const [selectedTransportId, setSelectedTransportId] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const { loading, prediction } = useDurationPredict(inputForHook);

  useEffect(() => {
    transportService
      .getAll({ limit: 100 })
      .then((res) => {
        const data = res?.data;
        setTransports(data?.transports || data?.data || (Array.isArray(data) ? data : []));
      })
      .catch(() => setTransports([]));
  }, []);

  const set = (key, val) => {
    setAutoFilled(false);
    setForm((f) => ({ ...f, [key]: val }));
  };

  const handleTransportSelect = (id) => {
    setSelectedTransportId(id);
    if (!id) {
      setAutoFilled(false);
      return;
    }
    const t = transports.find((tr) => String(tr._id || tr.id) === id);
    if (!t) return;
    const base = buildDurationInput(t);
    const normalizedMotif = normalizeMotif(t.motif);
    setForm({
      ...base,
      type_etablissement: motifToEtab(normalizedMotif),
      motif: normalizedMotif,
      experience_chauffeur: 0.7,
    });
    setAutoFilled(true);
  };

  const handlePredict = () => {
    setSubmitted(true);
    setInputForHook({ ...form });
  };

  return (
    <div className="space-y-6">
      {/* En-tête module */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-4">
          <p className="font-mono text-xs text-indigo-200 tracking-widest uppercase">
            Module 4 — Duration Predictor
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <h2 className="font-brand font-bold text-white text-base">
              Prédiction de durée de transport
            </h2>
            {autoFilled && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-100 text-xs font-mono font-bold">
                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                Auto-rempli
              </span>
            )}
          </div>
          <p className="text-indigo-200 text-xs mt-0.5 font-mono">
            XGBoost · MAE 6.12 min · R² 0.974
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Sélecteur de transport réel */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
              Importer un transport réel (optionnel)
            </label>
            <select
              value={selectedTransportId}
              onChange={(e) => handleTransportSelect(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-surface transition-all"
            >
              <option value="">— Saisie manuelle —</option>
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
            {autoFilled && (
              <p className="text-xs text-emerald-600 font-mono mt-1.5">
                Champs pré-remplis · modifiez librement pour simuler des variantes.
              </p>
            )}
          </div>

          {/* Distance + Heure */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Distance (km) *
              </label>
              <input
                type="number"
                min={2}
                max={40}
                step={0.5}
                value={form.distance_km}
                onChange={(e) => set("distance_km", parseFloat(e.target.value) || 10)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Heure de départ *
              </label>
              <select
                value={form.heure_depart}
                onChange={(e) => set("heure_depart", parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                    {[7, 8, 9, 17, 18, 19].includes(h) ? " ⚡ pointe" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Jour + Mobilité */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Jour de la semaine
              </label>
              <select
                value={form.jour_semaine}
                onChange={(e) => set("jour_semaine", parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {JOURS.map((j, i) => (
                  <option key={i} value={i}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Mobilité patient
              </label>
              <select
                value={form.mobilite}
                onChange={(e) => set("mobilite", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {MOBILITES.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Véhicule + Établissement */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Type de véhicule
              </label>
              <select
                value={form.type_vehicule}
                onChange={(e) => set("type_vehicule", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {Object.keys(TYPES_VEHICULE).map((t) => (
                  <option key={t} value={t}>
                    {TYPES_VEHICULE[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Type d'établissement
              </label>
              <select
                value={form.type_etablissement}
                onChange={(e) => set("type_etablissement", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {TYPES_ETAB.map((e) => (
                  <option key={e.v} value={e.v}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Motif + Nb patients */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Motif
              </label>
              <select
                value={form.motif}
                onChange={(e) => set("motif", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {MOTIFS_ML.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Nb patients
              </label>
              <select
                value={form.nb_patients}
                onChange={(e) => set("nb_patients", parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.aller_retour}
                onChange={(e) => set("aller_retour", e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-slate-600">Aller-retour</span>
            </label>
            <div className="flex items-center gap-3 flex-1">
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                Expérience chauffeur
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={form.experience_chauffeur}
                onChange={(e) => set("experience_chauffeur", parseFloat(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs font-mono font-bold text-navy w-8">
                {Math.round(form.experience_chauffeur * 100)}%
              </span>
            </div>
          </div>

          <button
            onClick={handlePredict}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-300/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Prédiction XGBoost en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">timer</span>
                PRÉDIRE LA DURÉE
              </>
            )}
          </button>
        </div>
      </div>

      {/* Résultat */}
      {submitted &&
        (prediction ? (
          <DurationBadge prediction={prediction} loading={loading} />
        ) : !loading ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-500">cloud_off</span>
            <div>
              <p className="text-sm font-semibold text-amber-700">Microservice IA hors ligne</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Lancez le service Python :{" "}
                <code className="bg-amber-100 px-1 rounded">
                  cd ai-service && uvicorn main:app --port 5002
                </code>
              </p>
            </div>
          </div>
        ) : null)}

      {/* Métriques du modèle */}
      <ModelMetricsCard />
    </div>
  );
}

// Wrapper qui injecte isAdmin depuis l'AuthContext sans changer la signature
// des autres modules.
export function DurationHonestyWrapper() {
  const { user } = useAuth();
  return (
    <div className="mb-4">
      <ModelHonestyPanel isAdmin={user?.role === "admin"} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC PÉDAGOGIQUE — Comment l'IA choisit un véhicule ?
// ════════════════════════════════════════════════════════════════════════════

const POIDS = [
  {
    critere: "Distance véhicule → patient",
    poids: "25%",
    icon: "near_me",
    color: "blue",
    desc: "Plus le véhicule est proche, meilleur est le score. Score calculé par formule Haversine.",
  },
  {
    critere: "Disponibilité chauffeur",
    poids: "20%",
    icon: "person_check",
    color: "green",
    desc: "Chauffeur disponible → 100 pts. Chauffeur occupé → exclu ou score faible.",
  },
  {
    critere: "Compatibilité véhicule",
    poids: "20%",
    icon: "local_shipping",
    color: "purple",
    desc: "Correspondance exacte mobilité/type → 100 pts. Incompatible → candidat exclu.",
  },
  {
    critere: "Charge de planning",
    poids: "15%",
    icon: "event_available",
    color: "amber",
    desc: "Moins le véhicule est chargé, meilleur est le score. Évite de toujours sur-solliciter le même.",
  },
  {
    critere: "Estimation du trafic",
    poids: "10%",
    icon: "traffic",
    color: "orange",
    desc: "Heures de pointe (7h-9h, 17h-19h) → pénalité. Hors pointe → bonus.",
  },
  {
    critere: "Priorité médicale",
    poids: "5%",
    icon: "monitor_heart",
    color: "red",
    desc: "Transport prioritaire → favorise le véhicule le plus proche et le mieux équipé.",
  },
  {
    critere: "Historique ponctualité",
    poids: "5%",
    icon: "schedule",
    color: "teal",
    desc: "Ponctualité ≥ 95% → 100 pts. Retards fréquents → pénalité. Aucune donnée → score neutre (50).",
  },
];

export function SectionPedagogique() {
  return (
    <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="font-bold text-slate-800 text-base mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#1D6EF5]">school</span>
        Comment l'IA choisit-elle un véhicule ?
      </h2>
      <p className="text-sm text-slate-600 mb-5">
        L'algorithme évalue chaque couple véhicule/chauffeur selon 7 critères pondérés. Le score
        final sur 100 permet de classer les candidats.{" "}
        <strong>Le dispatcher conserve toujours la décision finale.</strong>
      </p>

      {/* Critères */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {POIDS.map(({ critere, poids, icon, desc }) => (
          <div
            key={critere}
            className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
          >
            <span className="material-symbols-outlined text-slate-500 text-xl flex-shrink-0 mt-0.5">
              {icon}
            </span>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-slate-800">{critere}</span>
                <span className="text-xs font-bold text-[#1D6EF5]">{poids}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Formule */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-sm font-mono mb-5">
        <p className="text-slate-400 text-xs mb-2">// Formule du score final :</p>
        <p>
          Score = (distance × <strong className="text-blue-400">0.25</strong>)
        </p>
        <p className="ml-8">
          + (disponibilité chauffeur × <strong className="text-green-400">0.20</strong>)
        </p>
        <p className="ml-8">
          + (compatibilité véhicule × <strong className="text-purple-400">0.20</strong>)
        </p>
        <p className="ml-8">
          + (charge planning × <strong className="text-amber-400">0.15</strong>)
        </p>
        <p className="ml-8">
          + (trafic estimé × <strong className="text-orange-400">0.10</strong>)
        </p>
        <p className="ml-8">
          + (priorité médicale × <strong className="text-red-400">0.05</strong>)
        </p>
        <p className="ml-8">
          + (ponctualité × <strong className="text-teal-400">0.05</strong>)
        </p>
        <p className="mt-2 text-slate-300">= Score final (0 → 100)</p>
      </div>

      {/* Règles d'exclusion */}
      <div className="mb-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
          Règles de compatibilité mobilité → véhicule
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="text-left p-2 text-slate-600">Mobilité patient</th>
                <th className="p-2 text-green-700">VSL</th>
                <th className="p-2 text-blue-700">TPMR</th>
                <th className="p-2 text-red-700">Ambulance</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["ASSIS", "100 (optimal)", "85", "60"],
                ["FAUTEUIL ROULANT", "Exclu (0)", "100 (optimal)", "50"],
                ["ALLONGÉ", "Exclu (0)", "Exclu (0)", "100 (obligatoire)"],
                ["CIVIÈRE", "Exclu (0)", "Exclu (0)", "100 (obligatoire)"],
              ].map(([mob, vsl, tpmr, amb]) => (
                <tr key={mob} className="border-b border-slate-100">
                  <td className="p-2 font-semibold text-slate-700">{mob}</td>
                  <td
                    className={`p-2 text-center ${vsl.includes("Exclu") ? "text-red-500" : "text-green-600"}`}
                  >
                    {vsl}
                  </td>
                  <td
                    className={`p-2 text-center ${tpmr.includes("Exclu") ? "text-red-500" : "text-blue-600"}`}
                  >
                    {tpmr}
                  </td>
                  <td
                    className={`p-2 text-center ${amb.includes("Exclu") ? "text-red-500" : "text-orange-600"}`}
                  >
                    {amb}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Limites */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <p className="font-semibold mb-1">Limites du modèle</p>
        <ul className="list-disc ml-4 space-y-0.5">
          <li>
            L'IA ne connaît pas les contraintes operationnelles non saisies (panne, embouteillage
            non signalé)
          </li>
          <li>
            La ponctualité historique se base uniquement sur les données saisies dans la plateforme
          </li>
          <li>
            L'estimation du trafic est basée sur l'heure théorique — pas de données temps réel
          </li>
          <li>La décision finale appartient toujours au dispatcher</li>
        </ul>
      </div>
    </div>
  );
}
