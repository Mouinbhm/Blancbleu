// Fichier : client/src/pages/Transports.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TransportCard from "../components/transport/TransportCard";
import { transportService } from "../services/api";
import useSocket from "../hooks/useSocket";

const fmtDateCourt = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";

const STATUTS = [
  { value: "", label: "Tous les statuts" },
  { value: "REQUESTED", label: "Demandé" },
  { value: "CONFIRMED", label: "Confirmé" },
  { value: "SCHEDULED", label: "Planifié" },
  { value: "ASSIGNED", label: "Assigné" },
  { value: "EN_ROUTE_TO_PICKUP", label: "En route" },
  { value: "PATIENT_ON_BOARD", label: "Patient à bord" },
  { value: "COMPLETED", label: "Terminé" },
  { value: "CANCELLED", label: "Annulé" },
];

const MOTIFS = [
  { value: "", label: "Tous les motifs" },
  "Dialyse", "Chimiothérapie", "Radiothérapie", "Consultation",
  "Hospitalisation", "Sortie hospitalisation", "Rééducation", "Analyse", "Autre",
].map((m) => (typeof m === "string" ? { value: m, label: m } : m));

const TYPES = [
  { value: "", label: "Tous les types" },
  { value: "VSL", label: "VSL" },
  { value: "AMBULANCE", label: "Ambulance" },
  { value: "TPMR", label: "TPMR" },
];

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

export default function Transports() {
  const navigate = useNavigate();
  const [transports, setTransports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [page, setPage] = useState(1);
  const [pendingMobile, setPendingMobile] = useState([]);

  const [filtres, setFiltres] = useState({
    statut: "",
    motif: "",
    typeTransport: "",
    date: "",
    recherche: "",
  });

  const { subscribe } = useSocket();

  const loadPending = useCallback(async () => {
    try {
      const { data } = await transportService.getAll({ statut: "REQUESTED", origine: "PATIENT_APP", limit: 50 });
      const liste = Array.isArray(data) ? data : data?.transports || [];
      setPendingMobile(liste);
    } catch {
      // silencieux — la section disparaît simplement
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const params = { page, limit: 20 };
      if (filtres.statut) params.statut = filtres.statut;
      if (filtres.motif) params.motif = filtres.motif;
      if (filtres.typeTransport) params.typeTransport = filtres.typeTransport;
      if (filtres.date) params.date = filtres.date;
      if (filtres.recherche) params.search = filtres.recherche;

      const { data } = await transportService.getAll(params);
      const liste = Array.isArray(data)
        ? data
        : data?.transports || data?.data || [];
      setTransports(liste);
      setTotal(data?.total || liste.length);
    } catch {
      setErreur("Impossible de charger les transports.");
    } finally {
      setLoading(false);
    }
  }, [filtres, page]);

  useEffect(() => { loadData(); loadPending(); }, [loadData, loadPending]);

  useEffect(() => {
    const reload = () => { loadData(); loadPending(); };
    const u1 = subscribe("transport:statut",         reload);
    const u2 = subscribe("transport:statut_change",  reload);
    const u3 = subscribe("transport:status_updated", reload); // emitted by driver app
    return () => { u1(); u2(); u3(); };
  }, [subscribe, loadData, loadPending]);

  // Nouveau transport créé depuis l'app mobile → recharger + alerte demandes
  useEffect(() => {
    const unsub = subscribe("transport:created", () => { loadData(); loadPending(); });
    return unsub;
  }, [subscribe, loadData, loadPending]);

  const handleFiltre = (key, value) => {
    setFiltres((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Transports</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? "Chargement…" : `${total} transport(s)`}
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

      {/* ── Demandes en attente (app mobile) ───────────────────────────────── */}
      {pendingMobile.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
            </span>
            <h2 className="font-bold text-orange-700 text-sm">
              {pendingMobile.length} demande{pendingMobile.length > 1 ? "s" : ""} en attente — App mobile
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {pendingMobile.map((t) => (
              <div
                key={t._id}
                className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 flex flex-col gap-3"
              >
                {/* Patient + heure */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-orange-400">{t.numero}</p>
                    <p className="font-bold text-navy text-sm">
                      {t.patient?.nom} {t.patient?.prenom}
                    </p>
                  </div>
                  <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-1 rounded-full border border-orange-200 whitespace-nowrap">
                    {fmtDateCourt(t.dateTransport)} · {t.heureRDV || "—"}
                  </span>
                </div>

                {/* Trajet */}
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-orange-400">trip_origin</span>
                    <span className="truncate">{t.adresseDepart?.nom || t.adresseDepart?.rue || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-red-400">location_on</span>
                    <span className="truncate">{t.adresseDestination?.nom || t.adresseDestination?.rue || "—"}</span>
                  </div>
                </div>

                {/* Détails */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    {t.typeTransport}
                  </span>
                  <span className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    {t.motif}
                  </span>
                  {t.allerRetour && (
                    <span className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                      Aller-retour
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-orange-100">
                  <button
                    onClick={async () => {
                      try {
                        await transportService.confirmer(t._id);
                        loadPending();
                        loadData();
                      } catch (err) {
                        alert(err.response?.data?.message || "Erreur");
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                    Confirmer
                  </button>
                  <button
                    onClick={() => navigate(`/transports/${t._id}`)}
                    className="px-3 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold py-2 rounded-lg border border-slate-200 transition-colors"
                  >
                    Voir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <input
          type="text"
          placeholder="Rechercher un patient…"
          value={filtres.recherche}
          onChange={(e) => handleFiltre("recherche", e.target.value)}
          className="col-span-2 lg:col-span-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={filtres.statut}
          onChange={(e) => handleFiltre("statut", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary bg-white"
        >
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={filtres.motif}
          onChange={(e) => handleFiltre("motif", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary bg-white"
        >
          {MOTIFS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={filtres.typeTransport}
          onChange={(e) => handleFiltre("typeTransport", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary bg-white"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filtres.date}
          onChange={(e) => handleFiltre("date", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Erreur */}
      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {erreur}
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <Spinner />
      ) : transports.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <span
            className="material-symbols-outlined text-slate-300"
            style={{ fontSize: 56 }}
          >
            directions_car
          </span>
          <p className="text-slate-400 text-sm mt-3 mb-4">
            Aucun transport trouvé
          </p>
          <button
            onClick={() => navigate("/transports/new")}
            className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
          >
            Créer un transport
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {transports.map((t) => (
              <TransportCard key={t._id} transport={t} onRefresh={loadData} />
            ))}
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-40 hover:bg-surface transition-colors"
              >
                Précédent
              </button>
              <span className="text-sm text-slate-500 font-mono">
                Page {page} / {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-40 hover:bg-surface transition-colors"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
