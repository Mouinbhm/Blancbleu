import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMessage(data.message);
      setStatus("success");
    } catch (err) {
      setMessage(err.response?.data?.message || "Une erreur est survenue.");
      setStatus("error");
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

        {status === "success" ? (
          /* ── Succès ── */
          <div style={s.successBox} className="fadeUp">
            <div style={s.successIcon}>✉</div>
            <h2 style={s.title}>Email envoyé !</h2>
            <p style={s.sub}>
              Un lien de réinitialisation a été envoyé à{" "}
              <strong style={{ color: "#e2e8f0" }}>{email}</strong>. Vérifiez
              votre boîte mail et vos spams.
            </p>
            <div style={s.infoBox}>
              ⏱ Le lien est valable <strong>1 heure</strong> uniquement.
            </div>
            <Link to="/login" style={s.backBtn}>
              ← Retour à la connexion
            </Link>
          </div>
        ) : (
          /* ── Formulaire ── */
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
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                <circle cx="12" cy="16" r="1" fill="#1D6EF5" />
              </svg>
            </div>

            <h2 style={s.title}>Mot de passe oublié ?</h2>
            <p style={s.sub}>
              Entrez votre adresse email et nous vous enverrons un lien pour
              réinitialiser votre mot de passe.
            </p>

            {status === "error" && <div style={s.errBox}>⚠ {message}</div>}

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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.fr"
                    style={s.input}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                style={{ ...s.btn, ...(status === "loading" ? s.btnOff : {}) }}
              >
                {status === "loading" ? (
                  <>
                    <span style={s.spinner} /> Envoi en cours…
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
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Envoyer le lien
                  </>
                )}
              </button>
            </form>

            <Link to="/login" style={s.back}>
              ← Retour à la connexion
            </Link>
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
    maxWidth: "440px",
    padding: "48px 48px",
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
    textDecoration: "none",
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
    letterSpacing: "-0.01em",
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
    marginBottom: "24px",
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
  back: {
    display: "block",
    textAlign: "center",
    fontSize: "13px",
    color: "#475569",
    marginTop: "8px",
    cursor: "pointer",
  },
  successBox: { textAlign: "center" },
  successIcon: { fontSize: "48px", marginBottom: "20px" },
  infoBox: {
    backgroundColor: "rgba(29,110,245,.08)",
    border: "1px solid rgba(29,110,245,.15)",
    borderRadius: "8px",
    padding: "12px 16px",
    fontSize: "13px",
    color: "#60a5fa",
    margin: "20px 0",
  },
  backBtn: {
    display: "inline-block",
    marginTop: "8px",
    padding: "12px 28px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,.1)",
    color: "#94a3b8",
    fontSize: "14px",
    cursor: "pointer",
  },
};
