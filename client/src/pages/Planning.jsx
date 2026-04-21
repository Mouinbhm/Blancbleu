// Fichier : client/src/pages/Planning.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatutBadge from "../components/transport/StatutBadge";
import { planningService, transportService } from "../services/api";

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const fmtDateISO = (d) => new Date(d).toISOString().split("T")[0];

const TYPE_COLOR = {
  VSL:       "bg-blue-100 text-blue-700",
  AMBULANCE: "bg-red-100 text-red-700",
  TPMR:      "bg-purple-100 text-purple-700",
};

const TYPE_ICON = {
  VSL:       "directions_car",
  AMBULANCE: "airport_shuttle",
  TPMR:      "accessible",
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
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

export default function Planning() {
  const navigate = useNavigate();
  const [dateSelectionnee, setDateSelectionnee] = useState(new Date());
  const [transports, setTransports] = useState([]);
  const [nonAssignes, setNonAssignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const dateISO = fmtDateISO(dateSelectionnee);
      const [planRes, unassignedRes] = await Promise.all([
        planningService.daily(dateISO).catch(() => ({ data: { transports: [] } })),
        planningService.unassigned().catch(() => ({ data: { transports: [] } })),
      ]);

      const tData = planRes.data;
      setTransports(
        Array.isArray(tData)
          ? tData
          : tData?.transports || tData?.data || [],
      );

      const uData = unassignedRes.data;
      setNonAssignes(
        Array.isArray(uData)
          ? uData
          : uData?.transports || uData?.data || [],
      );
    } catch {
      setErreur("Impossible de charger le planning.");
    } finally {
      setLoading(false);
    }
  }, [dateSelectionnee]);

  useEffect(() => { loadData(); }, [loadData]);

  const jourPrecedent = () => {
    const d = new Date(dateSelectionnee);
    d.setDate(d.getDate() - 1);
    setDateSelectionnee(d);
  };

  const jourSuivant = () => {
    const d = new Date(dateSelectionnee);
    d.setDate(d.getDate() + 1);
    setDateSelectionnee(d);
  };

  const aujourdhui = () => setDateSelectionnee(new Date());

  // Trier par heure RDV
  const transportsTries = [...transports].sort((a, b) =>
    (a.heureRDV || "").localeCompare(b.heureRDV || ""),
  );

  const isToday =
    fmtDateISO(dateSelectionnee) === fmtDateISO(new Date());

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Planning</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">
            {fmtDate(dateSelectionnee)}
          </p>
        </div>
        <button
          onClick={() => navigate("/transports/new")}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouveau transport
        </button>
      </div>

      {/* Navigation jours */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={jourPrecedent}
          className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-surface transition-colors"
        >
          <span className="material-symbols-outlined text-slate-500">
            chevron_left
          </span>
        </button>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fmtDateISO(dateSelectionnee)}
            onChange={(e) => setDateSelectionnee(new Date(e.target.value + "T12:00:00"))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {!isToday && (
            <button
              onClick={aujourdhui}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-surface transition-colors"
            >
              Aujourd'hui
            </button>
          )}
        </div>
        <button
          onClick={jourSuivant}
          className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-surface transition-colors"
        >
          <span className="material-symbols-outlined text-slate-500">
            chevron_right
          </span>
        </button>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
          {erreur}
        </div>
      )}

      {/* Alerte non assignés */}
      {nonAssignes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-500 text-xl">
            warning
          </span>
          <p className="text-sm text-amber-800">
            <span className="font-bold">{nonAssignes.length} transport(s)</span>{" "}
            sans véhicule assigné nécessitent votre attention.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Planning du jour */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-brand font-bold text-navy text-sm uppercase tracking-wide">
                Transports du jour
              </h2>
              <span className="text-xs font-mono text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                {transportsTries.length} transport(s)
              </span>
            </div>

            {loading ? (
              <Spinner />
            ) : transportsTries.length === 0 ? (
              <div className="py-16 text-center">
                <span
                  className="material-symbols-outlined text-slate-300"
                  style={{ fontSize: 48 }}
                >
                  calendar_today
                </span>
                <p className="text-slate-400 text-sm mt-3">
                  Aucun transport planifié ce jour
                </p>
                <button
                  onClick={() => navigate("/transports/new")}
                  className="mt-4 bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700"
                >
                  Créer un transport
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {transportsTries.map((t) => {
                  const sansVehicule = !t.vehicule;
                  return (
                    <div
                      key={t._id}
                      onClick={() => navigate(`/transports/${String(t._id || t.id)}`)}
                      className={`flex items-center gap-4 px-5 py-4 hover:bg-surface cursor-pointer transition-colors ${
                        sansVehicule ? "border-l-4 border-l-amber-400" : ""
                      }`}
                    >
                      {/* Heure */}
                      <div className="w-14 text-center flex-shrink-0">
                        <p className="font-mono text-lg font-bold text-navy">
                          {t.heureRDV || "—"}
                        </p>
                      </div>

                      {/* Type */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          TYPE_COLOR[t.typeTransport] || "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {TYPE_ICON[t.typeTransport] || "directions_car"}
                        </span>
                      </div>

                      {/* Infos */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-navy truncate">
                            {t.patient?.nom} {t.patient?.prenom}
                          </p>
                          <span className="text-xs text-slate-400">·</span>
                          <p className="text-xs text-slate-500 flex-shrink-0">
                            {t.motif}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 truncate">
                          <span className="material-symbols-outlined text-xs align-middle mr-1">
                            flag
                          </span>
                          {t.adresseDestination?.nom ||
                            t.adresseDestination?.rue ||
                            "Destination inconnue"}
                          {t.adresseDestination?.service
                            ? ` · ${t.adresseDestination.service}`
                            : ""}
                        </p>
                      </div>

                      {/* Véhicule / statut */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <StatutBadge statut={t.statut} />
                        {sansVehicule ? (
                          <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">
                              warning
                            </span>
                            Sans véhicule
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">
                              airport_shuttle
                            </span>
                            {t.vehicule?.nom || t.vehicule?.immatriculation || "Véhicule"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Transports sans véhicule */}
        <div>
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">
                warning
              </span>
              <h2 className="font-brand font-bold text-amber-800 text-sm uppercase tracking-wide">
                Sans véhicule
              </h2>
              {nonAssignes.length > 0 && (
                <span className="ml-auto text-xs font-mono font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  {nonAssignes.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                Chargement…
              </div>
            ) : nonAssignes.length === 0 ? (
              <div className="py-10 text-center">
                <span className="material-symbols-outlined text-green-300 text-3xl block mb-2">
                  check_circle
                </span>
                <p className="text-slate-400 text-sm">
                  Tous les transports sont assignés
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {nonAssignes.map((t) => (
                  <div
                    key={t._id}
                    onClick={() => navigate(`/transports/${String(t._id || t.id)}`)}
                    className="px-4 py-3 hover:bg-surface cursor-pointer transition-colors"
                  >
                    <p className="text-sm font-semibold text-navy">
                      {t.patient?.nom} {t.patient?.prenom}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-slate-400">
                        {t.dateTransport
                          ? new Date(t.dateTransport).toLocaleDateString(
                              "fr-FR",
                              { day: "2-digit", month: "short" },
                            )
                          : "—"}{" "}
                        {t.heureRDV || ""}
                      </p>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          TYPE_COLOR[t.typeTransport] || "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {t.typeTransport}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
