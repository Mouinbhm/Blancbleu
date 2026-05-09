import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function ForceChangePassword() {
  const { user, logout, clearMustChangePassword } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ ancien: "", nouveau: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [apiError, setApiError] = useState("");

  const validate = () => {
    const errs = {};
    if (!form.ancien) errs.ancien = "Requis";
    if (!form.nouveau || form.nouveau.length < 8)
      errs.nouveau = "8 caractères minimum";
    if (form.nouveau !== form.confirm)
      errs.confirm = "Les mots de passe ne correspondent pas";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setApiError("");
    try {
      await userService.updatePassword({
        ancienPassword: form.ancien,
        nouveauPassword: form.nouveau,
      });
      clearMustChangePassword();
      navigate("/dashboard");
    } catch (err) {
      setApiError(err.response?.data?.message || "Erreur lors du changement de mot de passe");
    } finally {
      setSubmitting(false);
    }
  };

  const strength = (() => {
    const p = form.nouveau;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return score;
  })();

  const strengthLabel = ["", "Faible", "Moyen", "Fort", "Très fort"][strength] || "";
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-green-400", "bg-green-500"][strength] || "";

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-navy px-8 py-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-xl">lock_reset</span>
              </div>
              <div>
                <p className="text-xs font-mono text-slate-400 tracking-widest uppercase">
                  Ambulances Blanc Bleu
                </p>
                <p className="text-white font-brand font-bold text-lg leading-tight">
                  Changement de mot de passe
                </p>
              </div>
            </div>
            <p className="text-slate-400 text-sm">
              Bonjour {user?.prenom || ""}. Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant de continuer.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
            {apiError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-lg flex-shrink-0">error</span>
                {apiError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Mot de passe temporaire
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.ancien}
                  onChange={(e) => setForm((f) => ({ ...f, ancien: e.target.value }))}
                  className={`w-full px-3 py-2.5 pr-10 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                    errors.ancien ? "border-red-400" : "border-slate-200"
                  }`}
                  placeholder="Mot de passe reçu par email"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-lg">
                    {showPwd ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              {errors.ancien && <p className="text-xs text-red-500 mt-1">{errors.ancien}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type={showPwd ? "text" : "password"}
                value={form.nouveau}
                onChange={(e) => setForm((f) => ({ ...f, nouveau: e.target.value }))}
                className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  errors.nouveau ? "border-red-400" : "border-slate-200"
                }`}
                placeholder="Minimum 8 caractères"
              />
              {errors.nouveau && <p className="text-xs text-red-500 mt-1">{errors.nouveau}</p>}
              {form.nouveau && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all ${
                          i <= strength ? strengthColor : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{strengthLabel}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type={showPwd ? "text" : "password"}
                value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  errors.confirm ? "border-red-400" : "border-slate-200"
                }`}
                placeholder="Répéter le mot de passe"
              />
              {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-600 mb-1">Recommandations :</p>
              <p className={form.nouveau.length >= 8 ? "text-green-600" : ""}>
                • Au moins 8 caractères
              </p>
              <p className={/[A-Z]/.test(form.nouveau) ? "text-green-600" : ""}>
                • Une lettre majuscule
              </p>
              <p className={/[0-9]/.test(form.nouveau) ? "text-green-600" : ""}>
                • Un chiffre
              </p>
              <p className={/[^A-Za-z0-9]/.test(form.nouveau) ? "text-green-600" : ""}>
                • Un caractère spécial (!@#$...)
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-md shadow-primary/20"
            >
              {submitting ? (
                <span className="material-symbols-outlined animate-spin text-lg">refresh</span>
              ) : (
                <span className="material-symbols-outlined text-lg">check_circle</span>
              )}
              Définir mon mot de passe
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
