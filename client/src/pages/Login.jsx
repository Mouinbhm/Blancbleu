import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
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
    if (!form.email || !form.password) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError(
        err.response?.data?.message || "Email ou mot de passe incorrect.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <style>{css}</style>
      <div style={s.bgGrid} />
      <div style={s.bgGlow1} />
      <div style={s.bgGlow2} />

      {/* ══════════ GAUCHE ══════════ */}
      <div style={s.left}>
        <div style={s.logo} className="fadeUp">
          <div style={s.logoIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L3 7v10l9 5 9-5V7L12 2z"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M12 2v20M3 7l9 5 9-5"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div style={s.logoName}>
              <span style={s.logoW}>Blanc</span>
              <span style={s.logoB}>Bleu</span>
            </div>
            <div style={s.logoTag}>DISPATCH · AI · SANITAIRE</div>
          </div>
        </div>

        <div style={s.heroBlock} className="fadeUp delay1">
          <div style={s.heroEyebrow}>
            <span style={s.eyebrowDot} /> Plateforme de gestion opérationnelle
          </div>
          <h1 style={s.hero}>
            Le transport
            <br />
            sanitaire,
            <br />
            <span style={s.heroAccent}>piloté en temps</span>
            <br />
            <span style={s.heroAccent}>réel.</span>
          </h1>
          <p style={s.heroPara}>
            Dispatchez, priorisez et suivez vos unités ambulancières grâce à
            l'intelligence artificielle intégrée.
          </p>
        </div>

        <div style={s.badges} className="fadeUp delay2">
          {[
            { icon: "🚑", label: "VSAV / SMUR / VSL" },
            { icon: "🧠", label: "Triage IA P1→P3" },
            { icon: "📍", label: "GPS temps réel" },
            { icon: "📋", label: "Rapports opérat." },
          ].map((b) => (
            <div key={b.label} style={s.badge}>
              <span style={s.badgeIcon}>{b.icon}</span>
              <span style={s.badgeLabel}>{b.label}</span>
            </div>
          ))}
        </div>

        <div style={s.stats} className="fadeUp delay3">
          {[
            { val: "< 8 min", label: "Temps de réponse" },
            { val: "24 / 7", label: "Opérationnel" },
            { val: "99.9 %", label: "Disponibilité" },
          ].map((st) => (
            <div key={st.label} style={s.stat}>
              <span style={s.statVal}>{st.val}</span>
              <span style={s.statLabel}>{st.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ DROITE ══════════ */}
      <div style={s.right}>
        <div style={s.card} className="fadeUp">
          <div style={s.cardTop}>
            <div style={s.pill}>ACCÈS DISPATCHER</div>
            <h2 style={s.cardTitle}>Connexion</h2>
            <p style={s.cardSub}>
              Plateforme de gestion des interventions ambulancières
            </p>
          </div>

          {error && (
            <div style={s.err}>
              <span style={{ fontSize: 15 }}>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={s.form} autoComplete="off">
            <div style={s.field}>
              <label style={s.label}>Adresse email</label>
              <div style={s.wrap}>
                <svg
                  style={s.ico}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="M2 7l10 7 10-7" />
                </svg>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="votre@email.fr"
                  style={s.input}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div style={s.field}>
              <div style={s.labelRow}>
                <label style={s.label}>Mot de passe</label>
                {/* ✅ Link vers /forgot-password — plus de alert() */}
                <Link to="/forgot-password" style={s.forgot}>
                  Mot de passe oublié ?
                </Link>
              </div>
              <div style={s.wrap}>
                <svg
                  style={s.ico}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <input
                  type={showPwd ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  style={s.input}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={s.eye}
                >
                  {showPwd ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...s.btn, ...(loading ? s.btnOff : {}) }}
            >
              {loading ? (
                <>
                  <span style={s.spinner} /> Connexion en cours…
                </>
              ) : (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Se connecter
                </>
              )}
            </button>
          </form>

          <div style={s.cardFoot}>
            <span style={s.footDot} /> Connexion sécurisée SSL · JWT
          </div>
        </div>
      </div>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=DM+Sans:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:.08}50%{transform:scale(1.15);opacity:.14}}
  @keyframes pulse2{0%,100%{transform:scale(1);opacity:.05}50%{transform:scale(1.1);opacity:.1}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .fadeUp{animation:fadeUp .7s ease both}
  .delay1{animation-delay:.1s}
  .delay2{animation-delay:.2s}
  .delay3{animation-delay:.3s}
  input:focus{outline:none!important;border-color:#1D6EF5!important;box-shadow:0 0 0 3px rgba(29,110,245,.18)!important}
  input::placeholder{color:#3a4560}
  button:not(:disabled):active{transform:scale(.98)}
`;

const s = {
  page: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#04080F",
    fontFamily: "'DM Sans',sans-serif",
    color: "#e2e8f0",
    position: "relative",
    overflow: "hidden",
  },
  bgGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(29,110,245,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(29,110,245,.05) 1px,transparent 1px)",
    backgroundSize: "48px 48px",
    pointerEvents: "none",
  },
  bgGlow1: {
    position: "absolute",
    top: "-300px",
    left: "-200px",
    width: "700px",
    height: "700px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle,rgba(29,110,245,.12) 0%,transparent 70%)",
    animation: "pulse 7s ease-in-out infinite",
    pointerEvents: "none",
  },
  bgGlow2: {
    position: "absolute",
    bottom: "-200px",
    left: "30%",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle,rgba(0,180,255,.07) 0%,transparent 70%)",
    animation: "pulse2 9s ease-in-out infinite",
    pointerEvents: "none",
  },
  left: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "60px 72px",
    position: "relative",
    zIndex: 1,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "56px",
  },
  logoIcon: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    background: "linear-gradient(135deg,#1D6EF5,#0ea5e9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 8px 24px rgba(29,110,245,.35)",
  },
  logoName: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "26px",
    fontWeight: 800,
    lineHeight: 1,
  },
  logoW: { color: "#ffffff" },
  logoB: { color: "#1D6EF5" },
  logoTag: {
    fontSize: "10px",
    color: "#334155",
    letterSpacing: "0.14em",
    fontWeight: 500,
    marginTop: "4px",
  },
  heroBlock: { marginBottom: "40px" },
  heroEyebrow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: "#1D6EF5",
    letterSpacing: "0.1em",
    fontWeight: 500,
    marginBottom: "20px",
    textTransform: "uppercase",
  },
  eyebrowDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#1D6EF5",
    display: "inline-block",
    flexShrink: 0,
  },
  hero: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "62px",
    fontWeight: 800,
    lineHeight: 1.05,
    color: "#ffffff",
    marginBottom: "20px",
    letterSpacing: "-0.02em",
  },
  heroAccent: { color: "#1D6EF5" },
  heroPara: {
    fontSize: "15px",
    color: "#475569",
    lineHeight: 1.7,
    maxWidth: "420px",
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "40px",
  },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    borderRadius: "8px",
    backgroundColor: "rgba(29,110,245,.08)",
    border: "1px solid rgba(29,110,245,.15)",
  },
  badgeIcon: { fontSize: "15px" },
  badgeLabel: {
    fontSize: "12px",
    color: "#60a5fa",
    fontWeight: 500,
    letterSpacing: "0.03em",
  },
  stats: { display: "flex", gap: "40px" },
  stat: { display: "flex", flexDirection: "column", gap: "4px" },
  statVal: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "22px",
    fontWeight: 700,
    color: "#ffffff",
  },
  statLabel: { fontSize: "12px", color: "#334155", letterSpacing: "0.04em" },
  right: {
    width: "500px",
    minWidth: "500px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 52px",
    position: "relative",
    zIndex: 1,
    borderLeft: "1px solid rgba(29,110,245,.1)",
    backgroundColor: "rgba(6,11,24,.7)",
    backdropFilter: "blur(24px)",
  },
  card: { width: "100%" },
  cardTop: { marginBottom: "32px" },
  pill: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "4px",
    backgroundColor: "rgba(29,110,245,.15)",
    border: "1px solid rgba(29,110,245,.3)",
    color: "#60a5fa",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    marginBottom: "20px",
  },
  cardTitle: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "30px",
    fontWeight: 800,
    color: "#ffffff",
    marginBottom: "8px",
    letterSpacing: "-0.01em",
  },
  cardSub: { fontSize: "14px", color: "#475569", lineHeight: 1.6 },
  err: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(239,68,68,.1)",
    border: "1px solid rgba(239,68,68,.25)",
    color: "#fca5a5",
    fontSize: "14px",
    marginBottom: "20px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    marginBottom: "24px",
  },
  field: { display: "flex", flexDirection: "column", gap: "8px" },
  labelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#64748b",
    letterSpacing: "0.03em",
  },
  forgot: {
    fontSize: "12px",
    color: "#1D6EF5",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  wrap: { position: "relative", display: "flex", alignItems: "center" },
  ico: {
    position: "absolute",
    left: "14px",
    width: "17px",
    height: "17px",
    color: "#334155",
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    padding: "13px 44px",
    backgroundColor: "rgba(255,255,255,.03)",
    border: "1px solid rgba(255,255,255,.07)",
    borderRadius: "10px",
    color: "#e2e8f0",
    fontSize: "15px",
    fontFamily: "'DM Sans',sans-serif",
    transition: "border-color .2s,box-shadow .2s",
  },
  eye: {
    position: "absolute",
    right: "12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#334155",
    display: "flex",
    alignItems: "center",
    padding: "4px",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "14px",
    borderRadius: "10px",
    background: "linear-gradient(135deg,#1D6EF5,#0ea5e9)",
    border: "none",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "'DM Sans',sans-serif",
    cursor: "pointer",
    transition: "opacity .2s,transform .1s",
    boxShadow: "0 6px 20px rgba(29,110,245,.35)",
    marginTop: "4px",
  },
  btnOff: { opacity: 0.7, cursor: "not-allowed" },
  spinner: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,.3)",
    borderTop: "2px solid #fff",
    borderRadius: "50%",
    animation: "spin .7s linear infinite",
  },
  cardFoot: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "11px",
    color: "#1e293b",
    paddingTop: "20px",
    borderTop: "1px solid rgba(255,255,255,.05)",
  },
  footDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#22c55e",
    flexShrink: 0,
  },
};
