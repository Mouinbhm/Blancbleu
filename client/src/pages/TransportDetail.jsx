// Fichier : client/src/pages/TransportDetail.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StatutBadge from "../components/transport/StatutBadge";
import TransportMap from "../components/map/TransportMap";
import { transportService, vehicleService, factureService, shiftService } from "../services/api";
import useSocket from "../hooks/useSocket";
import { getSocket, getOrCreateSocket } from "../services/socketService";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDRE_STATUTS = [
  "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
  "DRIVER_ACCEPTED", "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
  "COMPLETED", "BILLING_PENDING", "BILLED", "PAID",
];

const LABEL_COURT = {
  REQUESTED: "Demandé", CONFIRMED: "Confirmé", SCHEDULED: "Planifié",
  ASSIGNED: "Assigné", DRIVER_ACCEPTED: "Accepté", DRIVER_REJECTED: "Refusé",
  EN_ROUTE_TO_PICKUP: "En route", ARRIVED_AT_PICKUP: "Arrivé",
  PATIENT_ON_BOARD: "À bord", ARRIVED_AT_DESTINATION: "Destination",
  WAITING_AT_DESTINATION: "Attente", RETURN_TO_BASE: "Retour",
  COMPLETED: "Terminé", BILLING_PENDING: "Facturation", BILLED: "Facturé", PAID: "Payé",
  FAILED: "Échec",
};

const LABEL_TIMELINE = {
  REQUESTED:              "Demande reçue",
  CONFIRMED:              "Transport confirmé",
  SCHEDULED:              "Transport planifié",
  ASSIGNED:               "Véhicule assigné",
  DRIVER_ACCEPTED:        "Mission acceptée par le chauffeur",
  DRIVER_REJECTED:        "Mission refusée par le chauffeur",
  EN_ROUTE_TO_PICKUP:     "En route vers le patient",
  ARRIVED_AT_PICKUP:      "Arrivé chez le patient",
  PATIENT_ON_BOARD:       "Patient pris en charge",
  ARRIVED_AT_DESTINATION: "Arrivé à destination",
  WAITING_AT_DESTINATION: "En attente à destination",
  RETURN_TO_BASE:         "Retour base en cours",
  COMPLETED:              "Transport terminé",
  BILLING_PENDING:        "Facturation en cours",
  BILLED:                 "Facturé CPAM",
  PAID:                   "Paiement reçu",
  CANCELLED:              "Transport annulé",
  NO_SHOW:                "Patient absent",
  RESCHEDULED:            "Reprogrammé",
  FAILED:                 "Échec du transport",
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
  REQUESTED:  [{ label: "Confirmer la demande", fn: "confirmer", color: "blue", icon: "check_circle" }],
  CONFIRMED:  [{ label: "Planifier", fn: "planifier", color: "indigo", icon: "calendar_month" }],
  SCHEDULED:  [{ label: "Reprogrammer", color: "indigo", icon: "event_repeat", modal: "reprogrammer" }],
  ASSIGNED: [
    { label: "Accepter",   fn: "accepterDriver", color: "teal",   icon: "thumb_up",      terrain: true },
    { label: "Refuser",    fn: "refuserDriver",  color: "orange", icon: "thumb_down",    terrain: true },
    { label: "En route",   fn: "enRoute",        color: "orange", icon: "directions_car", terrain: true },
  ],
  DRIVER_ACCEPTED:      [{ label: "En route", fn: "enRoute", color: "orange", icon: "directions_car", terrain: true }],
  DRIVER_REJECTED:      [{ label: "Reprogrammer", color: "indigo", icon: "event_repeat", modal: "reprogrammer" }],
  EN_ROUTE_TO_PICKUP:   [{ label: "Arrivé chez le patient", fn: "arriveePatient",     color: "yellow", icon: "location_on",     terrain: true }],
  ARRIVED_AT_PICKUP:    [{ label: "Patient à bord",         fn: "patientABord",       color: "cyan",   icon: "personal_injury", terrain: true }],
  PATIENT_ON_BOARD:     [{ label: "Arrivé à destination",   fn: "arriveeDestination", color: "teal",   icon: "flag",            terrain: true }],
  ARRIVED_AT_DESTINATION: [
    { label: "Attente patient", color: "violet", icon: "hourglass",    modal: "attente", terrain: true },
    { label: "Retour base",     color: "slate",  icon: "home",         modal: "retour",  terrain: true },
    { label: "Terminer",        fn: "completer", color: "green", icon: "check_circle",  terrain: true },
  ],
  WAITING_AT_DESTINATION: [
    { label: "Retour base", color: "slate", icon: "home", modal: "retour", terrain: true },
  ],
  RETURN_TO_BASE:  [{ label: "Terminer le transport", fn: "completer", color: "green", icon: "check_circle", terrain: true }],
  COMPLETED: [
    { label: "Facturation en cours", fn: "billingPending", color: "indigo", icon: "pending_actions" },
    { label: "Clôturer (CPAM)",      color: "purple",      icon: "receipt_long", modal: "facturer" },
  ],
  BILLING_PENDING: [{ label: "Clôturer (CPAM)", color: "purple", icon: "receipt_long", modal: "facturer" }],
  BILLED: [{ label: "Marquer payé", fn: "paid", color: "green", icon: "payments" }],
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
  const [toast, setToast] = useState(null);
  const [vehiclePosition, setVehiclePosition] = useState(null);
  const [posLive, setPosLive] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [isLive, setIsLive] = useState(false);

  // Linked entities
  const [linkedFacture, setLinkedFacture] = useState(null);

  // PART A — Timeline enrichie (statusLog)
  const [statusLog, setStatusLog] = useState([]);

  // PART B — Signature
  const [signerName, setSignerName] = useState("");
  const [sigLoading, setSigLoading] = useState(false);
  const sigFileRef = useRef(null);

  // PART C — PMT
  const [pmtDocs, setPmtDocs] = useState([]);
  const [pmtLoading, setPmtLoading] = useState(false);
  const pmtFileRef = useRef(null);

  // PART D — PDF
  const [pdfLoading, setPdfLoading] = useState(false);

  // Modal: null | 'assigner' | 'attente' | 'retour' | 'facturer' | 'reprogrammer'
  const [activeModal, setActiveModal] = useState(null);
  const [modalVehicle, setModalVehicle] = useState("");
  const [modalShift, setModalShift]   = useState("");
  const [activeShifts, setActiveShifts] = useState([]);
  const [modalDuree, setModalDuree] = useState("");
  const [modalFactureId,       setModalFactureId]       = useState("");
  const [facturesDisponibles,  setFacturesDisponibles]  = useState([]);
  const [facturesLoading,      setFacturesLoading]      = useState(false);
  const [modalReprogDate, setModalReprogDate] = useState("");
  const [modalReprogHeure, setModalReprogHeure] = useState("");
  const closeModal = () => { setActiveModal(null); setModalFactureId(""); setFacturesDisponibles([]); };

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

    factureService.getAll({ limit: 5 })
      .then(({ data }) => {
        const f = (data?.factures || []).find(
          (fac) => fac.transportId?._id === transport._id || fac.transportId === transport._id
        );
        setLinkedFacture(f || null);
      })
      .catch(() => {});

    // PART A — charger la timeline enrichie
    if (transport._id) {
      transportService.getTimeline(transport._id)
        .then(({ data }) => setStatusLog(data?.timeline || []))
        .catch(() => {});
    }

    // PART C — charger les documents PMT
    if (transport._id) {
      transportService.getPmt(transport._id)
        .then(({ data }) => setPmtDocs(data?.documents || []))
        .catch(() => {});
    }
  }, [transport]);

  useEffect(() => {
    vehicleService.getAll().then(({ data }) => {
      setVehicles(Array.isArray(data) ? data : data?.data || data?.vehicles || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeModal !== "assigner") return;
    shiftService.getToday()
      .then(({ data }) => setActiveShifts(data?.shifts || []))
      .catch(() => setActiveShifts([]));
  }, [activeModal]);

  useEffect(() => {
    if (activeModal !== "facturer") return;
    setFacturesLoading(true);
    factureService.getAll({ limit: 200 })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data?.factures || data?.data || [];
        setFacturesDisponibles(list.filter((f) => f.statut !== "annulee"));
      })
      .catch(() => setFacturesDisponibles([]))
      .finally(() => setFacturesLoading(false));
  }, [activeModal]);

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

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const doAction = async (fn, ...args) => {
    setActionLoading(true);
    try {
      await transportService[fn](id, ...args);
      await loadTransport();
      closeModal();
      showToast("Action effectuée avec succès");
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur lors de l'action", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAnnuler = async () => {
    const raison = window.prompt("Raison de l'annulation :");
    if (raison === null) return;
    await doAction("annuler", raison);
  };

  const handleRefuserDriver = async () => {
    const raison = window.prompt("Raison du refus (optionnel) :");
    if (raison === null) return;
    await doAction("refuserDriver", raison || undefined);
  };

  const handleFail = async () => {
    const raison = window.prompt("Raison de l'échec :");
    if (raison === null) return;
    await doAction("fail", raison);
  };

  const handleAssigner = () => {
    if (!modalShift) return;
    doAction("assigner", { shiftId: modalShift });
  };

  const handleAttente = () => {
    doAction("attendreDestination", modalDuree ? parseInt(modalDuree, 10) : null);
  };

  const handleRetour = () => {
    doAction("retourBase", null);
  };

  const handleFacturer = () => {
    if (!modalFactureId) return;
    doAction("facturer", { factureId: modalFactureId });
  };

  // PART B — Signature
  const handleAddSignature = async () => {
    if (!signerName.trim()) { showToast("Le nom du signataire est requis", "error"); return; }
    setSigLoading(true);
    try {
      const file = sigFileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("signature", file);
        fd.append("signedByName", signerName);
        await transportService.addSignatureFile(id, fd);
      } else {
        await transportService.addSignature(id, { signedByName: signerName });
      }
      await loadTransport();
      setSignerName("");
      if (sigFileRef.current) sigFileRef.current.value = "";
      showToast("Signature enregistrée avec succès");
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur lors de l'enregistrement de la signature", "error");
    } finally { setSigLoading(false); }
  };

  // PART C — PMT
  const handleUploadPmt = async () => {
    const file = pmtFileRef.current?.files?.[0];
    if (!file) { showToast("Sélectionnez un fichier PMT", "error"); return; }
    setPmtLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("triggerOcr", "true");
      await transportService.uploadPmt(id, fd);
      if (pmtFileRef.current) pmtFileRef.current.value = "";
      const { data } = await transportService.getPmt(id);
      setPmtDocs(data?.documents || []);
      showToast("PMT ajoutée avec succès");
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur lors de l'upload PMT", "error");
    } finally { setPmtLoading(false); }
  };

  const handleDeletePmt = async (docId) => {
    if (!window.confirm("Supprimer ce document PMT ?")) return;
    try {
      await transportService.deletePmt(id, docId);
      setPmtDocs((prev) => prev.filter((d) => d._id !== docId));
      showToast("Document PMT supprimé");
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur lors de la suppression", "error");
    }
  };

  // PART D — PDF export
  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const response = await transportService.exportPdf(id);
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `mission_${transport.numero}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast("PDF généré");
    } catch {
      showToast("Impossible de générer le PDF", "error");
    } finally { setPdfLoading(false); }
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
      showToast("Transport reprogrammé");
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur lors de la reprogrammation", "error");
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

  // ── Validation jour J ────────────────────────────────────────────────────────
  const _dateT = transport.dateTransport ? new Date(transport.dateTransport) : null;
  const _debutAujourdhui = new Date(); _debutAujourdhui.setHours(0, 0, 0, 0);
  const _finDemain = new Date(); _finDemain.setDate(_finDemain.getDate() + 1); _finDemain.setHours(23, 59, 59, 999);
  // Fenêtre opérationnelle : aujourd'hui OU demain (J+1). Les dates passées sont exclues.
  const estJourJ = !_dateT || (_dateT >= _debutAujourdhui && _dateT <= _finDemain);
  // Date entièrement dépassée (avant aujourd'hui 00:00)
  const dateDepassee = !!_dateT && _dateT < _debutAujourdhui;
  const dateTransportFormatee = _dateT
    ? _dateT.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const peutAnnuler = !["BILLED", "PAID", "CANCELLED", "NO_SHOW", "FAILED"].includes(transport.statut);
  const peutEchouer = !["BILLED", "PAID", "CANCELLED", "NO_SHOW", "FAILED", "COMPLETED", "BILLING_PENDING"].includes(transport.statut);
  // Assigner est bloqué si la date est entièrement dépassée — reprogrammer d'abord
  const peutAssigner = ["CONFIRMED", "SCHEDULED"].includes(transport.statut) && !dateDepassee;
  const actionsStatut = ACTIONS_PAR_STATUT[transport.statut] || [];
  const hasActions = actionsStatut.length > 0 || peutAnnuler || peutEchouer || peutAssigner;

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
      if (a.statut === "Disponible" && b.statut !== "Disponible") return -1;
      if (b.statut === "Disponible" && a.statut !== "Disponible") return 1;
      return typesTries.indexOf(a.type) - typesTries.indexOf(b.type);
    });

  return (
    <div className="pb-24 fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse-dot { 0%,100% { opacity:1 } 50% { opacity:.3 } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[9999] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 transition-all ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`}>
          {toast.type === "error" ? "⚠️" : "✅"} {toast.msg}
        </div>
      )}

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
          <button
            onClick={handleExportPdf}
            disabled={pdfLoading}
            title="Télécharger la fiche mission PDF"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors disabled:opacity-50 self-start"
          >
            <span className="material-symbols-outlined text-base text-red-500">picture_as_pdf</span>
            {pdfLoading ? "…" : "PDF"}
          </button>
        </div>
        <ProgressBar statut={transport.statut} />

        {/* ── Badge jour J / date future / date dépassée ────────────────────── */}
        {["REQUESTED","CONFIRMED","SCHEDULED","ASSIGNED"].includes(transport.statut) && _dateT && (
          dateDepassee ? (
            <div className="mt-2 flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-1.5 font-medium">
              ⚠️ Date dépassée — transport du {dateTransportFormatee} non effectué. Reprogrammer avant d'assigner.
            </div>
          ) : estJourJ ? (
            <div className="mt-2 flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 font-medium">
              ✅ Transport du jour — actions terrain disponibles
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-1.5 font-medium">
              ⏳ Transport planifié — actions terrain disponibles le {dateTransportFormatee}{transport.heureRDV ? ` à ${transport.heureRDV}` : ""}
            </div>
          )
        )}
      </div>

      {/* ── Bannière véhicule assigné / en attente départ (Tâche 4) ───────── */}
      {transport.statut === "ASSIGNED" && transport.vehicule && (
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <span className="text-xl flex-shrink-0">🚐</span>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-slate-700">
                Véhicule assigné — en attente de départ
              </span>
              <span className="text-xs text-slate-500 ml-2">
                {transport.vehicule.nom} · {transport.vehicule.immatriculation}
                {dateTransportFormatee && transport.heureRDV
                  ? ` · Départ le ${dateTransportFormatee} à ${transport.heureRDV}`
                  : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Bannière GPS temps réel — uniquement en mouvement ET jour J ──────── */}
      {posLive && estJourJ && ["EN_ROUTE_TO_PICKUP","ARRIVED_AT_PICKUP","PATIENT_ON_BOARD","ARRIVED_AT_DESTINATION","WAITING_AT_DESTINATION","RETURN_TO_BASE"].includes(transport.statut) && (
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

      {/* ── Bannière alerte — statut terrain incohérent (date future) ─────────── */}
      {["EN_ROUTE_TO_PICKUP","ARRIVED_AT_PICKUP","PATIENT_ON_BOARD","ARRIVED_AT_DESTINATION","WAITING_AT_DESTINATION","RETURN_TO_BASE"].includes(transport.statut) && !estJourJ && (
        <div className="bg-orange-50 border-b border-orange-300 px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-start gap-3 text-orange-800">
            <span className="text-xl flex-shrink-0 mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-semibold">Statut terrain incorrect</p>
              <p className="text-xs mt-0.5 text-orange-700">
                Ce transport est planifié le <strong>{dateTransportFormatee}</strong>. Il a été passé en statut terrain par erreur (simulation ou seed).
                Les actions restent verrouillées jusqu'à cette date.
              </p>
            </div>
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

          {/* ── PART B: Preuve de prise en charge ───────────────────────────────── */}
          {(["ARRIVED_AT_DESTINATION","COMPLETED","BILLING_PENDING","BILLED","PAID"].includes(transport.statut) || transport.proofOfCare?.signed) && (
            <SectionCard title="Preuve de prise en charge" icon="draw">
              {transport.proofOfCare?.signed ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-full">
                      <span className="material-symbols-outlined text-xs">verified</span>
                      Signé
                    </span>
                    <span className="text-xs text-slate-400">{fmtDatetime(transport.proofOfCare.signedAt)}</span>
                  </div>
                  <InfoRow icon="person" label="Signataire" value={transport.proofOfCare.signedByName || "—"} />
                  {transport.proofOfCare.signatureImageUrl && (
                    <div className="mt-3">
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1">Signature</p>
                      <img
                        src={transport.proofOfCare.signatureImageUrl}
                        alt="Signature"
                        className="max-h-20 border border-slate-200 rounded-lg bg-white p-1"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-slate-500 mb-3">Enregistrez la signature du patient ou de son représentant.</p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Nom du signataire *"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    <div>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1">Image de signature (optionnel)</p>
                      <input
                        ref={sigFileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        className="text-xs text-slate-600 file:mr-2 file:text-xs file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:font-semibold hover:file:bg-slate-200"
                      />
                    </div>
                    <button
                      onClick={handleAddSignature}
                      disabled={sigLoading || !signerName.trim()}
                      className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">draw</span>
                      {sigLoading ? "Enregistrement…" : "Enregistrer la signature"}
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── PART C: Documents PMT ───────────────────────────────────────────── */}
          <SectionCard title="Documents PMT" icon="upload_file">
            <div className="mb-3 flex items-center gap-2">
              <input
                ref={pmtFileRef}
                type="file"
                accept=".pdf,image/jpeg,image/jpg,image/png"
                className="flex-1 min-w-0 text-xs text-slate-600 file:mr-2 file:text-xs file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:font-semibold hover:file:bg-slate-200"
              />
              <button
                onClick={handleUploadPmt}
                disabled={pmtLoading}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">upload</span>
                {pmtLoading ? "…" : "Ajouter"}
              </button>
            </div>
            {pmtDocs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Aucun document PMT associé</p>
            ) : (
              <div className="space-y-2">
                {pmtDocs.map((doc) => (
                  <div key={doc._id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="material-symbols-outlined text-slate-400 text-base flex-shrink-0">description</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{doc.fileName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-[10px] text-slate-400">{fmtDatetime(doc.uploadedAt)}</p>
                          {doc.ocrStatus && doc.ocrStatus !== "skipped" && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              doc.ocrStatus === "done"       ? "bg-emerald-100 text-emerald-700" :
                              doc.ocrStatus === "processing" ? "bg-blue-100 text-blue-700" :
                              doc.ocrStatus === "error"      ? "bg-red-100 text-red-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              OCR {doc.ocrStatus === "done" ? "✓" : doc.ocrStatus === "error" ? "✗" : "…"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center hover:bg-blue-100"
                          title="Voir le document"
                        >
                          <span className="material-symbols-outlined text-primary text-sm">open_in_new</span>
                        </a>
                      )}
                      <button
                        onClick={() => handleDeletePmt(doc._id)}
                        className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100"
                        title="Supprimer"
                      >
                        <span className="material-symbols-outlined text-red-600 text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── RIGHT: Timeline + notes ──────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ── SECTION 2: Timeline ─────────────────────────────────────────────── */}
          <SectionCard title="Suivi du transport" icon="timeline">
            <Timeline transport={transport} />
          </SectionCard>

          {/* ── PART A: Historique détaillé (statusLog) ─────────────────────────── */}
          {statusLog.length > 0 && (
            <SectionCard title="Historique détaillé" icon="history">
              <div>
                {statusLog.slice().reverse().map((entry, i) => (
                  <div key={entry._id || i} className="flex gap-3 py-2.5 border-b border-slate-50 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-navy">
                          {LABEL_TIMELINE[entry.to] || entry.to}
                        </p>
                        <p className="text-[10px] text-slate-400 flex-shrink-0">{fmtDatetime(entry.changedAt)}</p>
                      </div>
                      {(entry.changedByRole || entry.changedBy) && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {entry.changedByRole || "système"}
                          {entry.changedBy?.nom ? ` · ${entry.changedBy.nom} ${entry.changedBy.prenom || ""}` : ""}
                        </p>
                      )}
                      {entry.reason && (
                        <p className="text-[10px] text-slate-400 italic mt-0.5">{entry.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

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
          {["EN_ROUTE_TO_PICKUP","ARRIVED_AT_PICKUP","PATIENT_ON_BOARD","ARRIVED_AT_DESTINATION","WAITING_AT_DESTINATION","RETURN_TO_BASE"].includes(transport.statut) && !estJourJ && (
            <div className="max-w-5xl mx-auto mb-2 flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-lg px-3 py-1.5 text-xs text-orange-800">
              <span className="flex-shrink-0">⚠️</span>
              <span>Statut terrain incorrect — planifié le <strong>{dateTransportFormatee}</strong>. Actions verrouillées jusqu'à cette date.</span>
            </div>
          )}
          {dateDepassee && ["CONFIRMED","SCHEDULED"].includes(transport.statut) && (
            <div className="max-w-5xl mx-auto mb-2 flex items-center gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-1.5 text-xs text-red-800">
              <span className="flex-shrink-0">⚠️</span>
              <span>Date dépassée ({dateTransportFormatee}) — reprogrammer le transport avant de pouvoir l'assigner.</span>
            </div>
          )}
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
            {actionsStatut.map((a, i) => {
              const bloque = a.terrain && !estJourJ;
              return a.modal ? (
                <div key={i} className="flex flex-col items-center">
                  <button
                    onClick={bloque ? undefined : () => setActiveModal(a.modal)}
                    disabled={actionLoading || bloque}
                    title={bloque ? `Disponible le ${dateTransportFormatee}` : undefined}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                      bloque
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                        : `${BTN[a.color] || BTN.blue} disabled:opacity-50`
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{bloque ? "lock" : a.icon}</span>
                    {bloque ? `🔒 ${a.label}` : a.label}
                  </button>
                  {bloque && dateTransportFormatee && (
                    <p className="text-[10px] text-slate-400 mt-1 text-center">🗓 Disponible le {dateTransportFormatee}</p>
                  )}
                </div>
              ) : (
                <div key={i} className="flex flex-col items-center">
                  <button
                    onClick={bloque ? undefined : () => {
                      if (a.fn === "refuserDriver") return handleRefuserDriver();
                      if (a.fn === "fail") return handleFail();
                      doAction(a.fn);
                    }}
                    disabled={actionLoading || bloque}
                    title={bloque ? `Disponible le ${dateTransportFormatee}` : undefined}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                      bloque
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                        : `${BTN[a.color] || BTN.blue} disabled:opacity-50`
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{bloque ? "lock" : a.icon}</span>
                    {bloque ? `🔒 ${a.label}` : (actionLoading ? "…" : a.label)}
                  </button>
                  {bloque && dateTransportFormatee && (
                    <p className="text-[10px] text-slate-400 mt-1 text-center">🗓 Disponible le {dateTransportFormatee}</p>
                  )}
                </div>
              );
            })}
            {peutEchouer && (
              <button
                onClick={handleFail}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 font-semibold text-sm transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">error</span>
                Échec
              </button>
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
        <Modal title="Assigner à un shift" onClose={closeModal}>
          <p className="text-xs text-slate-500 mb-3">
            Sélectionnez le shift actif auquel assigner ce transport.
            Le chauffeur et le véhicule seront déduits automatiquement.
          </p>
          {activeShifts.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-3">
              ⚠️ Aucun shift actif pour aujourd'hui. Un ambulancier doit d'abord démarrer son shift depuis l'application mobile.
            </div>
          ) : (
            <select
              value={modalShift}
              onChange={(e) => setModalShift(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-primary bg-white"
            >
              <option value="">Choisir un shift actif…</option>
              {activeShifts.map((s) => {
                const driver  = s.personnelId;
                const vehicle = s.vehicleId;
                const name    = driver  ? `${driver.prenom} ${driver.nom}` : "—";
                const plate   = vehicle ? vehicle.immatriculation : "—";
                const type    = vehicle ? vehicle.type : "";
                const count   = s.transportCount ?? 0;
                return (
                  <option key={String(s._id)} value={String(s._id)}>
                    {name} — {plate} {type ? `(${type})` : ""} · {count} transport{count !== 1 ? "s" : ""}
                  </option>
                );
              })}
            </select>
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
              disabled={!modalShift || actionLoading || activeShifts.length === 0}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                !modalShift || actionLoading || activeShifts.length === 0
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
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setModalReprogDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">Nouvelle heure</label>
              <input
                type="time"
                value={modalReprogHeure}
                min={
                  modalReprogDate === new Date().toISOString().split("T")[0]
                    ? `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`
                    : undefined
                }
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
            Sélectionnez la facture CPAM enregistrée dans la plateforme pour finaliser la clôture administrative.
          </p>

          {facturesLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-3 mb-5">
              <div className="w-4 h-4 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
              Chargement des factures…
            </div>
          ) : facturesDisponibles.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-5">
              Aucune facture disponible dans la plateforme.
            </p>
          ) : (
            <div className="mb-5 space-y-2">
              {facturesDisponibles.map((f) => {
                const label = [
                  f.numero || "—",
                  f.patientNom ? `${f.patientNom} ${f.patientPrenom || ""}`.trim() : null,
                  f.montantTotal != null ? `${f.montantTotal.toFixed(2)} €` : null,
                ].filter(Boolean).join(" · ");
                const statutColors = {
                  brouillon:   "bg-slate-100 text-slate-600",
                  emise:       "bg-blue-100 text-blue-700",
                  en_attente:  "bg-yellow-100 text-yellow-700",
                  payee:       "bg-green-100 text-green-700",
                };
                const isSelected = modalFactureId === f._id;
                return (
                  <button
                    key={f._id}
                    type="button"
                    onClick={() => setModalFactureId(f._id)}
                    className={`w-full text-left px-3 py-3 rounded-xl border-2 transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? "border-purple-500 bg-purple-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isSelected ? "text-purple-800" : "text-navy"}`}>
                        {f.numero || "Sans numéro"}
                      </p>
                      {(f.patientNom || f.patientPrenom) && (
                        <p className="text-xs text-slate-500 truncate">
                          {`${f.patientNom || ""} ${f.patientPrenom || ""}`.trim()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.montantTotal != null && (
                        <span className="text-sm font-mono font-bold text-slate-700">
                          {f.montantTotal.toFixed(2)} €
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statutColors[f.statut] || "bg-slate-100 text-slate-600"}`}>
                        {f.statut}
                      </span>
                      {isSelected && (
                        <span className="material-symbols-outlined text-purple-600 text-base">check_circle</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={handleFacturer}
              disabled={!modalFactureId || actionLoading}
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
