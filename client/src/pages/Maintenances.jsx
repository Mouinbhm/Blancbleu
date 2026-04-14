// Fichier : client/src/pages/Maintenances.jsx
import { useState, useEffect, useCallback } from "react";
import { maintenanceService, vehicleService } from "../services/api";

const TYPES_MAINTENANCE = [
  "Révision complète","Vidange + filtres","Changement freins","Changement pneus",
  "Contrôle technique","Réparation moteur","Carrosserie","Électricité","Autre",
];

const STATUT_CFG = {
  "planifié":  { label: "Planifié",   bg: "bg-blue-100",   text: "text-blue-700"   },
  "en-cours":  { label: "En cours",   bg: "bg-orange-100", text: "text-orange-700" },
  "terminé":   { label: "Terminé",    bg: "bg-green-100",  text: "text-green-700"  },
  "annulé":    { label: "Annulé",     bg: "bg-slate-100",  text: "text-slate-500"  },
};

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary bg-white";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

function ModalMaintenance({ maintenance, vehicles, onClose, onSaved }) {
  const editing = !!maintenance?._id;
  const [form, setForm] = useState({
    unite: maintenance?.unite?._id || maintenance?.unite || "",
    type: maintenance?.type || "Révision complète",
    statut: maintenance?.statut || "planifié",
    dateDebut: maintenance?.dateDebut ? new Date(maintenance.dateDebut).toISOString().split("T")[0] : "",
    garage: maintenance?.garage || "",
    cout: maintenance?.cout || 0,
    notes: maintenance?.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.unite || !form.dateDebut) { setErreur("Véhicule et date obligatoires."); return; }
    setLoading(true);
    try {
      if (editing) await maintenanceService.update(maintenance._id, form);
      else await maintenanceService.create(form);
      onSaved();
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-brand font-bold text-navy text-base">{editing ? "Modifier" : "Nouvelle maintenance"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
        </div>
        {erreur && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{erreur}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Véhicule *</label>
            <select value={form.unite} onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))} className={inputCls}>
              <option value="">Choisir un véhicule…</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>{v.nom} — {v.immatriculation} ({v.type})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
                {TYPES_MAINTENANCE.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Statut</label>
              <select value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))} className={inputCls}>
                {Object.entries(STATUT_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Date début *</label>
              <input type="date" value={form.dateDebut} onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Coût (€)</label>
              <input type="number" min={0} value={form.cout} onChange={(e) => setForm((f) => ({ ...f, cout: parseFloat(e.target.value) || 0 }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Garage</label>
            <input type="text" value={form.garage} onChange={(e) => setForm((f) => ({ ...f, garage: e.target.value }))} className={inputCls} placeholder="Nom du garage" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-surface">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Maintenances() {
  const [maintenances, setMaintenances] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [modal, setModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtreStatut ? { statut: filtreStatut } : {};
      const [mRes, vRes, sRes] = await Promise.all([
        maintenanceService.getAll(params),
        vehicleService.getAll(),
        maintenanceService.getStats().catch(() => ({ data: null })),
      ]);
      const mData = mRes.data;
      setMaintenances(Array.isArray(mData) ? mData : mData?.maintenances || []);
      const vData = vRes.data;
      setVehicles(Array.isArray(vData) ? vData : vData?.vehicles || []);
      setStats(sRes.data);
    } catch {
      setErreur("Impossible de charger les maintenances.");
    } finally {
      setLoading(false);
    }
  }, [filtreStatut]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatut = async (id, statut) => {
    try {
      await maintenanceService.updateStatut(id, statut);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur.");
    }
  };

  const handleSupprimer = async (id) => {
    if (!window.confirm("Supprimer cette maintenance ?")) return;
    try {
      await maintenanceService.delete(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur.");
    }
  };

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Maintenances</h1>
          <p className="text-slate-400 text-sm mt-0.5">{maintenances.length} entrée(s)</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-md shadow-primary/20">
          <span className="material-symbols-outlined text-base">add</span>
          Nouvelle maintenance
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total",      value: stats.total,     color: "text-navy"        },
            { label: "Planifiées", value: stats.planifiees, color: "text-blue-600"   },
            { label: "En cours",   value: stats.enCours,   color: "text-orange-600"  },
            { label: "Terminées",  value: stats.terminees, color: "text-green-600"   },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-2xl font-mono font-bold ${k.color}`}>{k.value ?? "—"}</p>
              <p className="text-xs text-slate-400 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtres statut */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[{ value: "", label: "Toutes" }, ...Object.entries(STATUT_CFG).map(([v, c]) => ({ value: v, label: c.label }))].map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltreStatut(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              filtreStatut === f.value ? "bg-primary text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-slate-200">
              <tr>
                {["Véhicule", "Type", "Statut", "Date début", "Garage", "Coût", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {maintenances.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Aucune maintenance</td></tr>
              ) : (
                maintenances.map((m) => {
                  const cfg = STATUT_CFG[m.statut] || STATUT_CFG["planifié"];
                  return (
                    <tr key={m._id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{m.unite?.nom || "—"}</p>
                        <p className="text-xs text-slate-400 font-mono">{m.unite?.immatriculation || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{m.type}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(m.dateDebut)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{m.garage || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                        {m.cout ? `${m.cout.toLocaleString("fr-FR")} €` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setModal({ maintenance: m })} className="text-xs text-primary font-semibold hover:underline">Modifier</button>
                          {m.statut === "planifié" && (
                            <button onClick={() => handleStatut(m._id, "en-cours")} className="text-xs text-orange-500 font-semibold hover:underline">Démarrer</button>
                          )}
                          {m.statut === "en-cours" && (
                            <button onClick={() => handleStatut(m._id, "terminé")} className="text-xs text-green-600 font-semibold hover:underline">Terminer</button>
                          )}
                          {!["terminé", "annulé"].includes(m.statut) && (
                            <button onClick={() => handleStatut(m._id, "annulé")} className="text-xs text-red-500 font-semibold hover:underline">Annuler</button>
                          )}
                          {["terminé", "annulé"].includes(m.statut) && (
                            <button onClick={() => handleSupprimer(m._id)} className="text-xs text-slate-400 font-semibold hover:underline">Supprimer</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <ModalMaintenance
          maintenance={modal.maintenance}
          vehicles={vehicles}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
