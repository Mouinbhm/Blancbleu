/**
 * Toasts UI — notifications éphémères + confirmation inline.
 * Extraits du monolithe Factures.jsx (comportement identique).
 */

export function ToastContainer({ toasts }) {
  const CFG = {
    success: { bg: "bg-emerald-600", icon: "check_circle" },
    error: { bg: "bg-red-600", icon: "error" },
    warning: { bg: "bg-orange-500", icon: "warning" },
  };
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const c = CFG[t.type] || CFG.warning;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-3 ${c.bg} text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium min-w-64 max-w-xs`}
            style={{ animation: "slideInRight .2s ease" }}
          >
            <span className="material-symbols-outlined text-base flex-shrink-0">{c.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmToast({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-[200]" style={{ transform: "translateX(-50%)" }}>
      <div className="flex items-center gap-4 bg-slate-800 text-white rounded-2xl shadow-2xl px-5 py-3.5 text-sm font-medium whitespace-nowrap">
        <span className="material-symbols-outlined text-yellow-400 text-base">help</span>
        <span>{message}</span>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white text-xs font-bold"
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400"
        >
          Confirmer
        </button>
      </div>
    </div>
  );
}
