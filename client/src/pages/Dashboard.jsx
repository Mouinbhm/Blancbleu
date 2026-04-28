// Fichier : client/src/pages/Dashboard.jsx
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import KpiCard from "../components/ui/KpiCard";
import TransportCard from "../components/transport/TransportCard";
import { analyticsService, vehicleService, transportService } from "../services/api";
import useSocket from "../hooks/useSocket";
import DemoControls from "../components/ui/DemoControls";

const HeatmapFlotte = lazy(() =>
  import("../components/dashboard/HeatmapFlotte"),
);
const AlertesFlotte = lazy(() =>
  import("../components/dashboard/AlertesFlotte"),
);

const Spinner = () => (
  <div className="flex items-center justify-center py-12 text-slate-400 gap-3">
    <div
      style={{
        width: 20,
        height: 20,
        border: "2px solid #e2e8f0",
        borderTop: "2px solid #1D6EF5",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
    Chargement…
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [transportsActifs, setTransportsActifs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const { connected, subscribe } = useSocket();

  const loadData = useCallback(async () => {
    try {
      setErreur(null);
      const [dashRes, vehiclesRes, transRes] = await Promise.all([
        analyticsService.dashboard().catch(() => ({ data: null })),
        vehicleService.getAll().catch(() => ({ data: [] })),
        transportService.getAll({
          statut: [
            "EN_ROUTE_TO_PICKUP",
            "ARRIVED_AT_PICKUP",
            "PATIENT_ON_BOARD",
            "ASSIGNED",
          ].join(","),
          limit: 10,
        }).catch(() => ({ data: { transports: [] } })),
      ]);

      setKpis(dashRes.data);
      const vehData = vehiclesRes.data;
      setVehicles(Array.isArray(vehData) ? vehData : vehData?.vehicles || []);
      const tData = transRes.data;
      setTransportsActifs(
        Array.isArray(tData) ? tData : tData?.transports || tData?.data || [],
      );
    } catch (err) {
      setErreur("Impossible de charger les données du tableau de bord.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrediction = useCallback(async () => {
    try {
      const res = await analyticsService.predictionFlotte(7);
      setPrediction(res.data);
    } catch {
      // Prédiction non critique — silence si indisponible (ex: rôle insuffisant)
    }
  }, []);

  useEffect(() => { loadData(); loadPrediction(); }, [loadData, loadPrediction]);

  // Refresh général 60s
  useEffect(() => {
    const iv = setInterval(loadData, 60000);
    return () => clearInterval(iv);
  }, [loadData]);

  // Refresh prédiction 5 min (données moins volatiles)
  useEffect(() => {
    const iv = setInterval(loadPrediction, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadPrediction]);

  // Temps réel : statut mis à jour
  useEffect(() => {
    const unsub = subscribe("status:updated", () => loadData());
    return unsub;
  }, [subscribe, loadData]);

  const disponibles = vehicles.filter((v) => v.statut === "disponible").length;
  const enMission = vehicles.filter((v) => v.statut === "en_mission").length;
  const sansVehicule = kpis?.transportsSansVehicule ?? 0;

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">
            Tableau de bord
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Transport sanitaire non urgent —{" "}
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DemoControls onSuccess={() => { loadData(); loadPrediction(); }} />
          <button
            onClick={() => navigate("/transports/new")}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nouveau transport
          </button>
        </div>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {erreur}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        <KpiCard
          label="Transports actifs"
          value={loading ? "…" : kpis?.transportsActifs ?? enMission}
          color="warning"
          icon="directions_car"
          trend="En déplacement"
        />
        <KpiCard
          label="Planifiés aujourd'hui"
          value={loading ? "…" : kpis?.transportsAujourdhui ?? "—"}
          color="primary"
          icon="calendar_month"
          trend={sansVehicule > 0 ? `${sansVehicule} sans véhicule` : "Tous assignés"}
          trendType={sansVehicule > 0 ? "bad" : "good"}
        />
        <KpiCard
          label="Terminés aujourd'hui"
          value={loading ? "…" : kpis?.transportsTermines ?? "—"}
          color="success"
          icon="check_circle"
          trend="Depuis minuit"
          trendType="good"
        />
        <KpiCard
          label="Véhicules disponibles"
          value={loading ? "…" : disponibles}
          color="primary"
          icon="airport_shuttle"
          trend={`/ ${vehicles.length} total`}
          trendType={disponibles > 0 ? "good" : "bad"}
        />
      </div>

      {/* Alerte véhicules sans transport */}
      {sansVehicule > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-500">
            warning
          </span>
          <p className="text-sm text-amber-800">
            <span className="font-bold">{sansVehicule} transport(s)</span>{" "}
            planifié(s) sans véhicule assigné.
            <button
              onClick={() => navigate("/planning")}
              className="ml-2 font-bold text-amber-700 underline"
            >
              Voir le planning
            </button>
          </p>
        </div>
      )}

      {/* Prévision flotte 7 jours */}
      {prediction && (
        <div className="mb-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">
                insights
              </span>
              <h2 className="font-brand font-bold text-navy text-base uppercase tracking-tight">
                Prévision flotte — 7 jours
              </h2>
            </div>
            <button
              onClick={() => navigate("/planning")}
              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
            >
              Voir le planning →
            </button>
          </div>

          <Suspense
            fallback={
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
                Chargement…
              </div>
            }
          >
            <div className="mb-5">
              <AlertesFlotte
                predictions={prediction.predictions}
                onVoirPlanning={() => navigate("/planning")}
              />
            </div>
            <HeatmapFlotte predictions={prediction.predictions} />
          </Suspense>
        </div>
      )}

      {/* Grille principale */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transports en cours */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-brand font-bold text-navy text-base uppercase tracking-tight">
              Transports en cours
            </h2>
            <button
              onClick={() => navigate("/transports")}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Voir tout →
            </button>
          </div>

          {loading ? (
            <Spinner />
          ) : transportsActifs.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <span
                className="material-symbols-outlined text-slate-300"
                style={{ fontSize: 48 }}
              >
                directions_car
              </span>
              <p className="text-slate-400 text-sm mt-3">
                Aucun transport en cours
              </p>
              <button
                onClick={() => navigate("/transports/new")}
                className="mt-4 bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Créer un transport
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {transportsActifs.map((t) => (
                <TransportCard
                  key={t._id}
                  transport={t}
                  onRefresh={loadData}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panel flotte */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-brand font-bold text-navy text-base uppercase tracking-tight">
              Flotte
            </h2>
            <button
              onClick={() => navigate("/flotte")}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Gérer →
            </button>
          </div>

          {loading ? (
            <Spinner />
          ) : (
            <div className="space-y-2">
              {vehicles.slice(0, 8).map((v) => (
                <div
                  key={v._id}
                  onClick={() => navigate("/flotte")}
                  className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between cursor-pointer hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        v.type === "AMBULANCE"
                          ? "bg-red-100"
                          : v.type === "TPMR"
                            ? "bg-purple-100"
                            : "bg-blue-100"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-base ${
                          v.type === "AMBULANCE"
                            ? "text-red-500"
                            : v.type === "TPMR"
                              ? "text-purple-500"
                              : "text-blue-500"
                        }`}
                      >
                        {v.type === "AMBULANCE"
                          ? "airport_shuttle"
                          : v.type === "TPMR"
                            ? "accessible"
                            : "directions_car"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">
                        {v.nom}
                      </p>
                      <p className="text-xs text-slate-400">{v.type}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      v.statut === "disponible"
                        ? "bg-green-100 text-green-700"
                        : v.statut === "en_mission"
                          ? "bg-orange-100 text-orange-700"
                          : v.statut === "maintenance"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                    }`}
                  >
                    {v.statut === "disponible"
                      ? "Libre"
                      : v.statut === "en_mission"
                        ? "En mission"
                        : v.statut === "maintenance"
                          ? "Maintenance"
                          : "Indisponible"}
                  </span>
                </div>
              ))}

              {vehicles.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Aucun véhicule enregistré
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
