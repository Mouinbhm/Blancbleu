// Fichier : client/src/components/layout/Layout.jsx
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { transportService } from "../../services/api";
import useSocket from "../../hooks/useSocket";

const NAV_OPERATIONS = [
  { path: "/dashboard", icon: "dashboard", label: "Tableau de bord" },
  { path: "/transports", icon: "directions_car", label: "Transports" },
  { path: "/missions", icon: "local_shipping", label: "Missions" },
  { path: "/planning", icon: "calendar_month", label: "Planning" },
  { path: "/patients", icon: "personal_injury", label: "Patients" },
  { path: "/prescriptions", icon: "description", label: "Prescriptions" },
];

const NAV_GESTION = [
  { path: "/flotte", icon: "airport_shuttle", label: "Flotte" },
  { path: "/personnel", icon: "badge", label: "Personnel" },
  { path: "/equipements", icon: "medical_services", label: "Équipements" },
  { path: "/maintenances", icon: "build", label: "Maintenances" },
  { path: "/factures", icon: "receipt_long", label: "Factures" },
  { path: "/aide-ia", icon: "psychology", label: "Aide IA" },
];

const pageTitles = {
  "/dashboard": "Tableau de bord — Vue opérationnelle",
  "/transports": "Transports — Gestion des transports",
  "/transports/new": "Nouveau transport",
  "/missions": "Missions — Dispatch & exécution terrain",
  "/planning": "Planning — Organisation journalière",
  "/flotte": "Flotte — Véhicules sanitaires",
  "/patients": "Patients — Dossiers patients",
  "/prescriptions": "Prescriptions — PMT & ordonnances",
  "/personnel": "Personnel — Équipes",
  "/equipements": "Équipements — Matériel médical",
  "/maintenances": "Maintenances — Suivi véhicules",
  "/factures": "Factures — Facturation CPAM",
  "/aide-ia": "Aide IA — Optimisation",
};

export default function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [shiftTime, setShiftTime] = useState("00:00:00");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef(null);

  const { connected, subscribe } = useSocket();

  // ── Écoute Socket.IO : nouveau transport ─────────────────────────────────
  useEffect(() => {
    const unsub = subscribe("transport:created", (data) => {
      const notif = {
        id: String(data._id) + "_socket",
        title: `Nouveau transport — ${data.motif}`,
        sub: `${data.patient?.nom || "Patient"} · ${data.typeTransport}`,
        path: `/transports/${String(data._id)}`,
        time: new Date(),
      };
      setNotifs((prev) => [notif, ...prev].slice(0, 8));
      setNotifCount((prev) => prev + 1);
    });
    return unsub;
  }, [subscribe]);

  // ── Chargement notifications initiales ───────────────────────────────────
  useEffect(() => {
    const loadNotifs = async () => {
      try {
        const { data } = await transportService.getAll({
          statut: "REQUESTED",
          limit: 10,
        });
        const enAttente = data.transports || data.data || [];
        const list = enAttente.map((t) => ({
          id: t._id,
          title: `${t.motif} — ${t.patient?.nom || "Patient"}`,
          sub: `En attente de confirmation · ${t.typeTransport}`,
          path: `/transports/${String(t._id)}`,
          time: new Date(t.createdAt),
        }));
        setNotifs(list.slice(0, 8));
        setNotifCount(list.length);
      } catch {
        /* silencieux */
      }
    };
    loadNotifs();
    const iv = setInterval(loadNotifs, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Fermer notifs si clic en dehors ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Timer shift ──────────────────────────────────────────────────────────
  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
      const sc = String(elapsed % 60).padStart(2, "0");
      setShiftTime(`${h}:${m}:${sc}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const initials = user
    ? `${user.prenom?.[0] ?? ""}${user.nom?.[0] ?? ""}`.toUpperCase()
    : "??";

  const pageTitle =
    Object.entries(pageTitles).find(([k]) =>
      location.pathname.startsWith(k),
    )?.[1] || "Ambulances Blanc Bleu";

  return (
    <div className="flex min-h-screen bg-surface">
      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className="w-60 h-screen fixed left-0 top-0 bg-navy flex flex-col z-50 shadow-xl">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-white"
                style={{ fontSize: "18px" }}
              >
                airport_shuttle
              </span>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'Sora',sans-serif",
                  fontWeight: 800,
                  fontSize: "15px",
                  lineHeight: 1.2,
                }}
              >
                <span className="text-white">Ambulances </span>
                <span className="text-primary">Blanc Bleu</span>
              </div>
              <p
                className="text-slate-600 font-mono tracking-widest"
                style={{ fontSize: "8px", marginTop: "2px" }}
              >
                NICE · TRANSPORT SANITAIRE
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2">
            Opérations
          </p>
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
                <span className="material-symbols-outlined text-xl">
                  {item.icon}
                </span>
                {item.label}
              </div>
              {item.path === "/transports" && notifCount > 0 && (
                <span className="bg-danger text-white text-xs font-mono font-bold px-1.5 py-0.5 rounded-full">
                  {notifCount}
                </span>
              )}
            </NavLink>
          ))}

          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2 mt-3">
            Gestion
          </p>
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
              <span className="material-symbols-outlined text-xl">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Infos société */}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span
              className="material-symbols-outlined text-slate-600"
              style={{ fontSize: "13px" }}
            >
              location_on
            </span>
            <span
              className="text-slate-600 font-mono"
              style={{ fontSize: "9px", letterSpacing: "0.05em" }}
            >
              59 BD MADELEINE, NICE
            </span>
          </div>
          <div className="flex items-center gap-2 px-1">
            <span
              className="material-symbols-outlined text-slate-600"
              style={{ fontSize: "13px" }}
            >
              call
            </span>
            <span
              className="text-slate-600 font-mono"
              style={{ fontSize: "9px", letterSpacing: "0.05em" }}
            >
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
              <p
                className="text-yellow-400 font-mono"
                style={{ fontSize: "11px" }}
              >
                SHIFT: {shiftTime}
              </p>
            </div>
            <button
              onClick={logout}
              title="Déconnexion"
              className="text-slate-500 hover:text-red-400 transition-colors"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px" }}
              >
                logout
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2 px-1">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-success animate-pulse" : "bg-slate-600"}`}
            />
            <span
              className="text-slate-600 font-mono"
              style={{ fontSize: "9px", letterSpacing: "0.1em" }}
            >
              {connected ? "TEMPS RÉEL ACTIF" : "RECONNEXION..."}
            </span>
          </div>
        </div>
      </aside>

      {/* ═══════════════ MAIN ═══════════════ */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {/* TOPBAR */}
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-40 flex items-center justify-between px-8 shadow-sm">
          <div>
            <h1 className="font-brand font-semibold text-navy text-sm">
              {pageTitle}
            </h1>
            <p style={{ fontSize: "11px", color: "#94a3b8" }}>
              Ambulances Blanc Bleu · Nice, Alpes-Maritimes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-surface transition-colors"
              >
                <span className="material-symbols-outlined text-slate-500 text-lg">
                  notifications
                </span>
                {notifCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-white" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <p className="font-brand font-bold text-navy text-sm">
                      Notifications
                    </p>
                    {notifCount > 0 && (
                      <span className="bg-danger text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {notifCount} en attente
                      </span>
                    )}
                  </div>
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-xs">
                      <span className="material-symbols-outlined text-3xl block mb-2">
                        notifications_none
                      </span>
                      Aucune notification
                    </div>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          navigate(n.path);
                          setNotifOpen(false);
                          setNotifCount(0);
                        }}
                        className="px-4 py-3 border-b border-slate-50 hover:bg-surface cursor-pointer transition-colors"
                      >
                        <p className="text-xs font-bold text-navy">{n.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{n.sub}</p>
                        <p className="text-xs text-slate-300 mt-0.5">
                          {n.time.toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ))
                  )}
                  <div className="p-3 border-t border-slate-100">
                    <button
                      onClick={() => {
                        navigate("/transports");
                        setNotifOpen(false);
                      }}
                      className="w-full text-xs font-bold text-primary text-center hover:underline"
                    >
                      Voir tous les transports →
                    </button>
                  </div>
                </div>
              )}
            </div>
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
    </div>
  );
}
