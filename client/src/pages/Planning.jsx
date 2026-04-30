import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS  = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

const COULEURS = {
  REQUESTED:              { bg: "#F1F5F9", border: "#94A3B8", text: "#475569" },
  CONFIRMED:              { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  SCHEDULED:              { bg: "#F5F3FF", border: "#8B5CF6", text: "#6D28D9" },
  ASSIGNED:               { bg: "#EEF2FF", border: "#6366F1", text: "#4338CA" },
  EN_ROUTE_TO_PICKUP:     { bg: "#FFF7ED", border: "#F97316", text: "#C2410C" },
  ARRIVED_AT_PICKUP:      { bg: "#FFF7ED", border: "#FB923C", text: "#C2410C" },
  PATIENT_ON_BOARD:       { bg: "#FFFBEB", border: "#F59E0B", text: "#B45309" },
  ARRIVED_AT_DESTINATION: { bg: "#F0FDF4", border: "#4ADE80", text: "#166534" },
  WAITING_AT_DESTINATION: { bg: "#F0FDF4", border: "#22C55E", text: "#166534" },
  COMPLETED:              { bg: "#F0FDF4", border: "#22C55E", text: "#166534" },
  CANCELLED:              { bg: "#FEF2F2", border: "#EF4444", text: "#B91C1C" },
  NO_SHOW:                { bg: "#FFF1F2", border: "#FB7185", text: "#BE123C" },
  BILLED:                 { bg: "#F0FDFA", border: "#14B8A6", text: "#0F766E" },
};

const STATUT_LABELS = {
  REQUESTED: "Demandé",       CONFIRMED: "Confirmé",       SCHEDULED: "Planifié",
  ASSIGNED: "Assigné",        EN_ROUTE_TO_PICKUP: "En route", ARRIVED_AT_PICKUP: "Sur place",
  PATIENT_ON_BOARD: "À bord", ARRIVED_AT_DESTINATION: "Arrivé", WAITING_AT_DESTINATION: "En attente",
  COMPLETED: "Terminé",       BILLED: "Facturé",           CANCELLED: "Annulé", NO_SHOW: "Absent",
};

function cleJour(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function genererGrille(annee, mois) {
  const premier     = new Date(annee, mois, 1);
  const dernier     = new Date(annee, mois + 1, 0);
  let   jourSemaine = premier.getDay();
  jourSemaine = jourSemaine === 0 ? 6 : jourSemaine - 1;

  const jours = [];
  for (let i = jourSemaine - 1; i >= 0; i--)
    jours.push({ date: new Date(annee, mois, -i), autreMois: true });
  for (let d = 1; d <= dernier.getDate(); d++)
    jours.push({ date: new Date(annee, mois, d), autreMois: false });
  const reste = 42 - jours.length;
  for (let d = 1; d <= reste; d++)
    jours.push({ date: new Date(annee, mois + 1, d), autreMois: true });

  return jours;
}

export default function Planning() {
  const navigate = useNavigate();

  const [moisActuel, setMoisActuel] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [transports,      setTransports]      = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [jourSelectionne, setJourSelectionne] = useState(null);

  // Minuit aujourd'hui — calculé une fois par mount
  const debutAujourdhui = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const cleAujourdhui = cleJour(debutAujourdhui);

  const grille = useMemo(
    () => genererGrille(moisActuel.getFullYear(), moisActuel.getMonth()),
    [moisActuel],
  );

  const transportsParJour = useMemo(() => {
    const map = {};
    transports.forEach((t) => {
      if (!t.dateTransport) return;
      const key = cleJour(new Date(t.dateTransport));
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.heureRDV || "").localeCompare(b.heureRDV || "")),
    );
    return map;
  }, [transports]);

  // Chargement des transports du mois
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const annee     = moisActuel.getFullYear();
    const mois      = moisActuel.getMonth();
    const dateDebut = new Date(annee, mois, 1).toISOString().split("T")[0];
    const dateFin   = new Date(annee, mois + 1, 0).toISOString().split("T")[0];

    api
      .get("/transports", { params: { dateDebut, dateFin, limit: 500 } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        setTransports(Array.isArray(data) ? data : data?.transports || data?.data || []);
      })
      .catch(() => { if (!cancelled) setTransports([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [moisActuel]);

  const moisPrecedent = () => {
    setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() - 1, 1));
    setJourSelectionne(null);
  };
  const moisSuivant = () => {
    setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() + 1, 1));
    setJourSelectionne(null);
  };
  const allerAujourdhui = () => {
    const auj = new Date();
    setMoisActuel(new Date(auj.getFullYear(), auj.getMonth(), 1));
    setJourSelectionne(new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()));
  };

  const annee          = moisActuel.getFullYear();
  const moisIdx        = moisActuel.getMonth();
  const transportsJour = jourSelectionne
    ? (transportsParJour[cleJour(jourSelectionne)] || [])
    : [];

  // ── Styles partagés ────────────────────────────────────────────────────────
  const btnNav = {
    border: "1px solid #e2e8f0", borderRadius: 8,
    padding: "6px 13px", cursor: "pointer", background: "white",
    color: "#475569", fontSize: 15, lineHeight: 1, fontFamily: "inherit",
  };

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      padding: "24px 28px 0",
      overflow: "hidden",
      boxSizing: "border-box",
      background: "#f0f4ff",
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 20, flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Planning
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "2px 0 0" }}>
            {MOIS[moisIdx]} {annee}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && (
            <div style={{
              width: 14, height: 14,
              border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5",
              borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0,
            }} />
          )}
          <button onClick={moisPrecedent} style={btnNav}>←</button>
          <span style={{
            fontSize: 14, fontWeight: 600, minWidth: 152, textAlign: "center",
            color: "#0f172a",
          }}>
            {MOIS[moisIdx]} {annee}
          </span>
          <button onClick={moisSuivant} style={btnNav}>→</button>
          <button onClick={allerAujourdhui} style={{ ...btnNav, marginLeft: 4, fontSize: 13 }}>
            Aujourd'hui
          </button>
          <button
            onClick={() => navigate("/transports/new")}
            style={{
              background: "#1D6EF5", color: "white", border: "none",
              borderRadius: 8, padding: "8px 16px", cursor: "pointer",
              fontSize: 13, fontWeight: 600, marginLeft: 4,
              display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 400 }}>+</span>
            Nouveau transport
          </button>
        </div>
      </div>

      {/* ── GRILLE ──────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
        minHeight: 0,
        marginBottom: 24,
        marginRight: jourSelectionne ? 356 : 0,
        transition: "margin-right 0.2s ease",
        background: "white",
      }}>
        {/* En-têtes semaine */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          flexShrink: 0,
        }}>
          {JOURS.map((j, i) => (
            <div key={j} style={{
              padding: "9px 0",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              color: i >= 5 ? "#f97316" : "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderRight: i < 6 ? "1px solid #e2e8f0" : "none",
            }}>
              {j}
            </div>
          ))}
        </div>

        {/* Cases */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          flex: 1,
          minHeight: 0,
        }}>
          {grille.map((jour, idx) => {
            const key  = cleJour(jour.date);
            const list = transportsParJour[key] || [];
            const vis  = list.slice(0, 3);
            const surp = list.length - 3;
            const auj  = key === cleAujourdhui;
            const pass = jour.date < debutAujourdhui && !jour.autreMois;
            const sel  = jourSelectionne && cleJour(jourSelectionne) === key;
            const weekend = idx % 7 >= 5;

            return (
              <div
                key={idx}
                onClick={() => setJourSelectionne(jour.date)}
                style={{
                  padding: "5px 7px",
                  borderRight: (idx + 1) % 7 !== 0 ? "1px solid #e2e8f0" : "none",
                  borderBottom: idx < 35 ? "1px solid #e2e8f0" : "none",
                  background: sel
                    ? "#dbeafe"
                    : auj
                    ? "#EFF6FF"
                    : pass
                    ? "#fafafa"
                    : jour.autreMois
                    ? "#f8f9fa"
                    : weekend
                    ? "#fdfcff"
                    : "white",
                  cursor: "pointer",
                  overflow: "hidden",
                  minHeight: 0,
                }}
                onMouseEnter={(e) => {
                  if (!sel) e.currentTarget.style.background = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = sel ? "#dbeafe" : auj ? "#EFF6FF" : pass ? "#fafafa" : jour.autreMois ? "#f8f9fa" : weekend ? "#fdfcff" : "white";
                }}
              >
                {/* Numéro du jour */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%",
                    fontSize: 12, fontWeight: auj ? 700 : 400,
                    background: auj ? "#1D6EF5" : "transparent",
                    color: auj ? "white" : jour.autreMois ? "#cbd5e1" : pass ? "#94a3b8" : "#0f172a",
                  }}>
                    {jour.date.getDate()}
                  </span>
                </div>

                {/* Blocs transport */}
                {vis.map((t) => {
                  const c = COULEURS[t.statut] || COULEURS.REQUESTED;
                  return (
                    <div
                      key={t._id}
                      onClick={(e) => { e.stopPropagation(); navigate(`/transports/${t._id}`); }}
                      title={`${t.heureRDV || "—"} — ${t.patient?.nom || ""} ${t.patient?.prenom || ""}`}
                      style={{
                        background: c.bg, borderLeft: `2px solid ${c.border}`, color: c.text,
                        borderRadius: 3, padding: "1px 5px",
                        fontSize: 11, fontWeight: 500, lineHeight: "16px",
                        marginBottom: 2, overflow: "hidden",
                        whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer",
                      }}
                    >
                      {t.heureRDV || "—"} {t.patient?.nom || ""}
                    </div>
                  );
                })}

                {surp > 0 && (
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginTop: 1, paddingLeft: 2 }}>
                    +{surp} autre{surp > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PANNEAU LATÉRAL ─────────────────────────────────────────────── */}
      {jourSelectionne && (
        <div style={{
          position: "fixed", right: 0, top: 0,
          height: "100vh", width: 340,
          background: "white",
          borderLeft: "1px solid #e2e8f0",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
          zIndex: 100,
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>
                {jourSelectionne.toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
                {transportsJour.length} transport{transportsJour.length !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              onClick={() => setJourSelectionne(null)}
              style={{
                border: "none", background: "none", cursor: "pointer",
                fontSize: 20, color: "#94a3b8", padding: "2px 6px",
                borderRadius: 6, lineHeight: 1, fontFamily: "inherit",
              }}
            >×</button>
          </div>

          {/* Liste */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
            {transportsJour.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "48px 0",
                color: "#94a3b8", fontSize: 13,
              }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
                Aucun transport ce jour
              </div>
            ) : (
              transportsJour.map((t) => {
                const c = COULEURS[t.statut] || COULEURS.REQUESTED;
                return (
                  <div
                    key={t._id}
                    onClick={() => navigate(`/transports/${t._id}`)}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderLeft: `3px solid ${c.border}`,
                      borderRadius: 8, padding: "10px 12px",
                      marginBottom: 8, cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>
                        {t.heureRDV || "—"}
                      </span>
                      <span style={{
                        fontSize: 10, background: c.bg, color: c.text,
                        padding: "2px 7px", borderRadius: 99, fontWeight: 600,
                      }}>
                        {STATUT_LABELS[t.statut] || t.statut}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                      {t.patient?.nom} {t.patient?.prenom}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {t.motif ? `${t.motif} · ` : ""}{t.typeTransport || ""}
                    </div>
                    {(t.adresseDestination?.nom || t.adresseDestination?.rue) && (
                      <div style={{
                        fontSize: 11, color: "#64748b", marginTop: 3,
                        display: "flex", alignItems: "center", gap: 4,
                        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                      }}>
                        <span>📍</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.adresseDestination?.nom || t.adresseDestination?.rue}
                        </span>
                      </div>
                    )}
                    {t.vehicule && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                        🚐 {t.vehicule?.nom || t.vehicule?.immatriculation}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0" }}>
            <button
              onClick={() => {
                const iso = `${jourSelectionne.getFullYear()}-${String(jourSelectionne.getMonth() + 1).padStart(2, "0")}-${String(jourSelectionne.getDate()).padStart(2, "0")}`;
                navigate(`/transports/new?date=${iso}`);
              }}
              style={{
                width: "100%", background: "#1D6EF5", color: "white",
                border: "none", borderRadius: 8, padding: "10px",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontFamily: "inherit",
              }}
            >
              <span>+</span> Nouveau transport ce jour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
