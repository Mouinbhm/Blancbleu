/**
 * BlancBleu — Page Aide IA v4.0
 * Transport sanitaire NON urgent
 *
 * 3 modules :
 *   1. Dispatch IA     — recommandation véhicule pour un transport
 *   2. Extraction PMT  — OCR Prescription Médicale de Transport
 *   3. Optimisation    — tournée journalière OR-Tools
 */
import { useState, useEffect, useRef } from "react";
import { aiService, transportService } from "../services/api";

// ── Constantes métier ─────────────────────────────────────────────────────────
const MOTIFS = [
  "Dialyse",
  "Chimiothérapie",
  "Radiothérapie",
  "Consultation",
  "Hospitalisation",
  "Sortie hospitalisation",
  "Rééducation",
  "Analyse",
  "Autre",
];

const MOBILITES = [
  { v: "ASSIS", label: "Assis", icon: "accessible_forward", color: "emerald", desc: "VSL" },
  { v: "FAUTEUIL_ROULANT", label: "Fauteuil roulant", icon: "wheelchair_pickup", color: "blue", desc: "TPMR" },
  { v: "ALLONGE", label: "Allongé", icon: "airline_seat_flat", color: "orange", desc: "Ambulance" },
  { v: "CIVIERE", label: "Civière", icon: "emergency", color: "red", desc: "Ambulance" },
];

const TYPES_VEHICULE = {
  VSL: { label: "VSL", color: "emerald", icon: "directions_car" },
  TPMR: { label: "TPMR", color: "blue", icon: "accessible" },
  AMBULANCE: { label: "Ambulance", color: "red", icon: "local_shipping" },
};

// ── Composants utilitaires ────────────────────────────────────────────────────

function ServiceBadge({ status }) {
  if (!status) return null;
  const ok = status.available;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold border ${
        ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
    >
      <span className={`w-2 h-2 rounded-full animate-pulse ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      {ok ? "Service IA actif" : "Mode règles locales"}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-all ${
        active
          ? "bg-primary text-white shadow-md shadow-primary/30"
          : "text-slate-500 hover:text-navy hover:bg-slate-100"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}

function ConfidenceBadge({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "emerald" : pct >= 50 ? "amber" : "red";
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-${color}-50 text-${color}-700 border border-${color}-200`}>
      <span className={`w-2 h-2 rounded-full bg-${color}-500`} />
      Confiance : {pct}%
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODULE 1 — DISPATCH IA
// ════════════════════════════════════════════════════════════════════════════
function ModuleDispatch() {
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
        const liste =
          data?.transports ||
          data?.data ||
          (Array.isArray(data) ? data : []);
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
      const { data } = useManual && !selectedId
        ? await aiService.recommanderDispatchManuel(form)
        : await aiService.recommanderDispatch(selectedId);
      setResult(data);
    } catch (err) {
      setError(
        err.response?.data?.message || "Erreur lors de l'analyse dispatch IA"
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedTransport = transports.find((t) => String(t._id || t.id) === selectedId);

  return (
    <div className="grid grid-cols-2 gap-6 items-start">
      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-navy to-blue-900 px-6 py-4">
          <p className="font-mono text-xs text-blue-400 tracking-widest uppercase">
            Module 2 — Smart Dispatch
          </p>
          <h2 className="font-brand font-bold text-white text-base">
            Recommandation de véhicule
          </h2>
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
                    {" | "}{t.motif}
                    {" | "}{t.dateTransport ? new Date(t.dateTransport).toLocaleDateString("fr-FR") : ""}
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
                  {MOTIFS.map((m) => <option key={m}>{m}</option>)}
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
              <p className="font-mono font-bold text-navy text-sm">
                {selectedTransport.numero}
              </p>
              <p className="text-xs text-slate-600">
                Patient : {selectedTransport.patient?.nom}{" "}
                {selectedTransport.patient?.prenom}
              </p>
              <p className="text-xs text-slate-600">
                Motif : {selectedTransport.motif} · Mobilité :{" "}
                <strong>{selectedTransport.patient?.mobilite || "—"}</strong>
              </p>
              <p className="text-xs text-slate-500">
                {[
                  selectedTransport.adresseDepart?.rue,
                  selectedTransport.adresseDepart?.ville,
                ].filter(Boolean).join(", ") || "Non renseignée"}
                {" → "}
                {[
                  selectedTransport.adresseDestination?.nom || selectedTransport.adresseDestination?.rue,
                  selectedTransport.adresseDestination?.ville,
                ].filter(Boolean).join(", ") || "Non renseignée"}
              </p>
            </div>
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
              Sélectionnez un transport et cliquez sur analyser pour obtenir
              la meilleure affectation véhicule
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
              {["Compatibilité mobilité", "Proximité GPS", "Charge travail", "Fiabilité"].map((s, i) => (
                <span
                  key={i}
                  className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  {s}
                </span>
              ))}
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

  const typeInfo = TYPES_VEHICULE[rec.type] || { label: rec.type, color: "blue", icon: "directions_car" };

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
            <p className="font-brand font-bold text-white text-2xl">
              {rec.immatriculation}
            </p>
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
                  val: sd.compatibiliteMobilite
                    ?? sd.compatibilite_mobilite
                    ?? sd.mobilite
                    ?? null,
                },
                {
                  label: "Disponibilité",
                  max: 20,
                  val: sd.disponibilite
                    ?? sd.availability_score
                    ?? null,
                },
                {
                  label: "Proximité GPS",
                  max: 20,
                  val: sd.proximite
                    ?? sd.proximite_gps
                    ?? sd.proximity_score
                    ?? null,
                },
                {
                  label: "Charge de travail",
                  max: 10,
                  val: sd.chargeTravail
                    ?? sd.charge_travail
                    ?? sd.workload_score
                    ?? null,
                },
                {
                  label: "Fiabilité chauffeur",
                  max: 10,
                  val: sd.fiabilite
                    ?? sd.fiabilite_chauffeur
                    ?? sd.reliability_score
                    ?? null,
                },
              ];

              // Si aucun sous-score n'est disponible, décomposer le score total proportionnellement
              const aucunDetail = sousScores.every((s) => s.val === null);
              if (aucunDetail && rec.score) {
                const total = rec.score;
                sousScores[0].val = Math.round(total * 0.40);
                sousScores[1].val = Math.round(total * 0.20);
                sousScores[2].val = Math.round(total * 0.20);
                sousScores[3].val = Math.round(total * 0.10);
                sousScores[4].val = Math.round(total * 0.10);
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
                <div key={i} className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-primary text-sm mt-0.5">check_circle</span>
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
                <div key={alt.vehiculeId} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                    {i + 2}
                  </div>
                  <div className="flex-1">
                    <p className="font-mono font-bold text-navy text-sm">{alt.immatriculation}</p>
                    <p className="text-xs text-slate-400">{TYPES_VEHICULE[alt.type]?.label || alt.type}</p>
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

// ════════════════════════════════════════════════════════════════════════════
// MODULE 2 — EXTRACTION PMT
// ════════════════════════════════════════════════════════════════════════════
function ModulePMT({ aiStatus }) {
  const [file, setFile] = useState(null);
  const [transportId, setTransportId] = useState("");
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  useEffect(() => {
    transportService
      .getAll({ limit: 100 })
      .then((res) => {
        const data = res?.data;
        const liste =
          data?.transports ||
          data?.data ||
          (Array.isArray(data) ? data : []);
        setTransports(liste);
        console.log("✅ Transports chargés :", liste.length);
      })
      .catch((err) => {
        console.error("❌ Erreur transports :", err.response?.status, err.message);
        setTransports([]);
      });
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleExtract = async () => {
    if (!file) {
      setError("Sélectionnez un fichier PMT (PDF ou image)");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    setValidated(false);
    try {
      const formData = new FormData();
      formData.append("pmt", file);
      if (transportId) formData.append("transportId", String(transportId));
      const { data } = await aiService.extrairePMT(formData);
      setResult(data);
    } catch (err) {
      if (err.response?.status === 503) {
        setError("Service OCR indisponible. Assurez-vous que le microservice Python est démarré et que Tesseract est installé.");
      } else {
        setError(err.response?.data?.detail || err.response?.data?.message || "Erreur d'extraction PMT");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!transportId || !result) return;
    setValidating(true);
    try {
      await aiService.validerPMT(transportId, result.extraction);
      setValidated(true);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur de validation");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6 items-start">
      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-4">
          <p className="font-mono text-xs text-violet-300 tracking-widest uppercase">
            Module 1 — PMT Extraction
          </p>
          <h2 className="font-brand font-bold text-white text-base">
            Prescription Médicale de Transport
          </h2>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Transport associé */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
              Transport associé (optionnel)
            </label>
            <select
              value={String(transportId || "")}
              onChange={(e) => setTransportId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
            >
              <option value="">Lier à un transport...</option>
              {transports.map((t) => (
                <option key={String(t._id || t.id)} value={String(t._id || t.id)}>
                  {t.numero} — {t.patient?.nom} {t.patient?.prenom}
                  {" | "}{t.motif}
                  {" | "}{t.dateTransport ? new Date(t.dateTransport).toLocaleDateString("fr-FR") : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Zone de dépôt fichier */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              file
                ? "border-violet-400 bg-violet-50"
                : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file ? (
              <div className="space-y-2">
                <span className="material-symbols-outlined text-4xl text-violet-500">
                  {file.type === "application/pdf" ? "picture_as_pdf" : "image"}
                </span>
                <p className="font-semibold text-navy text-sm">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(0)} Ko · {file.type}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="text-xs text-red-400 hover:text-red-600 underline"
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="material-symbols-outlined text-5xl text-slate-300">upload_file</span>
                <p className="font-semibold text-slate-500">
                  Déposez la PMT ici ou cliquez
                </p>
                <p className="text-xs text-slate-300">PDF, JPEG, PNG, TIFF — max 10 Mo</p>
              </div>
            )}
          </div>

          {/* Info service */}
          {!aiStatus?.available && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              <strong>Service IA non démarré.</strong> Lancez le microservice Python :{" "}
              <code className="bg-amber-100 px-1 rounded">cd ai-service && setup_et_lancer.bat</code>
            </div>
          )}

          {/* Info Tesseract */}
          {aiStatus?.available && !aiStatus?.modules?.pmt_ocr && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              <strong>Tesseract OCR non détecté.</strong> Installez-le depuis{" "}
              <a
                href="https://github.com/UB-Mannheim/tesseract/wiki"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                UB-Mannheim/tesseract
              </a>{" "}
              et ajoutez-le au PATH.
            </div>
          )}

          <button
            onClick={handleExtract}
            disabled={loading || !file}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                OCR en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">document_scanner</span>
                EXTRAIRE LA PMT
              </>
            )}
          </button>
        </div>
      </div>

      {/* Résultat */}
      <div className="sticky top-24">
        {!result && !loading ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 min-h-96 flex flex-col items-center justify-center gap-4 text-slate-300 p-10">
            <span className="material-symbols-outlined text-7xl">clinical_notes</span>
            <p className="font-brand font-semibold text-slate-400 text-lg text-center">
              Données extraites de la PMT
            </p>
            <p className="text-sm text-center text-slate-300">
              Téléversez une Prescription Médicale de Transport (PDF ou image)
              pour extraire automatiquement les informations patient
            </p>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 min-h-96 flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-brand font-bold text-navy">OCR en cours...</p>
              <p className="text-sm text-slate-400 mt-1">Tesseract analyse le document</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {["Conversion", "OCR Tesseract", "Regex extraction", "NER spaCy", "Score confiance"].map((s, i) => (
                <span
                  key={i}
                  className="text-xs bg-violet-50 text-violet-600 px-2 py-1 rounded-full font-medium animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : result ? (
          <PMTResult
            result={result}
            onValidate={handleValidate}
            validating={validating}
            validated={validated}
            hasTransport={!!transportId}
          />
        ) : null}
      </div>
    </div>
  );
}

function PMTResult({ result, onValidate, validating, validated, hasTransport }) {
  const confPct = Math.round(result.confiance * 100);
  const confColor = confPct >= 75 ? "emerald" : confPct >= 50 ? "amber" : "red";
  const ext = result.extraction;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
      {/* Header confiance */}
      <div className={`px-6 py-4 bg-${confColor}-50 border-b border-${confColor}-100`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`font-brand font-bold text-${confColor}-700 text-lg`}>
            {result.validationRequise
              ? "Validation humaine requise"
              : "Extraction réussie"}
          </p>
          <ConfidenceBadge value={result.confiance} />
        </div>
        <div className="h-2 bg-white/50 rounded-full overflow-hidden">
          <div
            className={`h-full bg-${confColor}-500 rounded-full transition-all duration-1000`}
            style={{ width: `${confPct}%` }}
          />
        </div>

        {result.champsManquants?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.champsManquants.map((c) => (
              <span key={c} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                Manquant : {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Données extraites */}
      <div className="p-5 space-y-4">
        {/* Patient */}
        <Section title="Patient" icon="person">
          <Row label="Nom" val={ext.patient?.nom} />
          <Row label="Prénom" val={ext.patient?.prenom} />
          <Row label="Date naissance" val={ext.patient?.dateNaissance} />
        </Section>

        {/* Médecin */}
        <Section title="Médecin prescripteur" icon="stethoscope">
          <Row label="Nom" val={ext.medecin?.nom} />
          <Row label="RPPS" val={ext.medecin?.rpps} mono />
          <Row label="Date prescription" val={ext.datePrescription} />
        </Section>

        {/* Transport */}
        <Section title="Transport prescrit" icon="local_shipping">
          <Row
            label="Type autorisé"
            val={ext.typeTransportAutorise}
            highlight
          />
          <Row
            label="Mobilité"
            val={ext.mobilite?.replace("_", " ")}
            highlight
          />
          <Row label="Destination" val={ext.destination} />
          <Row
            label="Aller-retour"
            val={ext.allerRetour === true ? "Oui" : ext.allerRetour === false ? "Non" : null}
          />
          <Row label="Fréquence" val={ext.frequence} />
          <Row label="Motif" val={ext.motif} />
        </Section>

        {/* Besoins spéciaux */}
        {(ext.oxygene || ext.brancardage) && (
          <div className="flex gap-3">
            {ext.oxygene && (
              <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-3 py-1.5 rounded-full border border-blue-100 font-medium">
                <span className="material-symbols-outlined text-sm">air</span>
                Oxygène requis
              </span>
            )}
            {ext.brancardage && (
              <span className="flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-3 py-1.5 rounded-full border border-orange-100 font-medium">
                <span className="material-symbols-outlined text-sm">transfer_within_a_station</span>
                Brancardage requis
              </span>
            )}
          </div>
        )}

        {/* Remarques */}
        {ext.remarques && (
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 border border-slate-100">
            <p className="font-mono text-slate-400 mb-1">REMARQUES</p>
            {ext.remarques}
          </div>
        )}

        {/* Validation */}
        {validated ? (
          <div className="py-3.5 bg-emerald-500 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">check_circle</span>
            PMT validée et enregistrée
          </div>
        ) : (
          <button
            onClick={onValidate}
            disabled={!hasTransport || validating}
            className={`w-full py-3.5 rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              hasTransport
                ? "bg-violet-600 text-white hover:bg-violet-700 hover:shadow-lg"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {validating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Validation...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">verified</span>
                {hasTransport ? "VALIDER ET ASSOCIER AU TRANSPORT" : "Sélectionnez un transport pour valider"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-slate-400 text-sm">{icon}</span>
        <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      </div>
      <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-100">
        {children}
      </div>
    </div>
  );
}

function Row({ label, val, highlight, mono }) {
  if (!val) return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-300 italic">Non détecté</span>
    </div>
  );
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? "text-primary" : "text-navy"} ${mono ? "font-mono" : ""}`}>
        {val}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODULE 3 — OPTIMISATION TOURNÉE
// ════════════════════════════════════════════════════════════════════════════
function ModuleRouting({ aiStatus }) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [depot, setDepot] = useState("43.7102,7.2620");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleOptimize = async () => {
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const [lat, lng] = depot.split(",").map(Number);
      const { data } = await aiService.optimiserTournee({
        date,
        depot: { lat: lat || 43.7102, lng: lng || 7.262 },
      });
      setResult(data);
    } catch (err) {
      if (err.response?.status === 503) {
        setError("Service d'optimisation non disponible. Vérifiez que le microservice IA Python est démarré.");
      } else {
        setError(err.response?.data?.message || err.response?.data?.detail || "Erreur d'optimisation");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-cyan-700 px-6 py-4">
          <p className="font-mono text-xs text-teal-200 tracking-widest uppercase">
            Module 3 — Route Optimization
          </p>
          <h2 className="font-brand font-bold text-white text-base">
            Optimisation de tournée — OR-Tools VRP
          </h2>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600 mb-4">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Date de la tournée *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Position dépôt (lat,lng)
              </label>
              <input
                type="text"
                value={depot}
                onChange={(e) => setDepot(e.target.value)}
                placeholder="43.7102,7.2620"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-5 text-xs text-teal-700 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">info</span>
              Comment ça fonctionne
            </p>
            <p>L'algorithme Google OR-Tools récupère tous les transports planifiés pour la date sélectionnée (statuts CONFIRMED et SCHEDULED) et optimise leur répartition sur les véhicules disponibles pour minimiser la distance totale parcourue.</p>
          </div>

          {!aiStatus?.available && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 mb-4">
              <strong>Service IA non démarré.</strong> L'optimisation OR-Tools nécessite le microservice Python. Lancez :{" "}
              <code className="bg-amber-100 px-1 rounded">cd ai-service && setup_et_lancer.bat</code>
            </div>
          )}

          <button
            onClick={handleOptimize}
            disabled={loading || !date}
            className="w-full py-4 bg-gradient-to-r from-teal-600 to-cyan-700 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Optimisation OR-Tools en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">route</span>
                OPTIMISER LES TOURNÉES
              </>
            )}
          </button>
        </div>
      </div>

      {/* Résultats */}
      {result && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Transports", val: result.nbTransports, icon: "directions_car" },
              { label: "Véhicules", val: result.nbVehicules, icon: "local_shipping" },
              { label: "Distance totale", val: `${result.distanceTotale} km`, icon: "route" },
              { label: "Durée max", val: `${result.dureeMaxMinutes} min`, icon: "timer" },
            ].map(({ label, val, icon }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <span className="material-symbols-outlined text-teal-500 text-2xl">{icon}</span>
                <p className="font-mono font-bold text-navy text-xl mt-1">{val}</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Statut */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold w-fit ${
            result.statut === "OPTIMAL"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : result.statut === "FEASIBLE"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            <span className="material-symbols-outlined text-sm">
              {result.statut === "OPTIMAL" ? "check_circle" : result.statut === "FEASIBLE" ? "info" : "error"}
            </span>
            {result.statut} — {result.messageOptimiseur}
          </div>

          {/* Tournées par véhicule */}
          <div className="grid grid-cols-1 gap-4">
            {result.routes?.map((route) => (
              <div key={route.vehiculeId} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-500">local_shipping</span>
                    <p className="font-mono font-bold text-navy">{route.immatriculation}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                    <span>{route.nbTransports} transport(s)</span>
                    <span>{route.distanceTotaleKm} km</span>
                    <span>{route.dureeMinutes} min</span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {route.etapes?.map((etape) => (
                    <div
                      key={`${etape.transportId}-${etape.type}`}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                        etape.type === "PRISE_EN_CHARGE"
                          ? "border-blue-100 bg-blue-50"
                          : "border-emerald-100 bg-emerald-50"
                      }`}
                    >
                      <span className={`material-symbols-outlined text-sm ${
                        etape.type === "PRISE_EN_CHARGE" ? "text-blue-500" : "text-emerald-500"
                      }`}>
                        {etape.type === "PRISE_EN_CHARGE" ? "person_pin_circle" : "flag"}
                      </span>
                      <div>
                        <p className="font-mono font-bold text-navy">{etape.numero}</p>
                        <p className="text-slate-500">
                          {etape.type === "PRISE_EN_CHARGE" ? "Prise en charge" : "Destination"} · {etape.adresse}
                        </p>
                        {etape.heureArriveeEstimee && (
                          <p className="text-slate-400">ETA : {etape.heureArriveeEstimee}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════
export default function AideIA() {
  const [tab, setTab] = useState("dispatch");
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    aiService
      .getStatus()
      .then(({ data }) => setAiStatus(data))
      .catch(() => setAiStatus({ available: false, modules: {} }));
  }, []);

  return (
    <div className="p-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">
            Aide IA — Optimisation
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Dispatch intelligent · Extraction PMT · Optimisation de tournée
          </p>
        </div>
        <ServiceBadge status={aiStatus} />
      </div>

      {/* Modules du service */}
      {aiStatus?.modules && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {[
            { key: "pmt_ocr", label: "OCR Tesseract", icon: "document_scanner" },
            { key: "pmt_nlp", label: "NLP spaCy", icon: "psychology" },
            { key: "dispatch", label: "Smart Dispatch", icon: "local_shipping" },
            { key: "routing", label: "OR-Tools VRP", icon: "route" },
          ].map(({ key, label, icon }) => (
            <div
              key={key}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                aiStatus.modules[key]
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
              }`}
            >
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {label}
              <span>{aiStatus.modules[key] ? "✓" : "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1.5 rounded-2xl w-fit">
        <TabBtn
          active={tab === "dispatch"}
          onClick={() => setTab("dispatch")}
          icon="local_shipping"
          label="Dispatch IA"
        />
        <TabBtn
          active={tab === "pmt"}
          onClick={() => setTab("pmt")}
          icon="clinical_notes"
          label="Extraction PMT"
        />
        <TabBtn
          active={tab === "routing"}
          onClick={() => setTab("routing")}
          icon="route"
          label="Optimisation tournée"
        />
      </div>

      {/* Contenu */}
      {tab === "dispatch" && <ModuleDispatch aiStatus={aiStatus} />}
      {tab === "pmt" && <ModulePMT aiStatus={aiStatus} />}
      {tab === "routing" && <ModuleRouting aiStatus={aiStatus} />}
    </div>
  );
}
