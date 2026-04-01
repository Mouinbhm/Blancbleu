import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "../services/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [valid, setValid] = useState(null); // null=checking, true, false
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  // Vérifier le token au chargement
  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    api
      .get(`/auth/reset-password/${token}`)
      .then(() => setValid(true))
      .catch(() => setValid(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setStatus("loading");
    try {
      await api.post("/auth/reset-password", {
        token,
        password: form.password,
      });
      setStatus("success");
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Une erreur est survenue.");
      setStatus("idle");
    }
  };

  return (
    <div style={s.page}>
      <style>{css}</style>
      <div style={s.bgGrid} />
      <div style={s.bgGlow} />

      <div style={s.box} className="fadeUp">
        {/* Logo */}
        <Link to="/login" style={s.logo}>
          <div style={s.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
          <span style={s.logoName}>
            <span style={s.logoW}>Blanc</span>
            <span style={s.logoB}>Bleu</span>
          </span>
        </Link>

        {/* Vérification en cours */}
        {valid === null && (
          <div style={s.center}>
            <span style={s.spinner} />
            <p style={s.sub}>Vérification du lien…</p>
          </div>
        )}

        {/* Token invalide */}
        {valid === false && (
          <div style={s.center} className="fadeUp">
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>⚠️</div>
            <h2 style={s.title}>Lien invalide ou expiré</h2>
            <p style={s.sub}>
              Ce lien de réinitialisation n'est plus valide. Il a peut-être
              expiré (1h) ou déjà été utilisé.
            </p>
            <Link to="/forgot-password" style={s.btn}>
              Faire une nouvelle demande
            </Link>
          </div>
        )}

        {/* Succès */}
        {status === "success" && (
          <div style={s.center} className="fadeUp">
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>✅</div>
            <h2 style={s.title}>Mot de passe modifié !</h2>
            <p style={s.sub}>
              Votre mot de passe a été réinitialisé avec succès. Vous allez être
              redirigé vers la connexion…
            </p>
            <Link to="/login" style={s.btn}>
              Se connecter maintenant
            </Link>
          </div>
        )}

        {/* Formulaire */}
        {valid === true && status !== "success" && (
          <>
            <div style={s.iconWrap}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1D6EF5"
                strokeWidth="1.8"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h2 style={s.title}>Nouveau mot de passe</h2>
            <p style={s.sub}>
              Choisissez un nouveau mot de passe sécurisé pour votre compte.
            </p>

            {error && <div style={s.errBox}>⚠ {error}</div>}

            <form onSubmit={handleSubmit} style={s.form} autoComplete="off">
              <div style={s.field}>
                <label style={s.label}>Nouveau mot de passe</label>
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
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder="Min. 6 caractères"
                    style={s.input}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    style={s.eye}
                  >
                    {showPwd ? "🙈" : "👁"}
                  </button>
                </div>
                {/* Indicateur de force */}
                {form.password && (
                  <div style={s.strength}>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          ...s.strengthBar,
                          backgroundColor:
                            form.password.length >= i * 3
                              ? i <= 1
                                ? "#ef4444"
                                : i <= 2
                                  ? "#f59e0b"
                                  : i <= 3
                                    ? "#3b82f6"
                                    : "#22c55e"
                              : "rgba(255,255,255,.08)",
                        }}
                      />
                    ))}
                    <span style={s.strengthLabel}>
                      {form.password.length < 4
                        ? "Très faible"
                        : form.password.length < 7
                          ? "Faible"
                          : form.password.length < 10
                            ? "Moyen"
                            : "Fort"}
                    </span>
                  </div>
                )}
              </div>

              <div style={s.field}>
                <label style={s.label}>Confirmer le mot de passe</label>
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
                    type={showConf ? "text" : "password"}
                    value={form.confirm}
                    onChange={(e) =>
                      setForm({ ...form, confirm: e.target.value })
                    }
                    placeholder="Répétez le mot de passe"
                    style={{
                      ...s.input,
                      borderColor:
                        form.confirm && form.confirm !== form.password
                          ? "rgba(239,68,68,.5)"
                          : undefined,
                    }}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConf(!showConf)}
                    style={s.eye}
                  >
                    {showConf ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                style={{ ...s.btn2, ...(status === "loading" ? s.btnOff : {}) }}
              >
                {status === "loading" ? (
                  <>
                    <span style={s.spinner} /> Enregistrement…
                  </>
                ) : (
                  <>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Réinitialiser le mot de passe
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;600;700;800&family=DM+Sans:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:.08}50%{transform:scale(1.15);opacity:.15}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .fadeUp{animation:fadeUp .6s ease both}
  input:focus{outline:none!important;border-color:#1D6EF5!important;box-shadow:0 0 0 3px rgba(29,110,245,.18)!important}
  input::placeholder{color:#2d3a52}
  a{text-decoration:none}
`;

const s = {
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#04080F",
    fontFamily: "'DM Sans',sans-serif",
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
  bgGlow: {
    position: "absolute",
    top: "-200px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "600px",
    height: "600px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle,rgba(29,110,245,.12) 0%,transparent 70%)",
    animation: "pulse 7s ease-in-out infinite",
    pointerEvents: "none",
  },
  box: {
    width: "100%",
    maxWidth: "460px",
    padding: "48px",
    backgroundColor: "rgba(6,11,24,.8)",
    border: "1px solid rgba(29,110,245,.12)",
    borderRadius: "20px",
    backdropFilter: "blur(24px)",
    margin: "24px",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "40px",
  },
  logoIcon: {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    background: "linear-gradient(135deg,#1D6EF5,#0ea5e9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoName: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "22px",
    fontWeight: 800,
  },
  logoW: { color: "#fff" },
  logoB: { color: "#1D6EF5" },
  iconWrap: {
    width: "56px",
    height: "56px",
    borderRadius: "14px",
    backgroundColor: "rgba(29,110,245,.1)",
    border: "1px solid rgba(29,110,245,.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "24px",
  },
  title: {
    fontFamily: "'Sora',sans-serif",
    fontSize: "26px",
    fontWeight: 800,
    color: "#ffffff",
    marginBottom: "12px",
  },
  sub: {
    fontSize: "14px",
    color: "#475569",
    lineHeight: 1.7,
    marginBottom: "28px",
  },
  errBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
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
    marginBottom: "8px",
  },
  field: { display: "flex", flexDirection: "column", gap: "8px" },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#64748b",
    letterSpacing: "0.03em",
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
    fontSize: "16px",
    padding: "4px",
  },
  strength: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginTop: "6px",
  },
  strengthBar: {
    flex: 1,
    height: "3px",
    borderRadius: "2px",
    transition: "background-color .3s",
  },
  strengthLabel: {
    fontSize: "11px",
    color: "#475569",
    minWidth: "60px",
    textAlign: "right",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "13px 24px",
    borderRadius: "10px",
    background: "linear-gradient(135deg,#1D6EF5,#0ea5e9)",
    border: "none",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "20px",
    boxShadow: "0 6px 20px rgba(29,110,245,.3)",
    textDecoration: "none",
  },
  btn2: {
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
    cursor: "pointer",
    boxShadow: "0 6px 20px rgba(29,110,245,.3)",
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
  center: { textAlign: "center" },
};
