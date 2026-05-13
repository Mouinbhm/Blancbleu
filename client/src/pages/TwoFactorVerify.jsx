import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { twoFactorService } from "../services/api";

export default function TwoFactorVerify() {
  const { pendingTempToken, completeTwoFactorLogin } = useAuth();

  const [code, setCode]           = useState("");
  const [error, setError]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Entrez votre code");
      return;
    }
    if (!pendingTempToken) {
      setError("Session expirée — retournez à la page de connexion");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await twoFactorService.verifyLogin(pendingTempToken, trimmed);
      completeTwoFactorLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.message || "Code invalide ou expiré");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={s.page}>
      <style>{css}</style>
      <div style={s.bgGrid} />

      <div style={s.card} className="fadeUp">
        <div style={s.header}>
          <div style={s.iconWrap}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h1 style={s.title}>Vérification 2FA</h1>
            <p style={s.sub}>
              {useBackup
                ? "Entrez un code de secours"
                : "Entrez le code de votre application TOTP"}
            </p>
          </div>
        </div>

        {error && <div style={s.err}><span>⚠</span> {error}</div>}

        <form onSubmit={handleSubmit} style={s.form}>
          <input
            type="text"
            inputMode={useBackup ? "text" : "numeric"}
            pattern={useBackup ? undefined : "[0-9]{6}"}
            maxLength={useBackup ? 11 : 6}
            value={code}
            onChange={(e) => {
              const val = useBackup
                ? e.target.value.toUpperCase()
                : e.target.value.replace(/\D/g, "");
              setCode(val);
              setError("");
            }}
            placeholder={useBackup ? "XXXXX-XXXXX" : "000000"}
            style={s.codeInput}
            autoFocus
          />

          <button
            type="submit"
            disabled={submitting || !code.trim()}
            style={{ ...s.btn, ...(submitting || !code.trim() ? s.btnOff : {}) }}
          >
            {submitting
              ? <><span style={s.spin} /> Vérification…</>
              : "Valider"}
          </button>
        </form>

        <button
          type="button"
          style={s.toggleLink}
          onClick={() => { setUseBackup(!useBackup); setCode(""); setError(""); }}
        >
          {useBackup ? "Utiliser mon code TOTP" : "Utiliser un code de secours"}
        </button>

        <a href="/login" style={s.backLink}>
          Retour à la connexion
        </a>
      </div>
    </div>
  );
}

const css = `
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .fadeUp{animation:fadeUp .5s ease both}
`;

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#04080F",
    fontFamily: "'DM Sans',system-ui,sans-serif",
    color: "#e2e8f0",
    padding: "24px",
    position: "relative",
  },
  bgGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage: "linear-gradient(rgba(29,110,245,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(29,110,245,.05) 1px,transparent 1px)",
    backgroundSize: "48px 48px",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "rgba(6,11,24,.9)",
    border: "1px solid rgba(29,110,245,.15)",
    borderRadius: "16px",
    padding: "40px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "28px",
  },
  iconWrap: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    background: "linear-gradient(135deg,#1D6EF5,#0ea5e9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#fff",
    marginBottom: "4px",
  },
  sub: { fontSize: "13px", color: "#475569" },
  err: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    borderRadius: "8px",
    backgroundColor: "rgba(239,68,68,.1)",
    border: "1px solid rgba(239,68,68,.25)",
    color: "#fca5a5",
    fontSize: "13px",
    marginBottom: "16px",
  },
  form: { display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" },
  codeInput: {
    width: "100%",
    padding: "16px",
    textAlign: "center",
    fontSize: "26px",
    letterSpacing: "0.25em",
    backgroundColor: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: "10px",
    color: "#fff",
    fontFamily: "monospace",
    outline: "none",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "14px",
    borderRadius: "10px",
    background: "linear-gradient(135deg,#1D6EF5,#0ea5e9)",
    border: "none",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  btnOff: { opacity: 0.5, cursor: "not-allowed" },
  spin: {
    display: "inline-block",
    width: "14px",
    height: "14px",
    border: "2px solid rgba(255,255,255,.3)",
    borderTop: "2px solid #fff",
    borderRadius: "50%",
    animation: "spin .7s linear infinite",
  },
  toggleLink: {
    display: "block",
    width: "100%",
    background: "none",
    border: "none",
    color: "#60a5fa",
    fontSize: "13px",
    textAlign: "center",
    cursor: "pointer",
    padding: "8px",
    marginBottom: "12px",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  backLink: {
    display: "block",
    textAlign: "center",
    fontSize: "12px",
    color: "#334155",
    textDecoration: "none",
  },
};
