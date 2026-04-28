// Fichier : client/src/pages/TransportDetail.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StatutBadge from "../components/transport/StatutBadge";
import TransportMap from "../components/map/TransportMap";
import { transportService, vehicleService, missionService, factureService } from "../services/api";
import useSocket from "../hooks/useSocket";
import { getSocket, getOrCreateSocket } from "../services/socketService";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDRE_STATUTS = [
  "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
  "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
  "COMPLETED", "BILLED",
];

const LABEL_COURT = {
  REQUESTED: "Demandé", CONFIRMED: "Confirmé", SCHEDULED: "Planifié",
  ASSIGNED: "Assigné", EN_ROUTE_TO_PICKUP: "En route",
  ARRIVED_AT_PICKUP: "Arrivé", PATIENT_ON_BOARD: "À bord",
  ARRIVED_AT_DESTINATION: "Destination", WAITING_AT_DESTINATION: "Attente",
  RETURN_TO_BASE: "Retour", COMPLETED: "Terminé", BILLED: "Facturé",
};

const LABEL_TIMELINE = {
  REQUESTED: "Demande reçue",
  CONFIRMED: "Transport confirmé",
  SCHEDULED: "Transport planifié",
  ASSIGNED: "Véhicule assigné",
  EN_ROUTE_TO_PICKUP: "En route vers le patient",
  ARRIVED_AT_PICKUP: "Arrivé chez le patient",
  PATIENT_ON_BOARD: "Patient pris en charge",
  ARRIVED_AT_DESTINATION: "Arrivé à destination",
  WAITING_AT_DESTINATION: "En attente à destination",
  RETURN_TO_BASE: "Retour base en cours",
  COMPLETED: "Transport terminé",
  BILLED: "Facturé CPAM",
  CANCELLED: "Transport annulé",
  NO_SHOW: "Patient absent",
  RESCHEDULED: "Reprogrammé",
};

const MOBILITE_LABELS = {
  ASSIS:            "🪑 Assis",
  FAUTEUIL_ROULANT: "♿ Fauteuil roulant",
  ALLONGE:          "🛏️ Allongé",
  CIVIERE:          "🚑 Civière",
};

const MOBILITE_BADGE = {
  ASSIS:            "bg-emerald-100 text-emerald-700",
  FAUTEUIL_ROULANT: "bg-amber-100 text-amber-700",
  ALLONGE:          "bg-red-100 text-red-700",
  CIVIERE:          "bg-red-200 text-red-800",
};

const PHASE_LABELS = {
  DEPOT_TO_PATIENT: "En route vers le patient",
  PATIENT_TO_HOPITAL: "Transport du patient en cours",
};

const BTN = {
  blue:   "bg-blue-600 hover:bg-blue-700 text-white",
  indigo: "bg-indigo-600 hover:bg-indigo-700 text-white",
  orange: "bg-orange-500 hover:bg-orange-600 text-white",
  yellow: "bg-yellow-500 hover:bg-yellow-600 text-white",
  cyan:   "bg-cyan-600 hover:bg-cyan-700 text-white",
  teal:   "bg-teal-600 hover:bg-teal-700 text-white",
  green:  "bg-emerald-600 hover:bg-emerald-700 text-white",
  violet: "bg-violet-600 hover:bg-violet-700 text-white",
  slate:  "bg-slate-600 hover:bg-slate-700 text-white",
  purple: "bg-purple-600 hover:bg-purple-700 text-white",
};

const ACTIONS_PAR_STATUT = {
  REQUESTED: [{ label: "Confirmer la demande", fn: "confirmer", color: "blue", icon: "check_circle" }],
  CONFIRMED: [{ label: "Planifier", fn: "planifier", color: "indigo", icon: "calendar_month" }],
  SCHEDULED: [{ label: "Reprogrammer", color: "indigo", icon: "event_repeat", modal: "reprogrammer" }],
  ASSIGNED: [{ label: "En route", fn: "enRoute", color: "orange", icon: "directions_car" }],
  EN_ROUTE_TO_PICKUP: [{ label: "Arrivé chez le patient", fn: "arriveePatient", color: "yellow", icon: "location_on" }],
  ARRIVED_AT_PICKUP: [{ label: "Patient à bord", fn: "patientABord", color: "cyan", icon: "personal_injury" }],
  PATIENT_ON_BOARD: [{ label: "Arrivé à destination", fn: "arriveeDestination", color: "teal", icon: "flag" }],
  ARRIVED_AT_DESTINATION: [
    { label: "Attente patient", color: "violet", icon: "hourglass", modal: "attente" },
    { label: "Retour base", color: "slate", icon: "home", modal: "retour" },
    { label: "Terminer", fn: "completer", color: "green", icon: "check_circle" },
  ],
  WAITING_AT_DESTINATION: [
    { label: "Retour base", color: "slate", icon: "home", modal: "retour" },
  ],
  RETURN_TO_BASE: [{ label: "Terminer le transport", fn: "completer", color: "green", icon: "check_circle" }],
  COMPLETED: [{ label: "Clôturer (CPAM)", color: "purple", icon: "receipt_long", modal: "facturer" }],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";

const fmtDatetime = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() - birth.getMonth() < 0 ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, children }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className="material-symbols-outlined text-slate-400 text-base flex-shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
        {children || <p className="text-sm font-semibold text-navy">{value || "—"}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      <h2 className="font-brand font-bold text-navy text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-base">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-brand font-bold text-navy text-base">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-slate-500 text-base">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Section 1: Progress bar ──────────────────────────────────────────────────

function ProgressBar({ statut }) {
  const isTerminalBad = ["CANCELLED", "NO_SHOW"].includes(statut);
  const currentIdx = ORDRE_STATUTS.indexOf(statut);

  return (
    <div className="flex items-center overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
      {ORDRE_STATUTS.map((s, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={s} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center" style={{ minWidth: 34 }}>
              <div
                title={LABEL_COURT[s]}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  isCurrent && isTerminalBad
                    ? "bg-red-400 ring-2 ring-red-200"
                    : isCurrent
                    ? "bg-primary ring-2 ring-blue-200 scale-125"
                    : isPast
                    ? "bg-primary opacity-50"
                    : "bg-slate-200"
                }`}
              />
              {isCurrent && (
                <p className="text-[9px] text-primary font-bold mt-1 whitespace-nowrap leading-none">
                  {LABEL_COURT[s]}
                </p>
              )}
            </div>
            {i < ORDRE_STATUTS.length - 1 && (
              <div
                className={`h-0.5 flex-shrink-0 mx-0.5 ${
                  isPast || isCurrent ? "bg-primary opacity-40" : "bg-slate-200"
                }`}
                style={{ width: 16 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Section 2: Timeline ──────────────────────────────────────────────────────

function Timeline({ transport }) {
  const isCancelOrNoShow = ["CANCELLED", "NO_SHOW"].includes(transport.statut);
  const currentIdx = ORDRE_STATUTS.indexOf(transport.statut);

  const journalMap = {};
  (transport.journal || []).forEach((e) => {
    if (e.vers) journalMap[e.vers] = e;
  });
  if (!journalMap["REQUESTED"]) {
    journalMap["REQUESTED"] = { timestamp: transport.createdAt, utilisateur: "système" };
  }

  const steps = isCancelOrNoShow
    ? [...ORDRE_STATUTS.slice(0, Math.max(currentIdx, 1)), transport.statut]
    : ORDRE_STATUTS;

  return (
    <div>
      {steps.map((s, i) => {
        const entry = journalMap[s];
        const isCurrent = s === transport.statut;
        const isPast = i < currentIdx && !isCurrent;
        const isBad = ["CANCELLED", "NO_SHOW"].includes(s);

        return (
          <div key={s} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ring-2 ${
                  isCurrent && isBad
                    ? "bg-red-500 ring-red-200"
                    : isCurrent
                    ? "bg-primary ring-blue-200"
                    : isPast
                    ? "bg-emerald-500 ring-emerald-100"
                    : "bg-slate-200 ring-slate-100"
                }`}
                style={isCurrent && !isBad ? { animation: "pulse-dot 1.5s ease infinite" } : undefined}
              />
              {i < steps.length - 1 && (
                <div
                  className={`w-0.5 flex-1 min-h-[20px] mt-0.5 ${
                    isPast ? "bg-emerald-200" : "bg-slate-100"
                  }`}
                />
              )}
            </div>
            <div className="pb-4 min-w-0 flex-1">
              <p
                className={`text-xs font-semibold leading-tight ${
                  isCurrent && isBad
                    ? "text-red-600"
                    : isCurrent
                    ? "text-primary"
                    : isPast
                    ? "text-emerald-700"
                    : "text-slate-300"
                }`}
              >
                {LABEL_TIMELINE[s] || s}
              </p>
              {entry && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {fmtDatetime(entry.timestamp)}
                  {entry.utilisateur && entry.utilisateur !== "système"
                    ? ` · ${entry.utilisateur}`
                    : ""}
                </p>
              )}
              {entry?.notes && (
                <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">
                  {entry.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TransportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { subscribe } = useSocket();

  const [transport, setTransport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [vehiclePosition, setVehiclePosition] = useState(null);
  const [posLive, setPosLive] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [isLive, setIsLive] = useState(false);

  // Linked entities
  const [linkedMission, setLinkedMission] = useState(null);
  const [linkedFacture, setLinkedFacture] = useState(null);

  // Modal: null | 'assigner' | 'attente' | 'retour' | 'facturer' | 'reprogrammer'
  const [activeModal, setActiveModal] = useState(null);
  const [modalVehicle, setModalVehicle] = useState("");
  const [modalDuree, setModalDuree] = useState("");
  const [modalFactureId, setModalFactureId] = useState("");
  const [modalReprogDate, setModalReprogDate] = useState("");
  const [modalReprogHeure, setModalReprogHeure] = useState("");
  const closeModal = () => setActiveModal(null);

  const loadTransport = useCallback(async () => {
    try {
      setErreur(null);
      const { data } = await transportService.getOne(id);
      setTransport(data);
    } catch {
      setErreur("Transport introuvable ou supprimé.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadTransport(); }, [loadTransport]);

  useEffect(() => {
    if (!transport) return;
    setIsLive(!["BILLED", "CANCELLED", "NO_SHOW", "COMPLETED"].includes(transport.statut));

    // Load linked mission and facture
    missionService.getAll({ transportId: transport._id, limit: 1 })
      .then(({ data }) => setLinkedMission(data?.missions?.[0] || null))
      .catch(() => {});

    factureService.getAll({ limit: 5 })
      .then(({ data }) => {
        const f = (data?.factures || []).find(
          (fac) => fac.transportId?._id === transport._id || fac.transportId === transport._id
        );
        setLinkedFacture(f || null);
      })
      .catch(() => {});
  }, [transport]);

  useEffect(() => {
    vehicleService.getAll().then(({ data }) => {
      setVehicles(Array.isArray(data) ? data : data?.data || data?.vehicles || []);
    }).catch(() => {});
  }, []);

  // ── Section 8: Socket.IO ────────────────────────────────────────────────────

  // Mise à jour timeline sur changement de statut
  // Écoute "transport:statut"        (émis par emitTransportStatut dans lifecycle)
  //   et  "transport:statut_change"  (émis par emitTransportStatutChange dans lifecycle)
  useEffect(() => {
    const socket = getSocket() || getOrCreateSocket();
    if (!socket) return;

    const onStatutChange = (d) => {
      if (String(d.transportId) !== id) return;
      console.log(`🔄 Statut changé : ${d.ancienStatut} → ${d.nouveauStatut}`);
      loadTransport();
    };

    socket.on("transport:statut",        onStatutChange);
    socket.on("transport:statut_change", onStatutChange);

    return () => {
      socket.off("transport:statut",        onStatutChange);
      socket.off("transport:statut_change", onStatutChange);
    };
  }, [id, loadTransport]);

  useEffect(() => {
    const unsub = subscribe("unit:location_updated", (d) => {
      const vid = String(transport?.vehicule?._id || transport?.vehicule || "");
      if (!vid) return;
      const incoming = String(d.unitId || d.vehicleId || "");
      if (incoming === vid) {
        setVehiclePosition({
          lat: d.position?.lat ?? d.lat,
          lng: d.position?.lng ?? d.lng,
        });
      }
    });
    return unsub;
  }, [subscribe, transport?.vehicule]);

  // Simulation GPS temps réel
  useEffect(() => {
    const unsub = subscribe("vehicule:position", (d) => {
      if (String(d.transportId) !== id) return;
      const pos = { lat: d.lat, lng: d.lng, phase: d.phase, vitesse: d.vitesse, progression: d.progression };
      setVehiclePosition(pos);
      setPosLive(pos);
    });
    return unsub;
  }, [subscribe, id]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const doAction = async (fn, ...args) => {
    setActionLoading(true);
    try {
      await transportService[fn](id, ...args);
      await loadTransport();
      closeModal();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'action");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAnnuler = async () => {
    const raison = window.prompt("Raison de l'annulation :");
    if (raison === null) return;
    doAction("annuler", raison);
  };

  const handleAssigner = () => {
    if (!modalVehicle) return;
    doAction("assigner", { vehiculeId: modalVehicle });
  };

  const handleAttente = () => {
    doAction("attendreDestination", modalDuree ? parseInt(modalDuree, 10) : null);
  };

  const handleRetour = () => {
    doAction("retourBase", null);
  };

  const handleFacturer = () => {
    if (!modalFactureId.trim()) return;
    doAction("facturer", modalFactureId.trim());
  };

  const handleReprogrammer = async () => {
    if (!modalReprogDate) return;
    setActionLoading(true);
    try {
      await transportService.reprogrammer(id, {
        dateTransport: modalReprogDate,
        heureRDV: modalReprogHeure || undefined,
      });
      await loadTransport();
      closeModal();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de la reprogrammation");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div style={{ width: 28, height: 28, border: "2.5px solid #e2e8f0", borderTop: "2.5px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (erreur || !transport) {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-slate-300 text-6xl block mb-3">error_outline</span>
        <p className="text-slate-500 mb-4">{erreur || "Transport introuvable"}</p>
        <button onClick={() => navigate("/transports")} className="text-primary font-semibold hover:underline text-sm">
          ← Retour aux transports
        </button>
      </div>
    );
  }

  const peutAnnuler = !["BILLED", "CANCELLED", "NO_SHOW"].includes(transport.statut);
  const peutAssigner = ["CONFIRMED", "SCHEDULED"].includes(transport.statut);
  const actionsStatut = ACTIONS_PAR_STATUT[transport.statut] || [];
  const hasActions = actionsStatut.length > 0 || peutAnnuler || peutAssigner;

  const age = calcAge(transport.patient?.dateNaissance);
  const vehiclePos = vehiclePosition || (transport.vehicule?.position?.lat ? transport.vehicule.position : null);
  const vehicleId = String(transport.vehicule?._id || transport.vehicule?.id || "");

  // Filtrage des véhicules compatibles avec la mobilité réelle du patient
  const COMPAT_VEHICULE = {
    ASSIS:            ["VSL", "TPMR", "AMBULANCE"],
    FAUTEUIL_ROULANT: ["TPMR", "AMBULANCE"],
    ALLONGE:          ["AMBULANCE"],
    CIVIERE:          ["AMBULANCE"],
  };
  const mobilitePatient = transport.patient?.mobilite || "ASSIS";
  const typesCompatibles = COMPAT_VEHICULE[mobilitePatient] || ["VSL"];
  const typeOriginal = transport?.typeTransport;
  const typesTries = [typeOriginal, ...typesCompatibles.filter((t) => t !== typeOriginal)].filter(Boolean);

  // Tous les véhicules compatibles par type, disponibles en tête
  const vehiculesCompatibles = vehicles
    .filter((v) => typesTries.includes(v.type))
    .sort((a, b) => {
      if (a.statut === "disponible" && b.statut !== "disponible") return -1;
      if (b.statut === "disponible" && a.statut !== "disponible") return 1;
      return typesTries.indexOf(a.type) - typesTries.indexOf(b.type);
    });

  return (
    <div className="pb-24 fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse-dot { 0%,100% { opacity:1 } 50% { opacity:.3 } }
      `}</style>

      {/* ── SECTION 1: Header + progress bar ──────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/transports")}
              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              <span className="material-symbols-outlined text-slate-500 text-base">arrow_back</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono font-bold text-navy text-lg tracking-tight">
                  {transport.numero}
                </h1>
                <StatutBadge statut={transport.statut} size="lg" />
                {isLive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"
                      style={{ animation: "pulse-dot 1.5s ease infinite" }}
                    />
                    EN DIRECT
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {fmtDateShort(transport.dateTransport)} · {transport.heureRDV || "—"} · {transport.motif}
              </p>
            </div>
          </div>
        </div>
        <ProgressBar statut={transport.statut} />
      </div>

      {/* ── Bannière GPS temps réel ─────────────────────────────────────────── */}
      {posLive && !["BILLED", "CANCELLED", "NO_SHOW", "COMPLETED"].includes(transport.statut) && (
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-lg">
              🚑
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold text-white truncate">
                  {PHASE_LABELS[posLive.phase] || "Véhicule en mouvement"}
                </span>
                <span className="text-xs font-mono bg-white/25 text-white px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                  {posLive.vitesse} km/h
                </span>
              </div>
              <div className="w-full bg-white/25 rounded-full h-1.5">
                <div
                  className="bg-white rounded-full h-1.5 transition-all duration-1000"
                  style={{ width: `${posLive.progression ?? 0}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-bold text-white/80 flex-shrink-0 w-8 text-right">
              {posLive.progression ?? 0}%
            </span>
          </div>
        </div>
      )}

      {/* ── Main layout ────────────────────────────────────────────────────────── */}
      <div className="p-6 grid gap-5 lg:grid-cols-3">

        {/* ── LEFT: main content ────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── SECTION 3: Patient ──────────────────────────────────────────────── */}
          <SectionCard title="Patient" icon="personal_injury">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="font-bold text-navy text-base">
                  {transport.patient?.nom} {transport.patient?.prenom}
                  {age !== null && (
                    <span className="font-normal text-slate-400 text-sm ml-2">{age} ans</span>
                  )}
                </p>
                {transport.patient?.dateNaissance && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Né(e) le {fmtDate(transport.patient.dateNaissance)}
                  </p>
                )}
              </div>
              {transport.patient?.mobilite && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${MOBILITE_BADGE[transport.patient.mobilite] || "bg-slate-100 text-slate-600"}`}>
                  {MOBILITE_LABELS[transport.patient.mobilite] || transport.patient.mobilite}
                </span>
              )}
            </div>

            {/* Besoins spéciaux */}
            {(transport.patient?.oxygene || transport.patient?.brancardage || transport.patient?.accompagnateur) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {transport.patient?.oxygene && (
                  <span className="inline-flex items-center gap-1 text-xs bg-sky-100 text-sky-700 font-semibold px-2.5 py-1 rounded-full">
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>air</span>
                    Oxygène
                  </span>
                )}
                {transport.patient?.brancardage && (
                  <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 font-semibold px-2.5 py-1 rounded-full">
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>bed</span>
                    Brancardage
                  </span>
                )}
                {transport.patient?.accompagnateur && (
                  <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 font-semibold px-2.5 py-1 rounded-full">
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>
                    Accompagnateur
                  </span>
                )}
              </div>
            )}

            {transport.patient?.telephone && (
              <InfoRow icon="call" label="Téléphone">
                <a
                  href={`tel:${transport.patient.telephone}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {transport.patient.telephone}
                </a>
              </InfoRow>
            )}
            {transport.patient?.antecedents && (
              <InfoRow icon="medical_information" label="Antécédents" value={transport.patient.antecedents} />
            )}
          </SectionCard>

          {/* ── SECTION 4: Itinéraire + carte ───────────────────────────────────── */}
          <SectionCard title="Itinéraire" icon="route">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Adresses */}
              <div>
                <InfoRow icon="trip_origin" label="Départ">
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      {transport.adresseDepart?.rue || transport.adresseDepart?.nom || "—"}
                    </p>
                    {transport.adresseDepart?.ville && (
                      <p className="text-xs text-slate-400">
                        {transport.adresseDepart.codePostal} {transport.adresseDepart.ville}
                      </p>
                    )}
                  </div>
                </InfoRow>
                <InfoRow icon="location_on" label="Destination">
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      {transport.adresseDestination?.nom || transport.adresseDestination?.rue || "—"}
                    </p>
                    {transport.adresseDestination?.service && (
                      <p className="text-xs text-primary font-semibold">
                        {transport.adresseDestination.service}
                      </p>
                    )}
                    {transport.adresseDestination?.ville && (
                      <p className="text-xs text-slate-400">
                        {transport.adresseDestination.codePostal} {transport.adresseDestination.ville}
                      </p>
                    )}
                  </div>
                </InfoRow>
                {transport.allerRetour && (
                  <div className="flex items-center gap-1.5 text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-1.5 mt-2">
                    <span className="material-symbols-outlined text-sm">repeat</span>
                    Aller-retour prévu
                  </div>
                )}
                {transport.distanceKm != null && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                    <span className="material-symbols-outlined text-sm text-slate-400">straighten</span>
                    <span className="font-semibold text-navy">{transport.distanceKm} km</span>
                    <span>estimés</span>
                  </div>
                )}
              </div>
              {/* Carte */}
              <div
                className="rounded-xl overflow-hidden border border-slate-200 relative"
                style={{ height: 220, zIndex: 1 }}
              >
                <TransportMap transport={transport} vehiclePosition={vehiclePos} />
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 5: Véhicule & Chauffeur ─────────────────────────────────── */}
          {transport.vehicule && !["REQUESTED", "CONFIRMED", "SCHEDULED"].includes(transport.statut) && (
            <SectionCard title="Véhicule assigné" icon="airport_shuttle">
              <div className="flex items-start gap-4">
                <div className="grid grid-cols-2 gap-0 flex-1 divide-y divide-slate-50">
                  <InfoRow icon="badge" label="Nom" value={transport.vehicule?.nom} />
                  <InfoRow icon="pin" label="Immatriculation" value={transport.vehicule?.immatriculation} />
                  <InfoRow icon="airport_shuttle" label="Type" value={transport.vehicule?.type} />
                  <InfoRow icon="schedule" label="Assigné le" value={fmtDatetime(transport.heureAssignation)} />
                </div>
                {vehicleId && (
                  <button
                    onClick={() => navigate(`/flotte/${vehicleId}`)}
                    className="flex-shrink-0 flex flex-col items-center gap-1 text-xs text-primary hover:text-blue-700 font-semibold pt-1"
                  >
                    <span className="material-symbols-outlined text-2xl">open_in_new</span>
                    Fiche
                  </button>
                )}
              </div>
              {transport.chauffeur && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-slate-500 text-sm">person</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Chauffeur</p>
                    <p className="text-sm font-semibold text-navy">
                      {transport.chauffeur?.nom} {transport.chauffeur?.prenom}
                    </p>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── SECTION 6: Prescription PMT ──────────────────────────────────────── */}
          {(transport.prescriptions?.length > 0 || transport.ordonnance || transport.prescriptionId) && (
            <SectionCard title="Prescription médicale (PMT)" icon="description">
              {/* Linked Prescription entity */}
              {transport.prescriptionId && (
                <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold text-primary">{transport.prescriptionId.numero}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      transport.prescriptionId.statut === "active" ? "bg-emerald-100 text-emerald-700" :
                      transport.prescriptionId.statut === "expiree" ? "bg-red-100 text-red-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>{transport.prescriptionId.statut}</span>
                  </div>
                  <p className="text-sm font-semibold text-navy">{transport.prescriptionId.motif}</p>
                  {transport.prescriptionId.medecin?.nom && (
                    <p className="text-xs text-slate-500 mt-1">
                      Dr {transport.prescriptionId.medecin.nom} {transport.prescriptionId.medecin.prenom}
                    </p>
                  )}
                  {transport.prescriptionId.validee && (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-xs">verified</span>Validée
                    </span>
                  )}
                </div>
              )}
              {transport.prescriptions?.map((p, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-3 mb-2 last:mb-0">
                  <p className="text-sm font-semibold text-navy">
                    {p.medecin || p.prescripteur || "Prescripteur non renseigné"}
                  </p>
                  {p.dateEmission && (
                    <p className="text-xs text-slate-400 mt-0.5">Émise le {fmtDate(p.dateEmission)}</p>
                  )}
                  {p.motif && <p className="text-xs text-slate-500 mt-1">{p.motif}</p>}
                </div>
              ))}
              {transport.ordonnance && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                  {transport.ordonnance}
                </div>
              )}
            </SectionCard>
          )}

          {/* ── SECTION 7: Patient entité liée ───────────────────────────────────── */}
          {transport.patientId && (
            <SectionCard title="Dossier patient lié" icon="person_search">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary">person</span>
                </div>
                <div>
                  <p className="font-bold text-navy text-sm">
                    {transport.patientId.nom} {transport.patientId.prenom}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{transport.patientId.numeroPatient}</p>
                </div>
                <div className="ml-auto">
                  {transport.patientId.mobilite && (
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      transport.patientId.mobilite === "FAUTEUIL_ROULANT" ? "bg-amber-100 text-amber-700" :
                      ["ALLONGE","CIVIERE"].includes(transport.patientId.mobilite) ? "bg-red-100 text-red-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {transport.patientId.mobilite}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-0 divide-y divide-slate-50">
                {transport.patientId.telephone && (
                  <InfoRow icon="call" label="Téléphone">
                    <a href={`tel:${transport.patientId.telephone}`} className="text-sm font-semibold text-primary hover:underline">
                      {transport.patientId.telephone}
                    </a>
                  </InfoRow>
                )}
                {transport.patientId.oxygene && (
                  <InfoRow icon="air" label="Oxygène">
                    <span className="text-xs bg-sky-100 text-sky-700 font-semibold px-2 py-0.5 rounded-full">Requis</span>
                  </InfoRow>
                )}
                {transport.patientId.contactUrgence?.nom && (
                  <InfoRow icon="emergency" label="Contact urgence">
                    <p className="text-sm font-semibold text-navy">{transport.patientId.contactUrgence.nom}</p>
                    <p className="text-xs text-slate-500">{transport.patientId.contactUrgence.telephone} · {transport.patientId.contactUrgence.lien}</p>
                  </InfoRow>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── SECTION 8: Mission liée ───────────────────────────────────────────── */}
          {linkedMission && (
            <SectionCard title="Mission opérationnelle" icon="local_shipping">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  linkedMission.statut === "terminee" ? "bg-green-100 text-green-700" :
                  linkedMission.statut === "en_cours" ? "bg-amber-100 text-amber-700" :
                  linkedMission.statut === "annulee" ? "bg-red-100 text-red-700" :
                  "bg-blue-100 text-blue-700"
                }`}>
                  {linkedMission.statut}
                </span>
                <span className="text-xs text-slate-400 font-mono">{linkedMission.dispatchMode?.toUpperCase()}</span>
                {linkedMission.iaRecommendation?.confidence != null && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
                    IA {Math.round(linkedMission.iaRecommendation.confidence * 100)}%
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50">
                {linkedMission.vehicleId && (
                  <InfoRow icon="airport_shuttle" label="Véhicule" value={`${linkedMission.vehicleId.nom || ""} — ${linkedMission.vehicleId.immatriculation || ""}`} />
                )}
                {linkedMission.chauffeurId && (
                  <InfoRow icon="person" label="Chauffeur" value={`${linkedMission.chauffeurId.nom} ${linkedMission.chauffeurId.prenom}`} />
                )}
                {linkedMission.dureeReelleMinutes && (
                  <InfoRow icon="timer" label="Durée réelle" value={`${linkedMission.dureeReelleMinutes} min`} />
                )}
                {linkedMission.distanceReelleKm && (
                  <InfoRow icon="straighten" label="Distance réelle" value={`${linkedMission.distanceReelleKm} km`} />
                )}
              </div>
            </SectionCard>
          )}

          {/* ── SECTION 9: Facture liée ───────────────────────────────────────────── */}
          {linkedFacture && (
            <SectionCard title="Facture" icon="receipt_long">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono font-bold text-primary text-sm">{linkedFacture.numero}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  linkedFacture.statut === "payee" ? "bg-emerald-100 text-emerald-700" :
                  linkedFacture.statut === "annulee" ? "bg-red-100 text-red-700" :
                  linkedFacture.statut === "brouillon" ? "bg-slate-100 text-slate-600" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                  {linkedFacture.statut}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Total</p>
                  <p className="text-sm font-mono font-bold text-navy">
                    {linkedFacture.montantTotal != null ? `${linkedFacture.montantTotal.toFixed(2)} €` : "—"}
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-widest">CPAM</p>
                  <p className="text-sm font-mono font-bold text-emerald-700">
                    {linkedFacture.montantCPAM != null ? `${linkedFacture.montantCPAM.toFixed(2)} €` : "—"}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <p className="text-[10px] text-red-400 uppercase tracking-widest">Patient</p>
                  <p className="text-sm font-mono font-bold text-red-600">
                    {linkedFacture.montantPatient != null ? `${linkedFacture.montantPatient.toFixed(2)} €` : "—"}
                  </p>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── RIGHT: Timeline + notes ──────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ── SECTION 2: Timeline ─────────────────────────────────────────────── */}
          <SectionCard title="Suivi du transport" icon="timeline">
            <Timeline transport={transport} />
          </SectionCard>

          {/* Notes */}
          {transport.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">sticky_note_2</span>
                Notes
              </p>
              <p className="text-sm text-amber-800">{transport.notes}</p>
            </div>
          )}

          {/* Raison annulation / no-show */}
          {transport.raisonAnnulation && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-[10px] font-mono font-bold text-red-600 uppercase tracking-widest mb-1">
                Raison annulation
              </p>
              <p className="text-sm text-red-700">{transport.raisonAnnulation}</p>
            </div>
          )}
          {transport.raisonNoShow && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-[10px] font-mono font-bold text-orange-600 uppercase tracking-widest mb-1">
                Patient absent
              </p>
              <p className="text-sm text-orange-700">{transport.raisonNoShow}</p>
            </div>
          )}

          {/* Fiche transport */}
          <SectionCard title="Informations" icon="info">
            <InfoRow icon="tag" label="Référence" value={transport.numero} />
            <InfoRow icon="category" label="Type" value={transport.typeTransport} />
            <InfoRow icon="medical_services" label="Motif" value={transport.motif} />
            <InfoRow
              icon="event"
              label="Date RDV"
              value={`${fmtDate(transport.dateTransport)} à ${transport.heureRDV || "—"}`}
            />
            <InfoRow icon="add_circle" label="Créé le" value={fmtDatetime(transport.createdAt)} />
            {transport.recurrence?.active && (
              <InfoRow icon="repeat" label="Récurrence">
                <span className="inline-flex items-center gap-0.5 bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>repeat</span>
                  Série récurrente
                </span>
              </InfoRow>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── SECTION 7: Sticky action panel ──────────────────────────────────────── */}
      {hasActions && (
        <div className="fixed bottom-0 left-60 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-6 py-3 z-10 shadow-lg">
          <div className="flex items-center gap-2 max-w-5xl mx-auto flex-wrap">
            {peutAssigner && (
              <button
                onClick={() => setActiveModal("assigner")}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">airport_shuttle</span>
                {transport.vehicule ? "Réassigner un véhicule" : "Assigner un véhicule"}
              </button>
            )}
            {actionsStatut.map((a, i) =>
              a.modal ? (
                <button
                  key={i}
                  onClick={() => setActiveModal(a.modal)}
                  disabled={actionLoading}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 ${BTN[a.color] || BTN.blue}`}
                >
                  <span className="material-symbols-outlined text-base">{a.icon}</span>
                  {a.label}
                </button>
              ) : (
                <button
                  key={i}
                  onClick={() => doAction(a.fn)}
                  disabled={actionLoading}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 ${BTN[a.color] || BTN.blue}`}
                >
                  <span className="material-symbols-outlined text-base">{a.icon}</span>
                  {actionLoading ? "…" : a.label}
                </button>
              )
            )}
            {peutAnnuler && (
              <button
                onClick={handleAnnuler}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold text-sm transition-colors disabled:opacity-50 ml-auto"
              >
                <span className="material-symbols-outlined text-base">cancel</span>
                Annuler
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {activeModal === "assigner" && (
        <Modal title="Assigner un véhicule" onClose={closeModal}>
          <p className="text-xs text-slate-500 mb-3">
            Mobilité patient : <strong className="text-navy">{MOBILITE_LABELS[mobilitePatient] || mobilitePatient}</strong>
            {" — "}types compatibles : <strong className="text-primary">{typesCompatibles.join(", ")}</strong>
          </p>
          <select
            value={modalVehicle}
            onChange={(e) => setModalVehicle(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-primary bg-white"
          >
            <option value="">Choisir un véhicule compatible…</option>
            {vehiculesCompatibles.map((v) => (
              <option
                key={String(v._id || v.id)}
                value={String(v._id || v.id)}
                disabled={v.statut !== "disponible"}
                style={{ color: v.statut === "disponible" ? "#059669" : "#94a3b8" }}
              >
                {v.statut === "disponible" ? "✅" : "🔴"}{" "}
                {v.nom} — {v.immatriculation} ({v.type})
                {v.statut !== "disponible" ? ` — ${v.statut}` : " — Disponible"}
              </option>
            ))}
          </select>
          {vehiculesCompatibles.length === 0 && (
            <p className="text-sm text-red-500 mb-3">
              ❌ Aucun véhicule compatible ({typesCompatibles.join(", ")}) enregistré dans la flotte.
            </p>
          )}
          {vehiculesCompatibles.length > 0 && vehiculesCompatibles.every((v) => v.statut !== "disponible") && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              ⚠️ Tous les véhicules compatibles sont actuellement en mission. Vous pouvez quand même forcer l'assignation.
            </p>
          )}
          <div className="flex gap-3 mt-3">
            <button
              onClick={closeModal}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-semibold"
            >
              Fermer
            </button>
            <button
              onClick={handleAssigner}
              disabled={!modalVehicle || actionLoading}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                !modalVehicle || actionLoading
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-primary text-white hover:bg-blue-700"
              }`}
            >
              {actionLoading ? "⏳ Assignation…" : "✅ Confirmer l'assignation"}
            </button>
          </div>
        </Modal>
      )}

      {activeModal === "attente" && (
        <Modal title="Attente à destination" onClose={closeModal}>
          <p className="text-sm text-slate-500 mb-4">
            Durée estimée d'attente (dialyse, chimiothérapie, consultation…)
          </p>
          <div className="flex items-center gap-2 mb-5">
            <input
              type="number"
              min={0}
              max={480}
              value={modalDuree}
              onChange={(e) => setModalDuree(e.target.value)}
              placeholder="ex : 90"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-sm text-slate-500 font-semibold">min</span>
          </div>
          <div className="flex gap-3">
            <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={handleAttente}
              disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Démarrer l'attente"}
            </button>
          </div>
        </Modal>
      )}

      {activeModal === "retour" && (
        <Modal title="Retour base" onClose={closeModal}>
          <p className="text-sm text-slate-500 mb-5">
            Le kilométrage du véhicule sera mis à jour automatiquement via le calcul de distance destination → base.
          </p>
          <div className="flex gap-3">
            <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={handleRetour}
              disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Confirmer le retour"}
            </button>
          </div>
        </Modal>
      )}

      {activeModal === "reprogrammer" && (
        <Modal title="Reprogrammer le transport" onClose={closeModal}>
          <p className="text-sm text-slate-500 mb-4">
            Modifiez la date et/ou l'heure du transport. Le statut restera SCHEDULED.
          </p>
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">Nouvelle date</label>
              <input
                type="date"
                value={modalReprogDate}
                onChange={(e) => setModalReprogDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">Nouvelle heure</label>
              <input
                type="time"
                value={modalReprogHeure}
                onChange={(e) => setModalReprogHeure(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={handleReprogrammer}
              disabled={!modalReprogDate || actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Reprogrammer"}
            </button>
          </div>
        </Modal>
      )}

      {activeModal === "facturer" && (
        <Modal title="Clôture CPAM" onClose={closeModal}>
          <p className="text-sm text-slate-500 mb-4">
            Renseignez la référence de facture CPAM pour finaliser la clôture administrative.
          </p>
          <input
            type="text"
            value={modalFactureId}
            onChange={(e) => setModalFactureId(e.target.value)}
            placeholder="Référence ou numéro de facture"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-5 outline-none focus:border-primary"
          />
          <div className="flex gap-3">
            <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={handleFacturer}
              disabled={!modalFactureId.trim() || actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Clôturer"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
