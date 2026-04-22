import { useState, useEffect, useCallback } from "react";
import { prescriptionService, patientService } from "../services/api";

const STATUT_CONFIG = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  expiree: { label: "Expirée", cls: "bg-red-100 text-red-700" },
  annulee: { label: "Annulée", cls: "bg-slate-100 text-slate-500" },
  en_attente_validation: { label: "À valider", cls: "bg-amber-100 text-amber-700" },
};

const MOTIFS = [
  "Dialyse","Chimiothérapie","Radiothérapie","Consultation",
  "Hospitalisation","Sortie hospitalisation","Rééducation","Analyse","Autre",
];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

// ── Modale Nouvelle Prescription ─────────────────────────────────────────────
function ModalNouvellePrescription({ onClose, onSuccess }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    patientId: "", motif: "Consultation",
    dateEmission: new Date().toISOString().slice(0, 10),
    dateExpiration: "",
    "medecin.nom": "", "medecin.specialite": "", "medecin.etablissement": "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");
  const [recherchePatient, setRecherchePatient] = useState("");

  useEffect(() => {
    patientService.getAll({ limit: 100, recherche: recherchePatient || undefined })
      .then(({ data }) => setPatients(data.patients || []))
      .catch(() => {});
  }, [recherchePatient]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patientId) return setErreur("Sélectionnez un patient");
    if (!form.dateEmission) return setErreur("Date d'émission obligatoire");
    setSubmitting(true);
    setErreur("");
    try {
      const payload = {
        patientId: form.patientId,
        motif: form.motif,
        dateEmission: form.dateEmission,
        dateExpiration: form.dateExpiration || undefined,
        medecin: {
          nom: form["medecin.nom"],
          specialite: form["medecin.specialite"],
          etablissement: form["medecin.etablissement"],
        },
        notes: form.notes,
      };
      const { data } = await prescriptionService.create(payload);
      onSuccess(data);
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-brand font-bold text-navy text-base">Nouvelle prescription (PMT)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm">{erreur}</div>}

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Patient *</label>
            <input
              placeholder="Rechercher un patient…"
              value={recherchePatient}
              onChange={(e) => setRecherchePatient(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary mb-1"
            />
            <select
              value={form.patientId}
              onChange={(e) => set("patientId", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
              size={4}
            >
              <option value="">-- Sélectionner --</option>
              {patients.map((p) => (
                <option key={p._id} value={p._id}>{p.nom} {p.prenom} — {p.numeroPatient}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Motif *</label>
            <select value={form.motif} onChange={(e) => set("motif", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
              {MOTIFS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date d'émission *</label>
              <input type="date" value={form.dateEmission} onChange={(e) => set("dateEmission", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date d'expiration</label>
              <input type="date" value={form.dateExpiration} onChange={(e) => set("dateExpiration", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Médecin prescripteur</p>
            <div className="space-y-2">
              <input placeholder="Nom du médecin" value={form["medecin.nom"]} onChange={(e) => set("medecin.nom", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
              <input placeholder="Spécialité" value={form["medecin.specialite"]} onChange={(e) => set("medecin.specialite", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
              <input placeholder="Établissement" value={form["medecin.etablissement"]} onChange={(e) => set("medecin.etablissement", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-primary text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "Création…" : "Créer la prescription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreMotif, setFiltreMotif] = useState("");
  const [showModal, setShowModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const params = {};
      if (filtreStatut) params.statut = filtreStatut;
      if (filtreMotif) params.motif = filtreMotif;
      const [presRes, statsRes] = await Promise.all([
        prescriptionService.getAll({ ...params, limit: 100 }),
        prescriptionService.getStats(),
      ]);
      setPrescriptions(presRes.data?.prescriptions || []);
      setStats(statsRes.data);
    } catch {
      setErreur("Impossible de charger les prescriptions.");
    } finally {
      setLoading(false);
    }
  }, [filtreStatut, filtreMotif]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleValider = async (id) => {
    try {
      await prescriptionService.valider(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de la validation");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Annuler cette prescription ?")) return;
    try {
      await prescriptionService.delete(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur");
    }
  };

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showModal && (
        <ModalNouvellePrescription
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData(); }}
        />
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Prescriptions (PMT)</h1>
          <p className="text-slate-400 text-sm mt-0.5">Prescriptions Médicales de Transport</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouvelle prescription
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total", val: stats.total, icon: "description", color: "text-navy" },
            { label: "Actives", val: stats.actives, icon: "check_circle", color: "text-green-600" },
            { label: "À valider", val: stats.enAttente, icon: "pending", color: "text-amber-600" },
            { label: "Expirées", val: stats.expirees, icon: "schedule", color: "text-red-500" },
            { label: "Expirent < 7j", val: stats.expirantBientot, icon: "warning", color: "text-orange-500" },
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

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex items-center gap-3 flex-wrap">
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select value={filtreMotif} onChange={(e) => setFiltreMotif(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary">
          <option value="">Tous les motifs</option>
          {MOTIFS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(filtreStatut || filtreMotif) && (
          <button onClick={() => { setFiltreStatut(""); setFiltreMotif(""); }} className="text-sm text-primary hover:underline">
            Réinitialiser
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{prescriptions.length} résultat(s)</span>
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {prescriptions.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <span className="material-symbols-outlined text-4xl block mb-2">description</span>
              Aucune prescription trouvée
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                  <th className="px-5 py-3 text-left">Numéro</th>
                  <th className="px-5 py-3 text-left">Patient</th>
                  <th className="px-5 py-3 text-left">Motif</th>
                  <th className="px-5 py-3 text-left">Médecin</th>
                  <th className="px-5 py-3 text-left">Émission</th>
                  <th className="px-5 py-3 text-left">Expiration</th>
                  <th className="px-5 py-3 text-left">Statut</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {prescriptions.map((p) => {
                  const cfg = STATUT_CONFIG[p.statut] || { label: p.statut, cls: "bg-slate-100 text-slate-500" };
                  const expireSoon = p.dateExpiration && p.statut === "active" &&
                    new Date(p.dateExpiration) <= new Date(Date.now() + 7 * 86400000);
                  return (
                    <tr key={p._id} className="hover:bg-surface transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.numero}</td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-navy">
                          {p.patientId?.nom} {p.patientId?.prenom}
                        </span>
                        <br />
                        <span className="text-xs text-slate-400">{p.patientId?.numeroPatient}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{p.motif}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {p.medecin?.nom ? (
                          <>
                            <span>{p.medecin.nom}</span>
                            {p.medecin.specialite && <span className="text-xs text-slate-400 block">{p.medecin.specialite}</span>}
                          </>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">{fmtDate(p.dateEmission)}</td>
                      <td className="px-5 py-3 font-mono text-xs">
                        <span className={expireSoon ? "text-orange-600 font-bold" : "text-slate-600"}>
                          {fmtDate(p.dateExpiration)}
                        </span>
                        {expireSoon && <span className="material-symbols-outlined text-orange-500 text-xs ml-1 align-middle">warning</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {p.statut === "en_attente_validation" && (
                            <button
                              onClick={() => handleValider(p._id)}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg font-semibold hover:bg-green-700"
                            >
                              Valider
                            </button>
                          )}
                          {!["annulee", "expiree"].includes(p.statut) && (
                            <button
                              onClick={() => handleDelete(p._id)}
                              className="text-xs text-red-400 hover:text-red-600"
                              title="Annuler"
                            >
                              <span className="material-symbols-outlined text-base">cancel</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
