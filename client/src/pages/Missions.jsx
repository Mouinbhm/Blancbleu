import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  missionService,
  transportService,
  vehicleService,
  personnelService,
} from "../services/api";
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
        setVehicles(v.data?.data || v.data?.vehicles || []);
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
function MissionCard({ mission }) {
  const navigate = useNavigate();
  const config = STATUT_CONFIG[mission.statut] || {
    label: mission.statut,
    color: "bg-slate-100 text-slate-600",
    emoji: "🚑",
  };

  const heure = mission.dateTransport
    ? new Date(mission.dateTransport).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

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

      {/* Bouton */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/transports/${String(mission._id || mission.id)}`)}
          className="flex-1 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Voir détail
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═════════════════════════════════════════════════════════════════════════════
export default function Missions() {
  const navigate = useNavigate();
  const [missions, setMissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtreActif, setFiltreActif] = useState("Toutes");
  const [showModal, setShowModal] = useState(false);

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

      {showModal && (
        <ModalNouvelleMission
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); charger(); }}
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
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouvelle mission
        </button>
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
              <MissionCard key={mission._id} mission={mission} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
