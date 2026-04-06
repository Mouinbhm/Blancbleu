import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

const navItems = [
  { path: "/dashboard", icon: "dashboard", label: "Tableau de bord" },
  {
    path: "/interventions",
    icon: "emergency",
    label: "Interventions",
    badge: 4,
  },
  { path: "/carte", icon: "map", label: "Carte en direct" },
  { path: "/flotte", icon: "ambulance", label: "Flotte & Véhicules" },
  { path: "/aide-ia", icon: "psychology", label: "Aide IA" },
  { path: "/rapports", icon: "assessment", label: "Rapports" },
  { path: "/factures", icon: "receipt_long", label: "Factures" },
];

const pageTitles = {
  "/dashboard": "Tableau de bord — Vue opérationnelle",
  "/interventions": "Interventions — Gestion des appels",
  "/carte": "Carte en direct — Suivi des unités",
  "/flotte": "Flotte & Véhicules — Gestion des ambulances",
  "/aide-ia": "Aide IA — Priorisation intelligente",
  "/rapports": "Rapports Opérationnels",
  "/factures": "Factures — Gestion de la facturation",
};

export default function Layout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [shiftTime, setShiftTime] = useState("00:00:00");
  const [notifOpen, setNotifOpen] = useState(false);

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
                emergency
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
                NICE · DISPATCH · AI
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2">
            Opérations
          </p>
          {navItems.slice(0, 3).map((item) => (
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
              {item.badge && (
                <span className="bg-danger text-white text-xs font-mono font-bold px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}

          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest px-4 py-2 mt-3">
            Gestion
          </p>
          {navItems.slice(3).map((item) => (
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

        {/* Infos entreprise */}
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
              SAMU 15 · POMPIERS 18
            </span>
          </div>
        </div>

        {/* Dispatcher */}
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
            <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
            <span
              className="text-slate-600 font-mono"
              style={{ fontSize: "9px", letterSpacing: "0.1em" }}
            >
              SYSTÈME OPÉRATIONNEL
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
              {pageTitles[location.pathname] || "Ambulances Blanc Bleu"}
            </h1>
            <p style={{ fontSize: "11px", color: "#94a3b8" }}>
              Ambulances Blanc Bleu · Nice, Alpes-Maritimes
            </p>
          </div>

          <div className="flex items-center gap-2 bg-surface rounded-lg border border-slate-200 px-3 py-2 w-56">
            <span className="material-symbols-outlined text-slate-400 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Rechercher une intervention…"
              className="bg-transparent text-sm outline-none w-full text-slate-700 placeholder-slate-400"
            />
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
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-surface transition-colors"
              >
                <span className="material-symbols-outlined text-slate-500 text-lg">
                  notifications
                </span>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-white" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                  <div className="p-4 border-b border-slate-100">
                    <p className="font-brand font-bold text-navy text-sm">
                      Notifications
                    </p>
                  </div>
                  {[
                    {
                      t: "P1 — Arrêt cardiaque",
                      s: "Unité AMB-03 dispatchée",
                      c: "text-danger",
                    },
                    {
                      t: "P2 — Accident route A8",
                      s: "En attente d'une unité",
                      c: "text-warning",
                    },
                    {
                      t: "IA — Recommandation",
                      s: "Redéployer AMB-05 secteur E",
                      c: "text-primary",
                    },
                  ].map((n, i) => (
                    <div
                      key={i}
                      className="px-4 py-3 border-b border-slate-50 hover:bg-surface cursor-pointer"
                    >
                      <p className={`text-xs font-bold ${n.c}`}>{n.t}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.s}</p>
                    </div>
                  ))}
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
