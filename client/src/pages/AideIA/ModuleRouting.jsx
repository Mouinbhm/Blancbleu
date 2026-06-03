/**
 * BlancBleu — Aide IA · Module 3 : Optimisation de tournée (OR-Tools VRP).
 */
import { useState } from "react";
import { aiService } from "../../services/api";
import DemoControls from "../../components/ui/DemoControls";
import { fmtApiError } from "./utils";

// ════════════════════════════════════════════════════════════════════════════
// MODULE 3 — OPTIMISATION TOURNÉE
// ════════════════════════════════════════════════════════════════════════════
export default function ModuleRouting({ aiStatus }) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [depot, setDepot] = useState("43.7102,7.2620");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleDemoLoaded = () => {
    // Mettre à jour la date du formulaire avec aujourd'hui et vider les résultats
    setDate(new Date().toISOString().split("T")[0]);
    setResult(null);
    setError("");
  };

  const handleOptimize = async () => {
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const [lat, lng] = depot.split(",").map(Number);
      const { data } = await aiService.optimiserTournee({
        date,
        depot: { lat: lat || 43.7102, lng: lng || 7.262 },
      });
      setResult(data);
    } catch (err) {
      if (err.response?.status === 503) {
        setError(
          "Service d'optimisation non disponible. Vérifiez que le microservice IA Python est démarré.",
        );
      } else {
        setError(fmtApiError(err, "Erreur d'optimisation"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-cyan-700 px-6 py-4">
          <p className="font-mono text-xs text-teal-200 tracking-widest uppercase">
            Module 3 — Route Optimization
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <h2 className="font-brand font-bold text-white text-base">
              Optimisation de tournée — OR-Tools VRP
            </h2>
            <DemoControls onSuccess={handleDemoLoaded} />
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600 mb-4">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Date de la tournée *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
                Position dépôt (lat,lng)
              </label>
              <input
                type="text"
                value={depot}
                onChange={(e) => setDepot(e.target.value)}
                placeholder="43.7102,7.2620"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-5 text-xs text-teal-700 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">info</span>
              Comment ça fonctionne
            </p>
            <p>
              L'algorithme Google OR-Tools récupère tous les transports planifiés pour la date
              sélectionnée (statuts CONFIRMED, SCHEDULED, ASSIGNED et RESCHEDULED) et optimise leur
              répartition sur les véhicules disponibles pour minimiser la distance totale parcourue.
            </p>
          </div>

          {!aiStatus?.available && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 mb-4">
              <strong>Service IA non démarré.</strong> L'optimisation OR-Tools nécessite le
              microservice Python. Lancez :{" "}
              <code className="bg-amber-100 px-1 rounded">
                cd ai-service && setup_et_lancer.bat
              </code>
            </div>
          )}

          <button
            onClick={handleOptimize}
            disabled={loading || !date}
            className="w-full py-4 bg-gradient-to-r from-teal-600 to-cyan-700 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Optimisation OR-Tools en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">route</span>
                OPTIMISER LES TOURNÉES
              </>
            )}
          </button>
        </div>
      </div>

      {/* État chargement */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-mono">
            OR-Tools en cours de calcul… (jusqu'à 30s)
          </p>
        </div>
      )}

      {/* Résultats */}
      {result && !loading && (
        <div className="space-y-4">
          {/* État vide */}
          {result.nbTransports === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-amber-700">
              <span className="material-symbols-outlined text-amber-500">event_busy</span>
              <span>
                Aucun transport confirmé ou planifié pour le <strong>{date}</strong>. Vérifiez les
                statuts dans le planning.
              </span>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Transports", val: result.nbTransports ?? "—", icon: "directions_car" },
              { label: "Véhicules", val: result.nbVehicules ?? "—", icon: "local_shipping" },
              {
                label: "Distance totale",
                val: result.distanceTotale != null ? `${result.distanceTotale} km` : "—",
                icon: "route",
              },
              {
                label: "Durée max",
                val: result.dureeMaxMinutes != null ? `${result.dureeMaxMinutes} min` : "—",
                icon: "timer",
              },
            ].map(({ label, val, icon }) => (
              <div
                key={label}
                className="bg-white rounded-xl border border-slate-200 p-4 text-center"
              >
                <span className="material-symbols-outlined text-teal-500 text-2xl">{icon}</span>
                <p className="font-mono font-bold text-navy text-xl mt-1">{val}</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Statut */}
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold w-fit ${
              result.statut === "OPTIMAL"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : result.statut === "FEASIBLE"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {result.statut === "OPTIMAL"
                ? "check_circle"
                : result.statut === "FEASIBLE"
                  ? "info"
                  : "error"}
            </span>
            {result.statut ?? "—"} — {result.messageOptimiseur ?? ""}
          </div>

          {/* Tournées par véhicule */}
          <div className="grid grid-cols-1 gap-4">
            {result.routes?.map((route) => (
              <div
                key={route.vehiculeId}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-500">local_shipping</span>
                    <p className="font-mono font-bold text-navy">{route.immatriculation}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                    <span>{route.nbTransports} transport(s)</span>
                    <span>{route.distanceTotaleKm} km</span>
                    <span>{route.dureeMinutes} min</span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {route.etapes?.map((etape) => (
                    <div
                      key={`${etape.transportId}-${etape.type}`}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                        etape.type === "PRISE_EN_CHARGE"
                          ? "border-blue-100 bg-blue-50"
                          : "border-emerald-100 bg-emerald-50"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-sm ${
                          etape.type === "PRISE_EN_CHARGE" ? "text-blue-500" : "text-emerald-500"
                        }`}
                      >
                        {etape.type === "PRISE_EN_CHARGE" ? "person_pin_circle" : "flag"}
                      </span>
                      <div>
                        <p className="font-mono font-bold text-navy">{etape.numero}</p>
                        <p className="text-slate-500">
                          {etape.type === "PRISE_EN_CHARGE" ? "Prise en charge" : "Destination"} ·{" "}
                          {etape.adresse}
                        </p>
                        {etape.heureArriveeEstimee && (
                          <p className="text-slate-400">ETA : {etape.heureArriveeEstimee}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
