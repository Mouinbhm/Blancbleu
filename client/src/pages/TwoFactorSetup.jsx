import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { twoFactorService } from "../services/api";

export default function TwoFactorSetup() {
  const { pendingTempToken, completeTwoFactorSetup } = useAuth();

  const [step, setStep] = useState("loading"); // loading | qr | backup | done
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    twoFactorService.setup()
      .then(({ data }) => {
        setQrCodeDataUrl(data.qrCodeDataUrl);
        setManualKey(data.manualKey);
        setStep("qr");
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Erreur lors de la configuration 2FA");
        setStep("qr");
      });
  }, []);

  const handleVerifySetup = async (e) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError("Entrez un code à 6 chiffres");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await twoFactorService.verifySetup(code);
      setBackupCodes(data.backupCodes);
      setStep("backup");
    } catch (err) {
      setError(err.response?.data?.message || "Code invalide ou expiré");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={s.page}>
      <style>{css}</style>
      <div style={s.bgGrid} />

      <div style={s.card} className="fadeUp">
        {/* Header */}
        <div style={s.header}>
          <div style={s.iconWrap}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h1 style={s.title}>Double authentification</h1>
            <p style={s.sub}>Sécurisez votre compte administrateur</p>
          </div>
        </div>

        {/* Étape 1 — QR Code */}
        {step === "loading" && (
          <div style={s.center}>
            <div style={s.spinner} />
            <p style={s.hint}>Génération du QR code…</p>
          </div>
        )}

        {step === "qr" && (
          <>
            <div style={s.steps}>
              <div style={s.stepItem}>
                <div style={s.stepNum}>1</div>
                <p style={s.stepText}>
                  Installez <strong>Google Authenticator</strong> ou <strong>Authy</strong> sur votre téléphone.
                </p>
              </div>
              <div style={s.stepItem}>
                <div style={s.stepNum}>2</div>
                <p style={s.stepText}>
                  Scannez le QR code ci-dessous ou saisissez la clé manuelle.
                </p>
              </div>
              <div style={s.stepItem}>
                <div style={s.stepNum}>3</div>
                <p style={s.stepText}>
                  Entrez le code à 6 chiffres affiché dans l'application.
                </p>
              </div>
            </div>

            {qrCodeDataUrl && (
              <div style={s.qrWrap}>
                <img src={qrCodeDataUrl} alt="QR code 2FA" style={s.qr} />
              </div>
            )}

            {manualKey && (
              <div style={s.manualKeyBox}>
                <p style={s.manualKeyLabel}>Clé manuelle</p>
                <code style={s.manualKey}>{manualKey}</code>
              </div>
            )}

            {error && <div style={s.err}><span>⚠</span> {error}</div>}

            <form onSubmit={handleVerifySetup} style={s.form}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }}
                placeholder="Code à 6 chiffres"
                style={s.codeInput}
                autoFocus
              />
              <button type="submit" disabled={submitting || code.length !== 6} style={s.btn}>
                {submitting ? <><span style={s.spin} /> Vérification…</> : "Activer la 2FA"}
              </button>
            </form>
          </>
        )}

        {/* Étape 2 — Backup codes */}
        {step === "backup" && (
          <>
            <div style={s.successBanner}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Double authentification activée avec succès !
            </div>

            <div style={s.backupSection}>
              <p style={s.backupTitle}>Codes de secours</p>
              <p style={s.backupWarning}>
                Conservez ces codes en lieu sûr. Chaque code ne peut être utilisé qu'une seule fois.
                Ils vous permettront de vous connecter si vous perdez accès à votre application TOTP.
              </p>
              <div style={s.backupGrid}>
                {backupCodes.map((c, i) => (
                  <code key={i} style={s.backupCode}>{c}</code>
                ))}
              </div>
              <button type="button" onClick={handleCopyBackupCodes} style={s.copyBtn}>
                {copied ? "Copié !" : "Copier les codes"}
              </button>
            </div>

            <button
              type="button"
              onClick={completeTwoFactorSetup}
              style={s.btn}
            >
              J'ai sauvegardé mes codes — Continuer
            </button>
          </>
        )}
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
    maxWidth: "500px",
    backgroundColor: "rgba(6,11,24,.9)",
    border: "1px solid rgba(29,110,245,.15)",
    borderRadius: "16px",
    padding: "40px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "32px",
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
  steps: { display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" },
  stepItem: { display: "flex", alignItems: "flex-start", gap: "12px" },
  stepNum: {
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    background: "rgba(29,110,245,.2)",
    border: "1px solid rgba(29,110,245,.4)",
    color: "#60a5fa",
    fontSize: "13px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepText: { fontSize: "14px", color: "#94a3b8", lineHeight: 1.6, paddingTop: "3px" },
  qrWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "20px",
    padding: "16px",
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,.06)",
  },
  qr: { width: "200px", height: "200px", borderRadius: "8px" },
  manualKeyBox: {
    backgroundColor: "rgba(29,110,245,.06)",
    border: "1px solid rgba(29,110,245,.2)",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "20px",
  },
  manualKeyLabel: { fontSize: "11px", color: "#60a5fa", marginBottom: "6px", letterSpacing: "0.08em" },
  manualKey: {
    display: "block",
    fontSize: "14px",
    color: "#e2e8f0",
    letterSpacing: "0.12em",
    wordBreak: "break-all",
    fontFamily: "monospace",
  },
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
  form: { display: "flex", flexDirection: "column", gap: "14px" },
  codeInput: {
    width: "100%",
    padding: "14px",
    textAlign: "center",
    fontSize: "28px",
    letterSpacing: "0.3em",
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
  spin: {
    display: "inline-block",
    width: "14px",
    height: "14px",
    border: "2px solid rgba(255,255,255,.3)",
    borderTop: "2px solid #fff",
    borderRadius: "50%",
    animation: "spin .7s linear infinite",
  },
  center: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 0" },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid rgba(29,110,245,.2)",
    borderTop: "3px solid #1D6EF5",
    borderRadius: "50%",
    animation: "spin .7s linear infinite",
  },
  hint: { fontSize: "14px", color: "#475569" },
  successBanner: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(74,222,128,.08)",
    border: "1px solid rgba(74,222,128,.2)",
    color: "#4ade80",
    fontSize: "14px",
    fontWeight: 500,
    marginBottom: "24px",
  },
  backupSection: { marginBottom: "24px" },
  backupTitle: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#fff",
    marginBottom: "8px",
  },
  backupWarning: {
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: 1.6,
    marginBottom: "16px",
  },
  backupGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginBottom: "12px",
  },
  backupCode: {
    padding: "8px 12px",
    backgroundColor: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#e2e8f0",
    fontFamily: "monospace",
    letterSpacing: "0.08em",
    textAlign: "center",
  },
  copyBtn: {
    background: "none",
    border: "1px solid rgba(29,110,245,.3)",
    color: "#60a5fa",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    width: "100%",
    marginBottom: "4px",
  },
};
