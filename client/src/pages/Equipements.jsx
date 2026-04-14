// Fichier : client/src/pages/Equipements.jsx
import { useState, useEffect, useCallback } from "react";
import { equipementService } from "../services/api";

const CATEGORIES = ["Défibrillateur","Monitoring","Ventilation","Oxymétrie","Perfusion","Immobilisation","Protection","Médicament","Autre"];
const ETATS = ["opérationnel","en-panne","à-vérifier","en-réparation","retiré"];

const ETAT_CFG = {
  "opérationnel":   { label: "Opérationnel",   bg: "bg-green-100",  text: "text-green-700"  },
  "en-panne":       { label: "En panne",        bg: "bg-red-100",    text: "text-red-700"    },
  "à-vérifier":     { label: "À vérifier",      bg: "bg-yellow-100", text: "text-yellow-700" },
  "en-réparation":  { label: "En réparation",   bg: "bg-orange-100", text: "text-orange-700" },
  "retiré":         { label: "Retiré",           bg: "bg-slate-100",  text: "text-slate-600"  },
};

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary bg-white";

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

function ModalEquipement({ equip, onClose, onSaved }) {
  const editing = !!equip?._id;
  const [form, setForm] = useState({
    nom: equip?.nom || "",
    categorie: equip?.categorie || "Autre",
    fabricant: equip?.fabricant || "",
    modele: equip?.modele || "",
    numeroSerie: equip?.numeroSerie || "",
    etat: equip?.etat || "opérationnel",
    niveauPriorite: equip?.niveauPriorite || "normal",
    notes: equip?.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) { setErreur("Nom obligatoire."); return; }
    setLoading(true);
    try {
      if (editing) await equipementService.update(equip._id, form);
      else await equipementService.create(form);
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
          <h3 className="font-brand font-bold text-navy text-base">{editing ? "Modifier" : "Nouvel équipement"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
        </div>
        {erreur && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{erreur}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Nom *</label>
            <input type="text" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Catégorie *</label>
              <select value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">État</label>
              <select value={form.etat} onChange={(e) => setForm((f) => ({ ...f, etat: e.target.value }))} className={inputCls}>
                {ETATS.map((e) => <option key={e} value={e}>{ETAT_CFG[e]?.label || e}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Fabricant</label>
              <input type="text" value={form.fabricant} onChange={(e) => setForm((f) => ({ ...f, fabricant: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Modèle</label>
              <input type="text" value={form.modele} onChange={(e) => setForm((f) => ({ ...f, modele: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Numéro de série</label>
            <input type="text" value={form.numeroSerie} onChange={(e) => setForm((f) => ({ ...f, numeroSerie: e.target.value.toUpperCase() }))} className={inputCls} />
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

export default function Equipements() {
  const [equipements, setEquipements] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreEtat, setFiltreEtat] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [modal, setModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtreEtat) params.etat = filtreEtat;
      if (filtreCategorie) params.categorie = filtreCategorie;
      const [eRes, sRes] = await Promise.all([
        equipementService.getAll(params),
        equipementService.getStats().catch(() => ({ data: null })),
      ]);
      const data = eRes.data;
      setEquipements(Array.isArray(data) ? data : data?.equipements || []);
      setStats(sRes.data);
    } catch {
      setErreur("Impossible de charger les équipements.");
    } finally {
      setLoading(false);
    }
  }, [filtreEtat, filtreCategorie]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDesactiver = async (id) => {
    if (!window.confirm("Désactiver cet équipement ?")) return;
    try {
      await equipementService.delete(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur.");
    }
  };

  const handleEtat = async (id, etat) => {
    try {
      await equipementService.updateEtat(id, etat);
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
          <h1 className="font-brand font-bold text-navy text-xl">Équipements</h1>
          <p className="text-slate-400 text-sm mt-0.5">{equipements.length} équipement(s)</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-md shadow-primary/20">
          <span className="material-symbols-outlined text-base">add</span>
          Nouvel équipement
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-navy" },
            { label: "Opérationnels", value: stats.parEtat?.operationnel, color: "text-green-600" },
            { label: "En panne", value: stats.parEtat?.enPanne, color: "text-red-600" },
            { label: "À vérifier", value: stats.parEtat?.aVerifier, color: "text-yellow-600" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-2xl font-mono font-bold ${k.color}`}>{k.value ?? "—"}</p>
              <p className="text-xs text-slate-400 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={filtreEtat} onChange={(e) => setFiltreEtat(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
          <option value="">Tous les états</option>
          {ETATS.map((e) => <option key={e} value={e}>{ETAT_CFG[e]?.label || e}</option>)}
        </select>
        <select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-slate-200">
              <tr>
                {["Nom", "Catégorie", "État", "N° Série", "Véhicule", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {equipements.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Aucun équipement</td></tr>
              ) : (
                equipements.map((e) => {
                  const cfg = ETAT_CFG[e.etat] || ETAT_CFG["à-vérifier"];
                  return (
                    <tr key={e._id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy">{e.nom}</p>
                        {e.fabricant && <p className="text-xs text-slate-400">{e.fabricant}{e.modele ? ` · ${e.modele}` : ""}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.categorie}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.numeroSerie || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{e.uniteAssignee?.nom || e.uniteAssignee?.immatriculation || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setModal({ equip: e })} className="text-xs text-primary font-semibold hover:underline">Modifier</button>
                          {e.etat !== "en-panne" && (
                            <button onClick={() => handleEtat(e._id, "en-panne")} className="text-xs text-orange-500 font-semibold hover:underline">Panne</button>
                          )}
                          {e.etat === "en-panne" && (
                            <button onClick={() => handleEtat(e._id, "opérationnel")} className="text-xs text-green-600 font-semibold hover:underline">Réparer</button>
                          )}
                          <button onClick={() => handleDesactiver(e._id)} className="text-xs text-red-500 font-semibold hover:underline">Retirer</button>
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
        <ModalEquipement
          equip={modal.equip}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
