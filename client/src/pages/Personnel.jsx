// Fichier : client/src/pages/Personnel.jsx
import { useState, useEffect, useCallback } from "react";
import { personnelService } from "../services/api";

const ROLES = ["Ambulancier", "Secouriste", "Infirmier", "Médecin", "Chauffeur", "Autre"];
const STATUTS = ["en-service", "conge", "formation", "maladie", "inactif"];

const STATUT_CFG = {
  "en-service": { label: "En service",  bg: "bg-green-100",  text: "text-green-700"  },
  conge:        { label: "Congé",        bg: "bg-blue-100",   text: "text-blue-700"   },
  formation:    { label: "Formation",    bg: "bg-indigo-100", text: "text-indigo-700" },
  maladie:      { label: "Maladie",      bg: "bg-red-100",    text: "text-red-700"    },
  inactif:      { label: "Inactif",      bg: "bg-slate-100",  text: "text-slate-600"  },
};

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary bg-white";

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

function ModalMembre({ membre, onClose, onSaved }) {
  const editing = !!membre?._id;
  const [form, setForm] = useState({
    nom: membre?.nom || "",
    prenom: membre?.prenom || "",
    role: membre?.role || "Ambulancier",
    statut: membre?.statut || "en-service",
    telephone: membre?.telephone || "",
    email: membre?.email || "",
    notes: membre?.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim()) {
      setErreur("Nom et prénom sont obligatoires.");
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        await personnelService.update(membre._id, form);
      } else {
        await personnelService.create(form);
      }
      onSaved();
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-brand font-bold text-navy text-base">
            {editing ? "Modifier le membre" : "Nouveau membre"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {erreur && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{erreur}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Nom *</label>
              <input type="text" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Prénom *</label>
              <input type="text" value={form.prenom} onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Rôle</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Statut</label>
              <select value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))} className={inputCls}>
                {STATUTS.map((s) => <option key={s} value={s}>{STATUT_CFG[s]?.label || s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Téléphone</label>
            <input type="tel" value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} className={inputCls} placeholder="06 00 00 00 00" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
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

export default function Personnel() {
  const [personnel, setPersonnel] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreRole, setFiltreRole] = useState("");
  const [recherche, setRecherche] = useState("");
  const [modal, setModal] = useState(null); // null | { membre? }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        personnelService.getAll(),
        personnelService.getStats().catch(() => ({ data: null })),
      ]);
      const list = Array.isArray(pRes.data) ? pRes.data : pRes.data?.personnel || [];
      setPersonnel(list);
      setStats(sRes.data);
    } catch {
      setErreur("Impossible de charger le personnel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDesactiver = async (id) => {
    if (!window.confirm("Désactiver ce membre ?")) return;
    try {
      await personnelService.delete(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur.");
    }
  };

  const filtre = personnel.filter((p) => {
    if (filtreStatut && p.statut !== filtreStatut) return false;
    if (filtreRole && p.role !== filtreRole) return false;
    if (recherche.trim()) {
      const q = recherche.toLowerCase();
      if (!`${p.nom} ${p.prenom}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Personnel</h1>
          <p className="text-slate-400 text-sm mt-0.5">{personnel.length} membre(s) actif(s)</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20">
          <span className="material-symbols-outlined text-base">person_add</span>
          Nouveau membre
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-navy" },
            { label: "En service", value: stats.parStatut?.enService, color: "text-green-600" },
            { label: "Congé / Maladie", value: (stats.parStatut?.conge || 0) + (stats.parStatut?.maladie || 0), color: "text-orange-600" },
            { label: "Formation", value: stats.parStatut?.formation, color: "text-indigo-600" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-2xl font-mono font-bold ${k.color}`}>{k.value ?? "—"}</p>
              <p className="text-xs text-slate-400 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <span className="material-symbols-outlined text-slate-400">search</span>
          <input type="text" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} className="flex-1 text-sm outline-none" />
        </div>
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => <option key={s} value={s}>{STATUT_CFG[s]?.label || s}</option>)}
        </select>
        <select value={filtreRole} onChange={(e) => setFiltreRole(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>
      )}

      {/* Tableau */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-slate-200">
              <tr>
                {["Membre", "Rôle", "Statut", "Téléphone", "Véhicule assigné", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtre.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">Aucun membre trouvé</td>
                </tr>
              ) : (
                filtre.map((p) => {
                  const cfg = STATUT_CFG[p.statut] || STATUT_CFG.inactif;
                  return (
                    <tr key={p._id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {p.nom[0]}{p.prenom[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-navy">{p.nom} {p.prenom}</p>
                            {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.role}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.telephone || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {p.uniteAssignee?.nom || p.uniteAssignee?.immatriculation || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setModal({ membre: p })} className="text-xs font-semibold text-primary hover:underline">Modifier</button>
                          <button onClick={() => handleDesactiver(p._id)} className="text-xs font-semibold text-red-500 hover:underline">Désactiver</button>
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
        <ModalMembre
          membre={modal.membre}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
