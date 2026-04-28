/**
 * BlancBleu — DemoControls
 * Boutons "Charger données démo" et "Effacer démo" pour la soutenance.
 * Invisibles en production (NODE_ENV === 'production').
 */
import { useState } from "react";
import api from "../../services/api";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function DemoControls({ onSuccess }) {
  const [seeding, setSeeding]     = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast]         = useState(null); // { type, msg }

  if (!IS_DEV) return null;

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post("/demo/seed");
      showToast(
        "success",
        `✅ ${data.transports_crees} transports + ${data.vehicules_crees} véhicules chargés`,
      );
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast("error", `❌ ${err.response?.data?.message || err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Supprimer toutes les données démo ?")) return;
    setResetting(true);
    try {
      const { data } = await api.post("/demo/reset");
      showToast(
        "success",
        `🗑 Données démo supprimées (${data.deleted.transports} transports, ${data.deleted.vehicules} véhicules)`,
      );
      if (onSuccess) onSuccess();
    } catch (err) {
      showToast("error", `❌ ${err.response?.data?.message || err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* Seed button */}
      <button
        onClick={handleSeed}
        disabled={seeding || resetting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-slate-500 border border-dashed border-slate-300 rounded-lg hover:border-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {seeding ? (
          <>
            <div className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Chargement...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-sm">bolt</span>
            Charger données démo
          </>
        )}
      </button>

      {/* Reset button */}
      <button
        onClick={handleReset}
        disabled={seeding || resetting}
        title="Supprimer toutes les données démo"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono text-slate-400 border border-dashed border-slate-200 rounded-lg hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {resetting ? (
          <div className="w-3 h-3 border border-slate-300 border-t-red-500 rounded-full animate-spin" />
        ) : (
          <span className="material-symbols-outlined text-sm">delete</span>
        )}
        Effacer démo
      </button>

      {/* Toast inline */}
      {toast && (
        <div
          className={`absolute top-full mt-2 left-0 z-50 px-3 py-2 rounded-lg text-xs font-medium shadow-lg whitespace-nowrap ${
            toast.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
