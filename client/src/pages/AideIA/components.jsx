/**
 * BlancBleu — Page Aide IA : composants UI partagés.
 *
 * Présentation pure (props uniquement), réutilisés par plusieurs modules :
 * badges (service / confiance), bouton d'onglet, et conteneurs PMT (Section/Row).
 */

export function ServiceBadge({ status }) {
  if (!status) return null;
  const ok = status.available;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-bold border ${
        ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full animate-pulse ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {ok ? "Service IA actif" : "Mode règles locales"}
    </div>
  );
}

export function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-all ${
        active
          ? "bg-primary text-white shadow-md shadow-primary/30"
          : "text-slate-500 hover:text-navy hover:bg-slate-100"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}

export function ConfidenceBadge({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "emerald" : pct >= 50 ? "amber" : "red";
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-${color}-50 text-${color}-700 border border-${color}-200`}
    >
      <span className={`w-2 h-2 rounded-full bg-${color}-500`} />
      Confiance : {pct}%
    </div>
  );
}

export function Section({ title, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-slate-400 text-sm">{icon}</span>
        <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
          {title}
        </p>
      </div>
      <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-100">
        {children}
      </div>
    </div>
  );
}

export function Row({ label, val, highlight, mono }) {
  if (!val)
    return (
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs text-slate-300 italic">Non détecté</span>
      </div>
    );
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`text-xs font-semibold ${highlight ? "text-primary" : "text-navy"} ${mono ? "font-mono" : ""}`}
      >
        {val}
      </span>
    </div>
  );
}
