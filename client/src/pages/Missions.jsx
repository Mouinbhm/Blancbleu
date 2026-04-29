import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  missionService,
  transportService,
  vehicleService,
  personnelService,
} from "../services/api";
import TransportProgressBar from "../components/transport/TransportProgressBar";
import api from "../services/api";
import { getSocket } from "../services/socketService";

// ── Statuts actifs terrain ────────────────────────────────────────────────────
const STATUTS_ACTIFS = [
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION",
].join(",");

// ── Configuration statuts (clés = valeurs Transport.statut) ──────────────────
const STATUT_CONFIG = {
  ASSIGNED: {
    label: "Planifiée",
    color: "bg-blue-100 text-blue-700",
    emoji: "🔵",
  },
  EN_ROUTE_TO_PICKUP: {
    label: "En route",
    color: "bg-yellow-100 text-yellow-700",
    emoji: "🚑",
  },
  ARRIVED_AT_PICKUP: {
    label: "Arrivé patient",
    color: "bg-orange-100 text-orange-700",
    emoji: "📍",
  },
  PATIENT_ON_BOARD: {
    label: "Patient à bord",
    color: "bg-purple-100 text-purple-700",
    emoji: "🧑",
  },
  ARRIVED_AT_DESTINATION: {
    label: "À destination",
    color: "bg-green-100 text-green-700",
    emoji: "🏥",
  },
};

// ── MAP filtre boutons → statuts ──────────────────────────────────────────────
const MAP_FILTRE = {
  Planifiée: ["ASSIGNED"],
  "En cours": [
    "EN_ROUTE_TO_PICKUP",
    "ARRIVED_AT_PICKUP",
    "PATIENT_ON_BOARD",
    "ARRIVED_AT_DESTINATION",
  ],
  Terminée: ["COMPLETED"],
  Annulée: ["CANCELLED", "NO_SHOW"],
};

const DISPATCH_LABEL = { manuel: "Manuel", auto: "Auto", ia: "IA" };

// ── Avancer le statut — map transition → service call ────────────────────────
const AVANCER_ACTION = {
  ASSIGNED:               { label: "En route →",        call: (id) => transportService.enRoute(id) },
  EN_ROUTE_TO_PICKUP:     { label: "Arrivé patient →",  call: (id) => transportService.arriveePatient(id, null) },
  ARRIVED_AT_PICKUP:      { label: "Patient à bord →",  call: (id) => transportService.patientABord(id) },
  PATIENT_ON_BOARD:       { label: "À destination →",   call: (id) => transportService.arriveeDestination(id) },
  ARRIVED_AT_DESTINATION: { label: "Terminer →",        call: (id) => transportService.completer(id) },
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div
      style={{
        width: 20,
        height: 20,
        border: "2px solid #e2e8f0",
        borderTop: "2px solid #1D6EF5",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
    Chargement…
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// MODALE — Créer une mission (dispatch d'un transport)
// ═════════════════════════════════════════════════════════════════════════════
function ModalNouvelleMission({ onClose, onSuccess }) {
  const [transports, setTransports] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [form, setForm] = useState({
    transportId: "",
    vehicleId: "",
    chauffeurId: "",
    dispatchMode: "manuel",
  });
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    Promise.all([
      transportService.getAll({ statut: "ASSIGNED,SCHEDULED,CONFIRMED", limit: 50 }),
      vehicleService.getAll({ disponible: "true" }),
      personnelService.getAll({ statut: "en-service", limit: 50 }),
    ])
      .then(([t, v, p]) => {
        const ts = (t.data?.transports || t.data?.data || []).filter((tr) =>
          ["CONFIRMED", "SCHEDULED", "ASSIGNED"].includes(tr.statut),
        );
        setTransports(ts);
        setVehicles(v.data);
        setPersonnel(p.data?.personnel || p.data || []);
      })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.transportId) return setErreur("Sélectionnez un transport");
    setSubmitting(true);
    setErreur("");
    try {
      await missionService.create({
        transportId: form.transportId,
        vehicleId: form.vehicleId || undefined,
        chauffeurId: form.chauffeurId || undefined,
        dispatchMode: form.dispatchMode,
        plannedAt: new Date(),
      });
      onSuccess();
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-brand font-bold text-navy text-base">
            Nouvelle mission / Dispatch
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm">
              {erreur}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Transport à assigner *
            </label>
            <select
              value={form.transportId}
              onChange={(e) => set("transportId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">-- Sélectionner un transport --</option>
              {transports.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.numero} — {t.motif} · {t.patient?.nom} {t.patient?.prenom} ({t.statut})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Véhicule
            </label>
            <select
              value={form.vehicleId}
              onChange={(e) => set("vehicleId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">-- Non assigné --</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.nom} — {v.immatriculation} ({v.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Chauffeur
            </label>
            <select
              value={form.chauffeurId}
              onChange={(e) => set("chauffeurId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">-- Non assigné --</option>
              {personnel.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.nom} {p.prenom} — {p.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Mode de dispatch
            </label>
            <div className="flex gap-3">
              {Object.entries(DISPATCH_LABEL).map(([v, l]) => (
                <label
                  key={v}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                    form.dispatchMode === v
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    value={v}
                    checked={form.dispatchMode === v}
                    onChange={() => set("dispatchMode", v)}
                    className="hidden"
                  />
                  {v === "ia" && (
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  )}
                  {l}
                </label>
              ))}
            </div>
            {form.dispatchMode === "ia" && (
              <p className="text-xs text-violet-600 mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">info</span>
                Le véhicule et le chauffeur seront suggérés automatiquement par l'IA (seuil de confiance : 70%).
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Création…" : "Créer la mission"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CARTE MISSION (données = transport actif)
// ═════════════════════════════════════════════════════════════════════════════
function MissionCard({ mission, onRefresh, onToast }) {
  const navigate = useNavigate();
  const [advancing, setAdvancing] = useState(false);
  const config = STATUT_CONFIG[mission.statut] || {
    label: mission.statut,
    color: "bg-slate-100 text-slate-600",
    emoji: "🚑",
  };

  // Vérification jour J pour les boutons terrain
  const _dateT = mission.dateTransport ? new Date(mission.dateTransport) : null;
  const _debutJour = new Date(); _debutJour.setHours(0, 0, 0, 0);
  const estJourJ = !_dateT || (
    _dateT.getFullYear() === _debutJour.getFullYear() &&
    _dateT.getMonth()    === _debutJour.getMonth()    &&
    _dateT.getDate()     === _debutJour.getDate()
  );
  const dateFormatee = _dateT
    ? _dateT.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
    : null;

  const heure = mission.dateTransport
    ? new Date(mission.dateTransport).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const nextAction = AVANCER_ACTION[mission.statut];

  const handleAvancer = async (e) => {
    e.stopPropagation();
    if (!nextAction || advancing) return;
    setAdvancing(true);
    try {
      await nextAction.call(mission._id || mission.id);
      onToast?.({ type: "success", msg: `✅ ${mission.numero} — statut avancé` });
      onRefresh?.();
    } catch (err) {
      onToast?.({ type: "error", msg: err.response?.data?.message || "Erreur lors de la transition" });
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">

      {/* En-tête */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-bold text-slate-800 shrink-0">{mission.numero}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${config.color}`}>
            {config.emoji} {config.label}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono shrink-0 ml-2">{heure}</span>
      </div>

      {/* Barre de progression */}
      <div className="mb-3 -mx-1">
        <TransportProgressBar statut={mission.statut} />
      </div>

      {/* Patient */}
      <p className="font-semibold text-slate-700 mb-0.5 truncate">
        {mission.patient?.nom} {mission.patient?.prenom}
      </p>
      <p className="text-xs text-slate-500 mb-3">
        {mission.motif}
        {mission.patient?.mobilite && mission.patient.mobilite !== "ASSIS"
          ? ` • ${mission.patient.mobilite.replace(/_/g, " ")}`
          : ""}
      </p>

      {/* Itinéraire */}
      <div className="text-xs text-slate-600 mb-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-green-500 shrink-0">📍</span>
          <span className="truncate">
            {[mission.adresseDepart?.rue, mission.adresseDepart?.ville]
              .filter(Boolean)
              .join(", ") || "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-500 shrink-0">🏥</span>
          <span className="truncate">
            {[
              mission.adresseDestination?.nom || mission.adresseDestination?.rue,
              mission.adresseDestination?.ville,
            ]
              .filter(Boolean)
              .join(", ") || "—"}
          </span>
        </div>
      </div>

      {/* Véhicule */}
      {mission.vehicule && (
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <span>🚑</span>
          <span className="truncate">
            {mission.vehicule.nom} — {mission.vehicule.immatriculation}
          </span>
        </div>
      )}

      {/* Boutons */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/transports/${String(mission._id || mission.id)}`)}
          className="flex-1 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Voir détail
        </button>
        {nextAction && (
          <div className="flex-1 flex flex-col items-stretch">
            <button
              onClick={estJourJ ? handleAvancer : undefined}
              disabled={advancing || !estJourJ}
              title={!estJourJ && dateFormatee ? `Disponible le ${dateFormatee}` : undefined}
              className={`w-full py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                !estJourJ
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              }`}
            >
              {advancing ? "…" : !estJourJ ? `🔒 ${nextAction.label}` : nextAction.label}
            </button>
            {!estJourJ && dateFormatee && (
              <p className="text-[10px] text-slate-400 mt-0.5 text-center">🗓 {dateFormatee}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODALE DÉMO — Cycle de vie accéléré (dev uniquement)
// ═════════════════════════════════════════════════════════════════════════════
const DEMO_STEPS = [
  { statut: "ASSIGNED",               label: "En route",         call: (id) => api.patch(`/transports/${id}/en-route`, { bypass_date_check: true }) },
  { statut: "EN_ROUTE_TO_PICKUP",     label: "Arrivé patient",   call: (id) => api.patch(`/transports/${id}/arrived`, { bypass_date_check: true }) },
  { statut: "ARRIVED_AT_PICKUP",      label: "Patient à bord",   call: (id) => api.patch(`/transports/${id}/on-board`, { bypass_date_check: true }) },
  { statut: "PATIENT_ON_BOARD",       label: "À destination",    call: (id) => api.patch(`/transports/${id}/destination`, { bypass_date_check: true }) },
  { statut: "ARRIVED_AT_DESTINATION", label: "Terminer",         call: (id) => api.patch(`/transports/${id}/complete`, { bypass_date_check: true }) },
];

function _isDateFuture(transport) {
  if (!transport?.dateTransport) return false;
  const dateT = new Date(transport.dateTransport);
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  return (
    dateT.getFullYear() !== debutJour.getFullYear() ||
    dateT.getMonth()    !== debutJour.getMonth()    ||
    dateT.getDate()     !== debutJour.getDate()
  );
}

function ModalDemoCycle({ missions, onClose, onRefresh }) {
  const [transportId, setTransportId] = useState("");
  const [vitesse, setVitesse] = useState("normale");
  const [steps, setSteps] = useState(() =>
    DEMO_STEPS.reduce((acc, s) => ({ ...acc, [s.statut]: true }), {}),
  );
  const [estFutur, setEstFutur] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);
  const startTime = useRef(null);

  const delayMs = vitesse === "lente" ? 3000 : vitesse === "rapide" ? 500 : 1000;

  const selectedTransport = missions.find((m) => m._id === transportId || m.id === transportId);

  // Auto-configure les étapes quand le transport change
  useEffect(() => {
    const transport = missions.find((m) => m._id === transportId || m.id === transportId);
    const futur = _isDateFuture(transport);
    setEstFutur(futur);
    // Pour un transport futur : décocher toutes les étapes terrain
    // Pour un transport du jour : tout cocher par défaut
    setSteps(DEMO_STEPS.reduce((acc, s) => ({ ...acc, [s.statut]: !futur }), {}));
    setLog([]);
    setDone(false);
  }, [transportId, missions]);

  // Compute steps that are reachable from the selected transport's current statut
  const reachableSteps = useMemo(() => {
    if (!selectedTransport) return [];
    const startIdx = DEMO_STEPS.findIndex((s) => s.statut === selectedTransport.statut);
    return startIdx >= 0 ? DEMO_STEPS.slice(startIdx) : [];
  }, [selectedTransport]);

  const addLog = (msg, type = "info") =>
    setLog((prev) => [...prev, { msg, type, ts: new Date().toLocaleTimeString("fr-FR") }]);

  const handleLancer = async () => {
    if (!transportId) return;
    setRunning(true);
    setLog([]);
    setDone(false);
    startTime.current = Date.now();
    addLog(`🎬 Démo démarrée — transport ${selectedTransport?.numero || transportId}`);

    for (const step of reachableSteps) {
      if (!steps[step.statut]) { addLog(`⏩ ${step.label} — ignorée`, "skip"); continue; }
      addLog(`⏳ ${step.label}…`);
      await new Promise((r) => setTimeout(r, delayMs));
      try {
        await step.call(transportId);
        addLog(`✅ ${step.label}`, "success");
      } catch (err) {
        const msg = err.response?.data?.message || err.message;
        addLog(`❌ ${step.label} — ${msg}`, "error");
        break;
      }
    }

    const elapsed = ((Date.now() - startTime.current) / 1000).toFixed(1);
    addLog(`🏁 Démonstration terminée en ${elapsed} s`, "done");
    setDone(true);
    setRunning(false);
    onRefresh();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-brand font-bold text-navy text-base flex items-center gap-2">
            <span className="text-lg">🎬</span> Démo cycle de vie
            <span className="text-[10px] font-mono bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">DEV ONLY</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Sélecteur transport */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Transport à démontrer</label>
            <select
              value={transportId}
              onChange={(e) => setTransportId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={running}
            >
              <option value="">-- Sélectionner --</option>
              {missions.map((m) => {
                const futur = _isDateFuture(m);
                const dateStr = m.dateTransport
                  ? new Date(m.dateTransport).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                  : "";
                return (
                  <option key={m._id} value={m._id}>
                    {m.numero} — {m.patient?.nom} {m.patient?.prenom} ({m.statut}){futur ? ` 📅 ${dateStr}` : " ✅ Aujourd'hui"}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Bandeau avertissement transport futur */}
          {transportId && estFutur && selectedTransport && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">
                ⚠️ Transport du {new Date(selectedTransport.dateTransport).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                La simulation s'arrête à <strong>ASSIGNED</strong>. Les étapes terrain (En route, Arrivé patient…)
                seront disponibles le {new Date(selectedTransport.dateTransport).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
              </p>
            </div>
          )}

          {/* Bandeau transport du jour */}
          {transportId && !estFutur && selectedTransport && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-xs text-emerald-700 font-medium">
              ✅ Transport du jour — simulation complète disponible jusqu'à COMPLETED
            </div>
          )}

          {/* Vitesse */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-2">Vitesse</label>
            <div className="flex gap-2">
              {[["lente", "Lente (3s)"], ["normale", "Normale (1s)"], ["rapide", "Rapide (0.5s)"]].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setVitesse(v)}
                  disabled={running}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                    vitesse === v ? "bg-primary text-white border-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Étapes */}
          {reachableSteps.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-2">Transitions à jouer</label>
              <div className="space-y-1.5">
                {reachableSteps.map((s) => {
                  const locked = estFutur;
                  return (
                    <label
                      key={s.statut}
                      className={`flex items-center gap-2 text-sm ${locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                      title={locked ? "Non disponible — transport futur" : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={!!steps[s.statut]}
                        onChange={(e) => !locked && setSteps((prev) => ({ ...prev, [s.statut]: e.target.checked }))}
                        disabled={running || locked}
                        className="accent-primary"
                      />
                      {locked ? "🔒 " : ""}{s.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Log */}
          {log.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-3 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
              {log.map((l, i) => (
                <p
                  key={i}
                  className={
                    l.type === "success" ? "text-emerald-400"
                    : l.type === "error" ? "text-red-400"
                    : l.type === "done" ? "text-yellow-300 font-bold"
                    : l.type === "skip" ? "text-slate-500"
                    : "text-slate-300"
                  }
                >
                  <span className="text-slate-600 mr-2">{l.ts}</span>{l.msg}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            Fermer
          </button>
          <button
            onClick={handleLancer}
            disabled={!transportId || running || reachableSteps.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span style={{ width:14, height:14, border:"2px solid rgba(255,255,255,.4)", borderTop:"2px solid white", borderRadius:"50%", animation:"spin .7s linear infinite", display:"inline-block" }} />
                En cours…
              </span>
            ) : done ? "🔁 Relancer" : "▶ Lancer la démo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═════════════════════════════════════════════════════════════════════════════
const IS_DEV = process.env.NODE_ENV !== "production";

export default function Missions() {
  const navigate = useNavigate();
  const [missions, setMissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtreActif, setFiltreActif] = useState("Toutes");
  const [showModal, setShowModal] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Chargement des transports actifs ─────────────────────────────────────
  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transportService.getAll({
        statut: STATUTS_ACTIFS,
        limit: 100,
      });
      const data = res?.data;
      const liste =
        data?.transports ||
        data?.data ||
        (Array.isArray(data) ? data : []);

      setMissions(liste);
      setStats({
        total: liste.length,
        enCours: liste.filter((m) =>
          ["EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD"].includes(m.statut),
        ).length,
        planifiees: liste.filter((m) => m.statut === "ASSIGNED").length,
        terminees: 0,
        annulees: 0,
      });
    } catch (err) {
      console.error("Erreur missions:", err);
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    charger();
    const interval = setInterval(charger, 30000);
    return () => clearInterval(interval);
  }, [charger]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Mise à jour temps réel via Socket.IO
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = () => charger();
    socket.on("transport:statut", onUpdate);
    socket.on("transport:statut_change", onUpdate);
    return () => {
      socket.off("transport:statut", onUpdate);
      socket.off("transport:statut_change", onUpdate);
    };
  }, [charger]);

  // ── Filtrage local (pas de re-fetch) ─────────────────────────────────────
  const missionsFiltrees = useMemo(() => {
    if (!filtreActif || filtreActif === "Toutes") return missions;
    const statuts = MAP_FILTRE[filtreActif] || [];
    return missions.filter((m) => statuts.includes(m.statut));
  }, [missions, filtreActif]);

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[9999] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 transition-all ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {showModal && (
        <ModalNouvelleMission
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); charger(); }}
        />
      )}

      {showDemo && IS_DEV && (
        <ModalDemoCycle
          missions={missions}
          onClose={() => setShowDemo(false)}
          onRefresh={charger}
        />
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Missions</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Suivi opérationnel des transports en cours — actualisé toutes les 30 s
          </p>
        </div>
        <div className="flex gap-2">
          {IS_DEV && (
            <button
              onClick={() => setShowDemo(true)}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-600 transition-colors"
              title="Mode démo soutenance (dev uniquement)"
            >
              🎬 Démo
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nouvelle mission
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total actives", val: stats.total,      icon: "local_shipping", color: "text-navy" },
            { label: "En cours",      val: stats.enCours,    icon: "directions_car", color: "text-amber-600" },
            { label: "Planifiées",    val: stats.planifiees, icon: "schedule",       color: "text-blue-600" },
            { label: "Terminées",     val: stats.terminees,  icon: "check_circle",   color: "text-green-600" },
            { label: "Annulées",      val: stats.annulees,   icon: "cancel",         color: "text-red-400" },
          ].map(({ label, val, icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <span className={`material-symbols-outlined ${color}`}>{icon}</span>
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-xl font-mono font-bold ${color}`}>{val}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtres locaux */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex items-center gap-2 flex-wrap">
        {["Toutes", "Planifiée", "En cours", "Terminée", "Annulée"].map((label) => (
          <button
            key={label}
            onClick={() => setFiltreActif(label)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filtreActif === label
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">
          {missionsFiltrees.length} mission(s)
        </span>
      </div>

      {/* Contenu */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {missionsFiltrees.length === 0 ? (
            <div className="col-span-3 text-center py-16">
              <span className="text-5xl mb-4 block">🚑</span>
              <p className="text-slate-600 font-medium">
                Aucune mission active en ce moment
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Les missions apparaissent quand un transport est assigné à un véhicule
              </p>
              <button
                onClick={() => navigate("/transports")}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                Gérer les transports
              </button>
            </div>
          ) : (
            missionsFiltrees.map((mission) => (
              <MissionCard
                key={mission._id}
                mission={mission}
                onRefresh={charger}
                onToast={setToast}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
