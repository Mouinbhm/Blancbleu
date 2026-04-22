import { useState, useEffect, useCallback } from "react";
import { missionService, transportService, vehicleService, personnelService } from "../services/api";
import useSocket from "../hooks/useSocket";

const STATUT_CONFIG = {
  planifiee: { label: "Planifiée", cls: "bg-slate-100 text-slate-600", icon: "schedule" },
  assignee:  { label: "Assignée",  cls: "bg-blue-100 text-blue-700",  icon: "person_pin_circle" },
  en_cours:  { label: "En cours",  cls: "bg-amber-100 text-amber-700", icon: "directions_car" },
  terminee:  { label: "Terminée",  cls: "bg-green-100 text-green-700", icon: "check_circle" },
  annulee:   { label: "Annulée",   cls: "bg-red-100 text-red-700",    icon: "cancel" },
};

const DISPATCH_LABEL = { manuel: "Manuel", auto: "Auto", ia: "IA" };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

// ── Modale : créer une mission (assigner un transport) ─────────────────────────
function ModalNouvelleMission({ onClose, onSuccess }) {
  const [transports, setTransports] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [form, setForm] = useState({ transportId: "", vehicleId: "", chauffeurId: "", dispatchMode: "manuel" });
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    Promise.all([
      transportService.getAll({ statut: "ASSIGNED,SCHEDULED,CONFIRMED", limit: 50 }),
      vehicleService.getAll({ disponible: "true" }),
      personnelService.getAll({ statut: "en-service", limit: 50 }),
    ]).then(([t, v, p]) => {
      // Transports qui peuvent recevoir une mission
      const ts = (t.data?.transports || t.data?.data || []).filter(
        (tr) => ["CONFIRMED", "SCHEDULED", "ASSIGNED"].includes(tr.statut)
      );
      setTransports(ts);
      setVehicles(v.data || []);
      setPersonnel(p.data?.personnel || p.data || []);
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.transportId) return setErreur("Sélectionnez un transport");
    setSubmitting(true);
    setErreur("");
    try {
      await missionService.create({
        transportId: form.transportId,
        vehicleId: form.vehicleId || undefined,
        chauffeurId: form.chauffeurId || undefined,
        dispatchMode: form.dispatchMode,
        plannedAt: new Date(),
      });
      onSuccess();
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-brand font-bold text-navy text-base">Nouvelle mission / Dispatch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm">{erreur}</div>}

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Transport à assigner *</label>
            <select value={form.transportId} onChange={(e) => set("transportId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="">-- Sélectionner un transport --</option>
              {transports.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.numero} — {t.motif} · {t.patient?.nom} {t.patient?.prenom} ({t.statut})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Véhicule</label>
            <select value={form.vehicleId} onChange={(e) => set("vehicleId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="">-- Non assigné --</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>{v.nom} — {v.immatriculation} ({v.type})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Chauffeur</label>
            <select value={form.chauffeurId} onChange={(e) => set("chauffeurId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="">-- Non assigné --</option>
              {personnel.map((p) => (
                <option key={p._id} value={p._id}>{p.nom} {p.prenom} — {p.role}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Mode de dispatch</label>
            <div className="flex gap-3">
              {Object.entries(DISPATCH_LABEL).map(([v, l]) => (
                <label key={v} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${form.dispatchMode === v ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  <input type="radio" value={v} checked={form.dispatchMode === v} onChange={() => set("dispatchMode", v)} className="hidden" />
                  {v === "ia" && <span className="material-symbols-outlined text-sm">auto_awesome</span>}
                  {l}
                </label>
              ))}
            </div>
            {form.dispatchMode === "ia" && (
              <p className="text-xs text-violet-600 mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">info</span>
                Le véhicule et le chauffeur seront suggérés automatiquement par l'IA (seuil de confiance : 70%).
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-primary text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "Création…" : "Créer la mission"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Carte mission ──────────────────────────────────────────────────────────────
function MissionCard({ mission, onStatutChange }) {
  const t = mission.transportId;
  const cfg = STATUT_CONFIG[mission.statut] || STATUT_CONFIG.planifiee;
  const [updating, setUpdating] = useState(false);

  const handleStatut = async (newStatut) => {
    setUpdating(true);
    try {
      await missionService.updateStatut(mission._id, newStatut);
      onStatutChange();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur");
    } finally {
      setUpdating(false);
    }
  };

  const handleTerminer = async () => {
    const distanceKm = prompt("Distance réelle (km) :");
    if (distanceKm === null) return;
    setUpdating(true);
    try {
      await missionService.terminer(mission._id, { distanceKm: parseFloat(distanceKm) || null });
      onStatutChange();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${cfg.cls}`}>
              <span className="material-symbols-outlined text-xs">{cfg.icon}</span>
              {cfg.label}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {DISPATCH_LABEL[mission.dispatchMode] || "Manuel"}
            </span>
            {mission.iaRecommendation?.confidence != null && (
              <span
                title={mission.iaRecommendation.justification || "Recommandation IA"}
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  mission.iaRecommendation.confidence >= 0.7
                    ? "bg-violet-100 text-violet-700"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                IA {Math.round(mission.iaRecommendation.confidence * 100)}%
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-navy mt-2 truncate">
            {t?.motif} — {t?.patient?.nom} {t?.patient?.prenom}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {t?.adresseDepart?.rue} → {t?.adresseDestination?.nom || t?.adresseDestination?.rue}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-mono text-slate-500">{t?.numero}</p>
          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(mission.plannedAt)}</p>
        </div>
      </div>

      {/* Affectations */}
      <div className="flex items-center gap-4 text-xs text-slate-600 mb-3 flex-wrap">
        {mission.vehicleId ? (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-slate-400 text-sm">airport_shuttle</span>
            {mission.vehicleId.nom} — {mission.vehicleId.immatriculation}
          </span>
        ) : (
          <span className="text-slate-300 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">airport_shuttle</span>Véhicule non assigné
          </span>
        )}
        {mission.chauffeurId ? (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
            {mission.chauffeurId.nom} {mission.chauffeurId.prenom}
          </span>
        ) : (
          <span className="text-slate-300 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">person</span>Non assigné
          </span>
        )}
        {mission.dureeReelleMinutes && (
          <span className="flex items-center gap-1 text-green-600">
            <span className="material-symbols-outlined text-sm">timer</span>
            {mission.dureeReelleMinutes} min
          </span>
        )}
      </div>

      {/* Actions terrain */}
      {!["terminee", "annulee"].includes(mission.statut) && (
        <div className="flex gap-2 flex-wrap border-t border-slate-50 pt-3">
          {mission.statut === "planifiee" && (
            <button
              onClick={() => handleStatut("en_cours")}
              disabled={updating}
              className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              Démarrer
            </button>
          )}
          {mission.statut === "assignee" && (
            <button
              onClick={() => handleStatut("en_cours")}
              disabled={updating}
              className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              En route
            </button>
          )}
          {mission.statut === "en_cours" && (
            <button
              onClick={handleTerminer}
              disabled={updating}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              Terminer la mission
            </button>
          )}
          <button
            onClick={() => handleStatut("annulee")}
            disabled={updating}
            className="text-xs border border-red-200 text-red-400 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function Missions() {
  const [missions, setMissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [showModal, setShowModal] = useState(false);
  const { subscribe } = useSocket();

  const loadData = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const params = { limit: 100 };
      if (filtreStatut) params.statut = filtreStatut;
      const [missRes, statsRes] = await Promise.all([
        missionService.getAll(params),
        missionService.getStats(),
      ]);
      setMissions(missRes.data?.missions || []);
      setStats(statsRes.data);
    } catch {
      setErreur("Impossible de charger les missions.");
    } finally {
      setLoading(false);
    }
  }, [filtreStatut]);

  useEffect(() => { loadData(); }, [loadData]);

  // Mise à jour temps réel
  useEffect(() => {
    const unsub = subscribe("mission:updated", () => loadData());
    return unsub;
  }, [subscribe, loadData]);

  const groupedMissions = missions.reduce((acc, m) => {
    const key = m.statut;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const statutOrder = ["en_cours", "assignee", "planifiee", "terminee", "annulee"];

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showModal && (
        <ModalNouvelleMission
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData(); }}
        />
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Missions</h1>
          <p className="text-slate-400 text-sm mt-0.5">Dispatch & suivi opérationnel terrain</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouvelle mission
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total", val: stats.total, icon: "local_shipping", color: "text-navy" },
            { label: "En cours", val: stats.enCours, icon: "directions_car", color: "text-amber-600" },
            { label: "Planifiées", val: stats.planifiees, icon: "schedule", color: "text-blue-600" },
            { label: "Terminées", val: stats.terminees, icon: "check_circle", color: "text-green-600" },
            { label: "Annulées", val: stats.annulees, icon: "cancel", color: "text-red-400" },
          ].map(({ label, val, icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <span className={`material-symbols-outlined ${color}`}>{icon}</span>
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-xl font-mono font-bold ${color}`}>{val}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtre statut */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex items-center gap-2 flex-wrap">
        {[{ value: "", label: "Toutes" }, ...Object.entries(STATUT_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map(
          ({ value, label }) => (
            <button
              key={value}
              onClick={() => setFiltreStatut(value)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filtreStatut === value ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {label}
            </button>
          )
        )}
        <span className="text-xs text-slate-400 ml-auto">{missions.length} mission(s)</span>
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>}

      {loading ? <Spinner /> : missions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
          <span className="material-symbols-outlined text-4xl block mb-2">local_shipping</span>
          Aucune mission trouvée
        </div>
      ) : (
        <div className="space-y-6">
          {statutOrder.map((statut) => {
            const liste = groupedMissions[statut];
            if (!liste || liste.length === 0) return null;
            const cfg = STATUT_CONFIG[statut];
            return (
              <div key={statut}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`material-symbols-outlined text-sm ${cfg.cls.split(" ")[1]}`}>{cfg.icon}</span>
                  <h2 className="font-brand font-bold text-navy text-sm uppercase tracking-wide">{cfg.label}</h2>
                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{liste.length}</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {liste.map((m) => (
                    <MissionCard key={m._id} mission={m} onStatutChange={loadData} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
