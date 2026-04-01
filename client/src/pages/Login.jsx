import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!form.email || !form.password) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await authService.login(form);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.message || "Erreur de connexion. Réessayez.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* ── Fond animé ── */}
      <div style={styles.bgGrid} />
      <div style={styles.bgPulse} />

      {/* ── Panneau gauche – branding ── */}
      <div style={styles.left}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🚑</span>
          <span style={styles.logoText}>BlancBleu</span>
        </div>
        <h1 style={styles.tagline}>
          La clarté
          <br />
          <span style={styles.taglineAccent}>au service</span>
          <br />
          de l'urgence.
        </h1>
        <div style={styles.stats}>
          {[
            { val: "< 8min", label: "Temps de réponse moyen" },
            { val: "24/7", label: "Surveillance opérationnelle" },
            { val: "P1→P3", label: "Triage IA automatique" },
          ].map((s) => (
            <div key={s.label} style={styles.statItem}>
              <span style={styles.statVal}>{s.val}</span>
              <span style={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panneau droit – formulaire ── */}
      <div style={styles.right}>
        <div style={styles.card}>
          {/* En-tête */}
          <div style={styles.cardHeader}>
            <div style={styles.badge}>ACCÈS DISPATCHER</div>
            <h2 style={styles.cardTitle}>Connexion</h2>
            <p style={styles.cardSub}>
              Plateforme de gestion des interventions ambulancières
            </p>
          </div>

          {/* Alerte erreur */}
          {error && (
            <div style={styles.errorBox}>
              <span style={styles.errorIcon}>⚠</span>
              {error}
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Adresse email</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>✉</span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="dispatcher@blancbleu.fr"
                  style={styles.input}
                  autoComplete="email"
                />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Mot de passe</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>🔒</span>
                <input
                  type={showPwd ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  style={styles.input}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={styles.togglePwd}
                >
                  {showPwd ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.btn,
                ...(loading ? styles.btnLoading : {}),
              }}
            >
              {loading ? (
                <>
                  <span style={styles.spinner} /> Connexion en cours…
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          {/* Comptes de démo */}
          <div style={styles.demo}>
            <p style={styles.demoTitle}>Comptes de démonstration</p>
            <div style={styles.demoGrid}>
              {[
                { role: "Admin", email: "admin@blancbleu.fr", pwd: "admin123" },
                {
                  role: "Dispatcher",
                  email: "dispatcher@blancbleu.fr",
                  pwd: "dispatcher123",
                },
                {
                  role: "Superviseur",
                  email: "superviseur@blancbleu.fr",
                  pwd: "superviseur123",
                },
              ].map((d) => (
                <button
                  key={d.role}
                  type="button"
                  style={styles.demoBtn}
                  onClick={() => setForm({ email: d.email, password: d.pwd })}
                >
                  <span style={styles.demoBtnRole}>{d.role}</span>
                  <span style={styles.demoBtnEmail}>{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=DM+Sans:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes pulse {
          0%, 100% { transform: scale(1);   opacity: 0.07; }
          50%       { transform: scale(1.1); opacity: 0.12; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        input:focus {
          outline: none;
          border-color: #1D6EF5 !important;
          box-shadow: 0 0 0 3px rgba(29,110,245,0.15) !important;
        }
        input::placeholder { color: #4a5568; }

        button:not(:disabled):hover { filter: brightness(1.08); }
        button:not(:disabled):active { transform: scale(0.98); }
      `}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#060B18",
    fontFamily: "'DM Sans', sans-serif",
    color: "#e2e8f0",
    position: "relative",
    overflow: "hidden",
  },

  // Grille de fond
  bgGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient(rgba(29,110,245,0.06) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(29,110,245,0.06) 1px, transparent 1px)`,
    backgroundSize: "40px 40px",
    pointerEvents: "none",
  },

  // Cercle lumineux animé
  bgPulse: {
    position: "absolute",
    top: "-200px",
    left: "-200px",
    width: "600px",
    height: "600px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(29,110,245,0.15) 0%, transparent 70%)",
    animation: "pulse 6s ease-in-out infinite",
    pointerEvents: "none",
  },

  // ── Gauche ──
  left: {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "60px 64px",
    position: "relative",
    zIndex: 1,
  },

  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "64px",
  },
  logoIcon: { fontSize: "28px" },
  logoText: {
    fontFamily: "'Sora', sans-serif",
    fontSize: "22px",
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: "0.02em",
  },

  tagline: {
    fontFamily: "'Sora', sans-serif",
    fontSize: "52px",
    fontWeight: 700,
    lineHeight: 1.1,
    color: "#ffffff",
    marginBottom: "56px",
    animation: "fadeUp 0.8s ease both",
  },
  taglineAccent: {
    color: "#1D6EF5",
  },

  stats: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    animation: "fadeUp 0.8s ease both",
  },
  statVal: {
    fontFamily: "'Sora', sans-serif",
    fontSize: "20px",
    fontWeight: 600,
    color: "#1D6EF5",
    minWidth: "72px",
  },
  statLabel: {
    fontSize: "14px",
    color: "#64748b",
  },

  // ── Droite ──
  right: {
    width: "480px",
    minWidth: "480px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 48px",
    position: "relative",
    zIndex: 1,
    borderLeft: "1px solid rgba(29,110,245,0.12)",
    backgroundColor: "rgba(8,15,35,0.6)",
    backdropFilter: "blur(20px)",
  },

  card: {
    width: "100%",
    animation: "fadeUp 0.6s ease both",
  },

  cardHeader: {
    marginBottom: "32px",
  },
  badge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: "4px",
    backgroundColor: "rgba(29,110,245,0.15)",
    border: "1px solid rgba(29,110,245,0.3)",
    color: "#60a5fa",
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.1em",
    marginBottom: "16px",
  },
  cardTitle: {
    fontFamily: "'Sora', sans-serif",
    fontSize: "28px",
    fontWeight: 700,
    color: "#ffffff",
    marginBottom: "8px",
  },
  cardSub: {
    fontSize: "14px",
    color: "#64748b",
  },

  // Erreur
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#fca5a5",
    fontSize: "14px",
    marginBottom: "20px",
    animation: "fadeUp 0.3s ease both",
  },
  errorIcon: { fontSize: "16px" },

  // Formulaire
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    marginBottom: "28px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#94a3b8",
    letterSpacing: "0.02em",
  },
  inputWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  inputIcon: {
    position: "absolute",
    left: "14px",
    fontSize: "16px",
    zIndex: 1,
    userSelect: "none",
  },
  input: {
    width: "100%",
    padding: "13px 44px",
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    color: "#e2e8f0",
    fontSize: "15px",
    fontFamily: "'DM Sans', sans-serif",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  togglePwd: {
    position: "absolute",
    right: "14px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    padding: "0",
    lineHeight: 1,
  },

  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "14px",
    borderRadius: "10px",
    backgroundColor: "#1D6EF5",
    border: "none",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
    transition: "filter 0.2s, transform 0.1s",
    marginTop: "4px",
  },
  btnLoading: {
    opacity: 0.75,
    cursor: "not-allowed",
  },
  spinner: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid #fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },

  // Démo
  demo: {
    borderTop: "1px solid rgba(255,255,255,0.07)",
    paddingTop: "24px",
  },
  demoTitle: {
    fontSize: "12px",
    color: "#475569",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "12px",
  },
  demoGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  demoBtn: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
    transition: "background-color 0.2s, border-color 0.2s",
    textAlign: "left",
  },
  demoBtnRole: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#94a3b8",
    minWidth: "90px",
  },
  demoBtnEmail: {
    fontSize: "12px",
    color: "#475569",
    fontFamily: "monospace",
  },
};
