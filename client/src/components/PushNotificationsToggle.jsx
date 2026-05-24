import { usePushNotifications } from "../hooks/usePushNotifications";

/**
 * Bouton compact : active/désactive les notifications navigateur (Web Push).
 * Affiche un état clair selon la permission + l'état d'inscription.
 */
export default function PushNotificationsToggle({ className = "" }) {
  const { supported, permission, isSubscribed, loading, error, subscribe, unsubscribe } =
    usePushNotifications();

  if (!supported) {
    return (
      <div className={`text-xs text-slate-500 ${className}`}>
        Notifications navigateur non supportées
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className={`text-xs text-amber-400 ${className}`}>
        <span className="material-symbols-outlined text-sm align-middle mr-1">notifications_off</span>
        Notifications bloquées — autorisez-les dans les paramètres du navigateur
      </div>
    );
  }

  const handleToggle = () => (isSubscribed ? unsubscribe() : subscribe());

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
          ${isSubscribed
            ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            : "bg-white/5 text-slate-400 hover:bg-white/10"
          } disabled:opacity-50`}
      >
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base">
            {isSubscribed ? "notifications_active" : "notifications"}
          </span>
          {loading
            ? "…"
            : isSubscribed
              ? "Notifications activées"
              : "Activer notifs navigateur"}
        </span>
        {isSubscribed && <span className="text-emerald-400">●</span>}
      </button>
      {error && (
        <div className="mt-1 text-xs text-red-400">{error}</div>
      )}
    </div>
  );
}
