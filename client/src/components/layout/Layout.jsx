// Fichier : client/src/components/layout/Layout.jsx
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import useSocket from "../../hooks/useSocket";
import { useSocketSync } from "../../hooks/useSocketSync";
import useNotifications from "../../hooks/useNotifications";
import { useAutoDispatchQueueCount } from "../../hooks/queries/useAutoDispatchQueue";
import DispatcherChat from "./DispatcherChat";
import PushNotificationsToggle from "../PushNotificationsToggle";
import api from "../../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

const NAV_OPERATIONS = [
  { path: "/dashboard",       icon: "dashboard",       label: "Tableau de bord" },
  { path: "/transports",      icon: "directions_car",  label: "Transports"      },
  { path: "/auto-dispatch",   icon: "smart_toy",       label: "Auto-dispatch", badgeKey: "autoDispatch" },
  { path: "/planning",        icon: "calendar_month",  label: "Planning"        },
  { path: "/suivi-en-direct", icon: "location_on",     label: "Suivi en direct" },
  { path: "/shifts",          icon: "schedule",        label: "Shifts"          },
  { path: "/patients",        icon: "personal_injury", label: "Patients"        },
];

const NAV_GESTION = [
  { path: "/flotte",       icon: "airport_shuttle",      label: "Flotte"        },
  { path: "/personnel",    icon: "badge",                label: "Personnel"     },
  { path: "/factures",     icon: "account_balance_wallet",label: "Comptabilité" },
  { path: "/aide-ia",      icon: "psychology",           label: "Aide IA"       },
];

const NAV_ADMIN = [
  { path: "/utilisateurs",          icon: "manage_accounts", label: "Utilisateurs" },
  { path: "/admin/dispatch-config", icon: "tune",            label: "Pondérations IA" },
];

const pageTitles = {
  "/dashboard":       "Tableau de bord — Vue opérationnelle",
  "/transports":      "Transports — Gestion des transports",
  "/transports/new":  "Nouveau transport",
  "/planning":        "Planning — Organisation journalière",
  "/flotte":          "Flotte — Véhicules sanitaires",
  "/patients":        "Patients — Dossiers patients",
  "/personnel":       "Personnel — Équipes",
  "/factures":        "Comptabilité — Finances & Facturation",
  "/aide-ia":         "Aide IA — Optimisation",
  "/utilisateurs":    "Utilisateurs — Gestion des accès",
  "/suivi-en-direct": "Suivi en direct — Positions GPS",
  "/shifts":          "Shifts — Activité des chauffeurs",
  "/admin/dispatch-config": "Pondérations IA — Scoring dispatch",
  "/auto-dispatch":         "Auto-dispatch — File de validation",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers notifications
// ─────────────────────────────────────────────────────────────────────────────

const NOTIF_PALETTE = {
  // bleu
  blue:   { bg: "bg-blue-100",   icon: "text-blue-600",   dot: "bg-blue-500",   ring: "border-blue-100"  },
  // vert
  green:  { bg: "bg-green-100",  icon: "text-green-600",  dot: "bg-green-500",  ring: "border-green-100" },
  // orange
  orange: { bg: "bg-orange-100", icon: "text-orange-600", dot: "bg-orange-500", ring: "border-orange-100"},
  // jaune/ambre
  yellow: { bg: "bg-amber-100",  icon: "text-amber-600",  dot: "bg-amber-500",  ring: "border-amber-100" },
  // rouge
  red:    { bg: "bg-red-100",    icon: "text-red-600",    dot: "bg-red-500",    ring: "border-red-100"   },
};

const TYPE_META = {
  // Transport
  TRANSPORT_CREATED:       { icon: "directions_car",    color: "blue"   },
  TRANSPORT_ASSIGNED:      { icon: "directions_car",    color: "blue"   },
  TRANSPORT_STATUS_CHANGED:{ icon: "sync",              color: "blue"   },
  TRANSPORT_COMPLETED:     { icon: "check_circle",      color: "green"  },
  TRANSPORT_CANCELLED:     { icon: "cancel",            color: "red"    },
  TRANSPORT_RESCHEDULED:   { icon: "event_repeat",      color: "yellow" },
  DRIVER_ASSIGNED:         { icon: "person_pin",        color: "blue"   },
  DRIVER_ACCEPTED:         { icon: "thumb_up",          color: "green"  },
  DRIVER_REJECTED:         { icon: "thumb_down",        color: "red"    },
  DELAY_ALERT:             { icon: "warning",           color: "orange" },
  NO_SHOW:                 { icon: "person_off",        color: "orange" },
  INVOICE_READY:           { icon: "receipt_long",      color: "green"  },
  PAYMENT_SUCCEEDED:       { icon: "payments",          color: "green"  },
  PAYMENT_FAILED:          { icon: "money_off",         color: "red"    },
  MAINTENANCE_ALERT:       { icon: "build",             color: "yellow" },
  VEHICLE_BLOCKED:         { icon: "block",             color: "red"    },
  SYSTEM_ALERT:            { icon: "info",              color: "blue"   },
  // Événements socket directs
  "transport:assigned":    { icon: "directions_car",    color: "blue"   },
  "transport:late":        { icon: "warning",           color: "orange" },
  "vehicle:maintenance":   { icon: "build",             color: "yellow" },
  "shift:started":         { icon: "play_circle",       color: "green"  },
  "shift:ended":           { icon: "stop_circle",       color: "green"  },
  "pmt:expiring":          { icon: "description",       color: "red"    },
  "surcharge:critical":    { icon: "priority_high",     color: "red"    },
};

function getMeta(type) {
  return TYPE_META[type] || { icon: "notifications", color: "blue" };
}

function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const LS_KEY = "bb_notifs_local";

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((n) => ({ ...n, time: new Date(n.time) }));
  } catch { return []; }
}

function saveToLS(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50))); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Son de notification
// ─────────────────────────────────────────────────────────────────────────────

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant
// ─────────────────────────────────────────────────────────────────────────────

export default function Layout() {
  const location  = useLocation();
  const { user, logout } = useAuth();
  const navigate  = useNavigate();

  const [shiftTime,    setShiftTime]    = useState("00:00:00");
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [toasts,       setToasts]       = useState([]);
  const [sosAlert,     setSosAlert]     = useState(null);
  const [activeDrivers,setActiveDrivers]= useState([]);

  // Notifications locales (socket direct + localStorage)
  const [localNotifs, setLocalNotifs] = useState(() => loadFromLS());

  const notifRef = useRef(null);
  const { connected, subscribe } = useSocket();

  // Branche les events Socket.IO sur l'invalidation React Query (étape Sprint 3.5).
  // À ne monter qu'une seule fois — Layout est le wrapper authentifié unique.
  useSocketSync();

  // Notifications persistées (MongoDB via API)
  const {
    unreadCount:     notifUnreadCount,
    notifications:   notifList,
    toasts:          notifToasts,
    markAsRead:      markNotifAsRead,
    markAllAsRead:   markAllNotifsAsRead,
    dismissToast:    dismissNotifToast,
  } = useNotifications();

  // ── Persistence localStorage des notifs locales ───────────────────────────
  useEffect(() => { saveToLS(localNotifs); }, [localNotifs]);

  // ── Helper : ajouter une notif locale ─────────────────────────────────────
  const addLocalNotif = useCallback((notif) => {
    const item = {
      id:      `socket_${Date.now()}_${Math.random()}`,
      type:    notif.type || "SYSTEM_ALERT",
      title:   notif.title || "Notification",
      message: notif.message || notif.sub || "",
      time:    new Date(),
      read:    false,
      path:    notif.path || null,
    };
    setLocalNotifs((prev) => [item, ...prev].slice(0, 50));
  }, []);

  // ── Merge : MongoDB + local, triés par date, dédupliqués ──────────────────
  const allNotifs = (() => {
    const dbItems = notifList.map((n) => ({
      id:       String(n._id),
      _id:      n._id,
      type:     n.type,
      title:    n.title,
      message:  n.message,
      time:     new Date(n.createdAt),
      read:     n.read,
      path:     n.transportId ? `/transports/${n.transportId}` : null,
      source:   "db",
    }));
    const localItems = localNotifs.map((n) => ({ ...n, source: "local" }));
    const merged = [...dbItems, ...localItems];
    merged.sort((a, b) => b.time - a.time);
    // Dédupliquation par title+time approximatif (évite les doublons socket/db)
    const seen = new Set();
    return merged.filter((n) => {
      const key = `${n.title}_${Math.floor(n.time / 60000)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50);
  })();

  const totalUnread = allNotifs.filter((n) => !n.read).length;

  // Badge compteur auto-dispatch (file de validation HITL)
  const { data: autoDispatchCount = 0 } = useAutoDispatchQueueCount();

  // ── Fermeture clic extérieur ──────────────────────────────────────────────
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // ── Marquer toutes les locales comme lues ─────────────────────────────────
  const markAllRead = useCallback(() => {
    markAllNotifsAsRead();
    setLocalNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [markAllNotifsAsRead]);

  // ── Marquer une notif comme lue (DB ou locale) ────────────────────────────
  const markOneRead = useCallback((notif) => {
    if (notif.read) return;
    if (notif.source === "db" && notif._id) {
      markNotifAsRead(notif._id);
    } else {
      setLocalNotifs((prev) =>
        prev.map((n) => n.id === notif.id ? { ...n, read: true } : n)
      );
    }
  }, [markNotifAsRead]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const removeToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // ── Socket : nouveau transport (App patient) ──────────────────────────────
  useEffect(() => {
    return subscribe("transport:created", (data) => {
      playNotifSound();
      addLocalNotif({
        type:    "TRANSPORT_CREATED",
        title:   `Nouveau transport — ${data.motif || ""}`,
        message: `${data.patient?.nom || "Patient"} · ${data.typeTransport || ""}`,
        path:    `/transports/${data._id}`,
      });
      const toastId = Date.now();
      setToasts((prev) => [
        { id: toastId, data, path: `/transports/${String(data._id)}` },
        ...prev,
      ].slice(0, 3));
      setTimeout(() => removeToast(toastId), 6000);
    });
  }, [subscribe, addLocalNotif]);

  // ── Socket : véhicule/chauffeur assigné ───────────────────────────────────
  useEffect(() => {
    return subscribe("transport:assigned", (data) => {
      addLocalNotif({
        type:    "transport:assigned",
        title:   "Véhicule assigné",
        message: data.numero ? `Transport ${data.numero} — véhicule affecté` : "Un véhicule a été assigné",
        path:    data.transportId ? `/transports/${data.transportId}` : null,
      });
    });
  }, [subscribe, addLocalNotif]);

  // ── Socket : transport en retard ──────────────────────────────────────────
  useEffect(() => {
    return subscribe("transport:late", (data) => {
      addLocalNotif({
        type:    "transport:late",
        title:   "Transport en retard",
        message: data.message || (data.numero ? `Transport ${data.numero} en retard` : "Un transport est en retard"),
      });
    });
  }, [subscribe, addLocalNotif]);

  // ── Socket : maintenance véhicule ─────────────────────────────────────────
  useEffect(() => {
    return subscribe("vehicle:maintenance", (data) => {
      addLocalNotif({
        type:    "vehicle:maintenance",
        title:   "Maintenance planifiée",
        message: data.message || (data.immatriculation ? `Véhicule ${data.immatriculation}` : "Un véhicule nécessite une maintenance"),
      });
    });
  }, [subscribe, addLocalNotif]);

  // ── Socket : shift démarré / terminé ─────────────────────────────────────
  useEffect(() => {
    const unsubStart = subscribe("shift:started", (data) => {
      addLocalNotif({
        type:    "shift:started",
        title:   "Shift démarré",
        message: data.driverNom ? `${data.driverNom} a démarré son shift` : "Un shift vient de commencer",
      });
    });
    const unsubEnd = subscribe("shift:ended", (data) => {
      addLocalNotif({
        type:    "shift:ended",
        title:   "Shift terminé",
        message: data.driverNom ? `${data.driverNom} a terminé son shift` : "Un shift vient de se terminer",
      });
    });
    return () => { unsubStart(); unsubEnd(); };
  }, [subscribe, addLocalNotif]);

  // ── Socket : prescription expire bientôt ─────────────────────────────────
  useEffect(() => {
    return subscribe("pmt:expiring", (data) => {
      addLocalNotif({
        type:    "pmt:expiring",
        title:   "Prescription expire bientôt",
        message: data.message || "Une prescription médicale va expirer",
      });
    });
  }, [subscribe, addLocalNotif]);

  // ── Socket : surcharge critique TPMR ─────────────────────────────────────
  useEffect(() => {
    return subscribe("surcharge:critical", (data) => {
      playNotifSound();
      addLocalNotif({
        type:    "surcharge:critical",
        title:   "Surcharge critique TPMR",
        message: data.message || "Capacité TPMR dépassée — intervention requise",
      });
    });
  }, [subscribe, addLocalNotif]);

  // ── Socket : alerte SOS ───────────────────────────────────────────────────
  useEffect(() => {
    return subscribe("sos:received", (data) => {
      setSosAlert(data);
      playNotifSound();
      playNotifSound();
    });
  }, [subscribe]);

  // ── Socket : chauffeurs actifs ────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/v1/tracking/live");
        setActiveDrivers(
          (data.drivers || []).map((d) => ({
            driverId:   d.driverId,
            driverName: d.driverNom || d.driverName,
          }))
        );
      } catch {}
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const u1 = subscribe("driver:online", (data) => {
      setActiveDrivers((prev) => {
        if (prev.some((d) => d.driverId === data.driverId)) return prev;
        return [...prev, { driverId: data.driverId, driverName: data.driverNom }];
      });
    });
    const u2 = subscribe("driver:offline", (data) => {
      setActiveDrivers((prev) => prev.filter((d) => d.driverId !== data.driverId));
    });
    return () => { u1(); u2(); };
  }, [subscribe]);

  // ── Timer shift ──────────────────────────────────────────────────────────
  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const h  = String(Math.floor(elapsed / 3600)).padStart(2, "0");
      const m  = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
      const sc = String(elapsed % 60).padStart(2, "0");
      setShiftTime(`${h}:${m}:${sc}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const initials = user
    ? `${user.prenom?.[0] ?? ""}${user.nom?.[0] ?? ""}`.toUpperCase()
    : "??";

  const pageTitle =
    Object.entries(pageTitles).find(([k]) => location.pathname.startsWith(k))?.[1]
    || "Ambulances Blanc Bleu";

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-surface">

      {/* ══════════════════════════ SIDEBAR ══════════════════════════════ */}
      <aside className="w-60 h-screen fixed left-0 top-0 bg-navy flex flex-col z-50 shadow-xl">

        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-white" style={{ fontSize: "18px" }}>
                airport_shuttle
              </span>
            </div>
            <div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: "15px", lineHeight: 1.2 }}>
                <span className="text-white">Ambulances </span>
                <span className="text-primary">Blanc Bleu</span>
              </div>
              <p className="text-slate-600 font-mono tracking-widest" style={{ fontSize: "8px", marginTop: "2px" }}>
                NICE · TRANSPORT SANITAIRE
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2">Opérations</p>
          {NAV_OPERATIONS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                {item.label}
              </div>
              {item.path === "/transports" && totalUnread > 0 && (
                <span className="bg-danger text-white text-xs font-mono font-bold px-1.5 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
              {item.badgeKey === "autoDispatch" && autoDispatchCount > 0 && (
                <span className="bg-amber-500 text-white text-xs font-mono font-bold px-1.5 py-0.5 rounded-full">
                  {autoDispatchCount}
                </span>
              )}
            </NavLink>
          ))}

          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2 mt-3">Gestion</p>
          {NAV_GESTION.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <>
              <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2 mt-3">Administration</p>
              {NAV_ADMIN.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                      isActive
                        ? "bg-primary text-white shadow-lg shadow-primary/30"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Infos société */}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "13px" }}>location_on</span>
            <span className="text-slate-600 font-mono" style={{ fontSize: "9px", letterSpacing: "0.05em" }}>
              59 BD MADELEINE, NICE
            </span>
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "13px" }}>call</span>
            <span className="text-slate-600 font-mono" style={{ fontSize: "9px", letterSpacing: "0.05em" }}>
              04 93 00 00 00
            </span>
          </div>
        </div>

        {/* Utilisateur */}
        <div className="px-4 pb-4 border-t border-white/10 pt-3 space-y-2">
          <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate">
                {user ? `${user.prenom} ${user.nom}` : "Dispatcher"}
              </p>
              <p className="text-yellow-400 font-mono" style={{ fontSize: "11px" }}>
                SHIFT: {shiftTime}
              </p>
            </div>
            <button
              onClick={logout}
              title="Déconnexion"
              className="text-slate-500 hover:text-red-400 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>logout</span>
            </button>
          </div>
          <PushNotificationsToggle />

          <div className="flex items-center gap-2 px-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-success animate-pulse" : "bg-slate-600"}`} />
            <span className="text-slate-600 font-mono" style={{ fontSize: "9px", letterSpacing: "0.1em" }}>
              {connected ? "TEMPS RÉEL ACTIF" : "RECONNEXION..."}
            </span>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════ MAIN ═════════════════════════════════ */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">

        {/* TOPBAR */}
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-40 flex items-center justify-between px-8 shadow-sm">
          <div>
            <h1 className="font-brand font-semibold text-navy text-sm">{pageTitle}</h1>
            <p style={{ fontSize: "11px", color: "#94a3b8" }}>
              Ambulances Blanc Bleu · Nice, Alpes-Maritimes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "short", day: "numeric", month: "short", year: "numeric",
              })}
            </span>

            {/* ── Cloche notifications ───────────────────────────────────── */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
                aria-label="Notifications"
              >
                <span className="material-symbols-outlined text-slate-500 text-lg">notifications</span>
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </button>

              {/* ── Dropdown panel style Facebook ─────────────────────── */}
              {notifOpen && (
                <div
                  className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
                  style={{ width: 380 }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                      <p className="font-bold text-navy text-base leading-tight">Notifications</p>
                      {totalUnread > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">{totalUnread} non lue{totalUnread > 1 ? "s" : ""}</p>
                      )}
                    </div>
                    {totalUnread > 0 && (
                      <button
                        onClick={() => { markAllRead(); }}
                        className="text-xs font-semibold text-primary hover:text-blue-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
                      >
                        Tout marquer lu
                      </button>
                    )}
                  </div>

                  {/* Liste scrollable */}
                  <div style={{ maxHeight: 420, overflowY: "auto" }} className="divide-y divide-slate-50">
                    {allNotifs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-3 text-slate-300">
                          notifications_none
                        </span>
                        <p className="text-sm font-medium">Aucune notification</p>
                        <p className="text-xs mt-1 text-slate-300">Vous êtes à jour !</p>
                      </div>
                    ) : (
                      allNotifs.map((n) => {
                        const meta    = getMeta(n.type);
                        const palette = NOTIF_PALETTE[meta.color] || NOTIF_PALETTE.blue;
                        return (
                          <div
                            key={n.id}
                            onClick={() => {
                              markOneRead(n);
                              if (n.path) { navigate(n.path); setNotifOpen(false); }
                            }}
                            className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-slate-50 ${!n.read ? "bg-blue-50/60" : ""}`}
                          >
                            {/* Icône colorée */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${palette.bg}`}>
                              <span className={`material-symbols-outlined text-base ${palette.icon}`}>
                                {meta.icon}
                              </span>
                            </div>

                            {/* Contenu */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug ${!n.read ? "font-semibold text-navy" : "font-medium text-slate-700"}`}>
                                {n.title}
                              </p>
                              {n.message && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                                  {n.message}
                                </p>
                              )}
                              <p className={`text-xs mt-1 font-medium ${!n.read ? "text-primary" : "text-slate-400"}`}>
                                {timeAgo(n.time)}
                              </p>
                            </div>

                            {/* Point non-lu */}
                            {!n.read && (
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-2 ${palette.dot}`} />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Avatar déconnexion */}
            <div
              onClick={logout}
              className="w-9 h-9 rounded-lg bg-navy flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:bg-danger transition-colors"
              title="Déconnexion"
            >
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* ══════════════════ TOASTS TRANSPORT ══════════════════════════════ */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto w-80 bg-white rounded-xl shadow-2xl border border-slate-200 border-l-4 border-l-primary overflow-hidden"
            style={{ animation: "slideInRight 0.3s ease-out" }}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/30">
                <span className="material-symbols-outlined text-white" style={{ fontSize: "18px" }}>
                  directions_car
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-navy leading-tight">🚑 Nouveau transport — App patient</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                  {toast.data?.patient?.prenom} {toast.data?.patient?.nom}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {toast.data?.motif} · {toast.data?.typeTransport}
                </p>
                <button
                  onClick={() => { navigate(toast.path); removeToast(toast.id); }}
                  className="mt-2 text-xs font-bold text-primary hover:underline"
                >
                  Voir le transport →
                </button>
              </div>
              <button onClick={() => removeToast(toast.id)} className="text-slate-300 hover:text-slate-500 flex-shrink-0">
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
              </button>
            </div>
            <div className="h-0.5 bg-primary" style={{ animation: "shrinkWidth 6s linear forwards" }} />
          </div>
        ))}
      </div>

      {/* ══════════════════ TOASTS NOTIFICATIONS API ══════════════════════ */}
      <div className="fixed top-20 right-4 z-[9998] flex flex-col gap-2 pointer-events-none">
        {notifToasts.map((toast) => {
          const meta    = getMeta(toast.notif?.type);
          const palette = NOTIF_PALETTE[meta.color] || NOTIF_PALETTE.blue;
          return (
            <div
              key={toast.id}
              className="pointer-events-auto w-80 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden"
              style={{ animation: "slideInRight 0.3s ease-out", borderLeft: `4px solid` }}
            >
              <div className="flex items-start gap-3 p-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${palette.bg}`}>
                  <span className={`material-symbols-outlined ${palette.icon}`} style={{ fontSize: "16px" }}>
                    {meta.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-navy leading-tight truncate">
                    {toast.notif?.title || "Nouvelle notification"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {toast.notif?.message || ""}
                  </p>
                </div>
                <button onClick={() => dismissNotifToast(toast.id)} className="text-slate-300 hover:text-slate-500">
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                </button>
              </div>
              <div className="h-0.5 bg-primary" style={{ animation: "shrinkWidth 7s linear forwards" }} />
            </div>
          );
        })}
      </div>

      {/* ══════════════════ DISPATCHER CHAT ══════════════════════════════ */}
      <DispatcherChat drivers={activeDrivers} />

      {/* ══════════════════ SOS ALERT MODAL ══════════════════════════════ */}
      {sosAlert && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
               style={{ animation: "slideInRight 0.3s ease-out" }}>
            <div className="bg-red-600 px-6 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"
                   style={{ animation: "pulse 1s infinite" }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: "32px" }}>sos</span>
              </div>
              <div>
                <p className="text-white font-mono text-xs tracking-widest font-bold">ALERTE URGENTE</p>
                <p className="text-white font-bold text-xl leading-tight">SOS Chauffeur</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center gap-3 bg-red-50 rounded-xl p-3">
                <span className="material-symbols-outlined text-red-500">person</span>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">CHAUFFEUR</p>
                  <p className="text-sm font-bold text-navy">{sosAlert.prenom} {sosAlert.nom}</p>
                </div>
              </div>
              {(sosAlert.lat || sosAlert.lng) && (
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                  <span className="material-symbols-outlined text-slate-500">location_on</span>
                  <div>
                    <p className="text-xs text-slate-500 font-semibold">POSITION GPS</p>
                    <p className="text-sm font-mono text-navy">
                      {sosAlert.lat?.toFixed(5)}, {sosAlert.lng?.toFixed(5)}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <span className="material-symbols-outlined text-slate-500">schedule</span>
                <div>
                  <p className="text-xs text-slate-500 font-semibold">HEURE</p>
                  <p className="text-sm font-mono text-navy">
                    {new Date(sosAlert.timestamp).toLocaleTimeString("fr-FR")}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              {sosAlert.lat && sosAlert.lng && (
                <a
                  href={`https://www.google.com/maps?q=${sosAlert.lat},${sosAlert.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 bg-primary text-white text-sm font-bold py-3 rounded-xl text-center hover:bg-blue-700 transition-colors"
                >
                  Ouvrir carte
                </a>
              )}
              <button
                onClick={() => setSosAlert(null)}
                className="flex-1 bg-red-100 text-red-700 text-sm font-bold py-3 rounded-xl hover:bg-red-200 transition-colors"
              >
                Accusé réception
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shrinkWidth {
          from { width: 100%; }
          to   { width: 0%; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
