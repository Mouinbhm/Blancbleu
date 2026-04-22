import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatutBadge from "../components/transport/StatutBadge";
import { patientService } from "../services/api";

const MOBILITE_LABEL = {
  ASSIS: "Assis",
  FAUTEUIL_ROULANT: "Fauteuil roulant",
  ALLONGE: "Allongé",
  CIVIERE: "Civière",
};

const MOBILITE_BADGE_COLOR = {
  ASSIS: "bg-green-100 text-green-700",
  FAUTEUIL_ROULANT: "bg-blue-100 text-blue-700",
  ALLONGE: "bg-orange-100 text-orange-700",
  CIVIERE: "bg-red-100 text-red-700",
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

// ── Modale de création rapide patient ─────────────────────────────────────────
function ModalNouveauPatient({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    nom: "", prenom: "", telephone: "", email: "", dateNaissance: "",
    mobilite: "ASSIS", oxygene: false, brancardage: false, accompagnateur: false,
    numeroSecu: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return setErreur("Le nom est obligatoire");
    setSubmitting(true);
    setErreur("");
    try {
      const { data } = await patientService.create(form);
      onSuccess(data);
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
          <h2 className="font-brand font-bold text-navy text-base">Nouveau patient</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm">{erreur}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Nom *</label>
              <input value={form.nom} onChange={(e) => set("nom", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Prénom</label>
              <input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Téléphone</label>
              <input type="tel" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Date de naissance</label>
              <input type="date" value={form.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">N° Sécurité sociale</label>
            <input value={form.numeroSecu} onChange={(e) => set("numeroSecu", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary font-mono" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Mobilité</label>
            <select value={form.mobilite} onChange={(e) => set("mobilite", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
              {Object.entries(MOBILITE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            {[["oxygene", "Oxygène"], ["brancardage", "Brancardage"], ["accompagnateur", "Accompagnateur"]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="rounded" />
                {l}
              </label>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-primary text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "Création…" : "Créer le patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [patientSelectionne, setPatientSelectionne] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const [patientsRes, statsRes] = await Promise.all([
        patientService.getAll({ limit: 200, recherche: recherche || undefined }),
        patientService.getStats(),
      ]);
      setPatients(patientsRes.data?.patients || []);
      setStats(statsRes.data);
    } catch {
      setErreur("Impossible de charger les patients.");
    } finally {
      setLoading(false);
    }
  }, [recherche]);

  useEffect(() => {
    const timer = setTimeout(loadData, 300); // debounce recherche
    return () => clearTimeout(timer);
  }, [loadData]);

  const handlePatientCreated = (newPatient) => {
    setShowModal(false);
    setPatients((prev) => [newPatient, ...prev]);
    setPatientSelectionne(newPatient);
  };

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showModal && (
        <ModalNouveauPatient
          onClose={() => setShowModal(false)}
          onSuccess={handlePatientCreated}
        />
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Patients</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {stats ? `${stats.total} patient(s) · ${stats.actifs} actifs` : "Chargement…"}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          Nouveau patient
        </button>
      </div>

      {/* Indicateurs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total", val: stats.total, icon: "group", color: "text-navy" },
            { label: "Actifs", val: stats.actifs, icon: "check_circle", color: "text-green-600" },
            { label: "Inactifs", val: stats.inactifs, icon: "block", color: "text-slate-400" },
            { label: "Fauteuil", val: stats.parMobilite?.find(m => m._id === "FAUTEUIL_ROULANT")?.count || 0, icon: "accessible", color: "text-blue-600" },
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

      {/* Recherche */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">search</span>
        <input
          type="text"
          placeholder="Rechercher par nom, prénom, téléphone ou N° sécurité sociale…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
        />
        {recherche && (
          <button onClick={() => setRecherche("")}>
            <span className="material-symbols-outlined text-slate-400 text-base">close</span>
          </button>
        )}
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Liste patients */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                {patients.length} patient(s)
              </div>
              {patients.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  {recherche ? "Aucun résultat" : "Aucun patient enregistré"}
                </div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                  {patients.map((p) => {
                    const isSelected = patientSelectionne?._id === p._id;
                    return (
                      <div
                        key={p._id}
                        onClick={() => setPatientSelectionne(isSelected ? null : p)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-surface"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {p.nom?.[0]?.toUpperCase()}{p.prenom?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">
                            {p.nom} {p.prenom}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {p.telephone || p.numeroPatient || "—"}
                          </p>
                        </div>
                        {p.mobilite && p.mobilite !== "ASSIS" && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${MOBILITE_BADGE_COLOR[p.mobilite] || "bg-slate-100 text-slate-600"}`}>
                            {MOBILITE_LABEL[p.mobilite]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Détail patient */}
          <div className="lg:col-span-2">
            {!patientSelectionne ? (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center h-full flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 48 }}>personal_injury</span>
                <p className="text-slate-400 text-sm mt-3">Sélectionnez un patient pour voir sa fiche</p>
              </div>
            ) : (
              <PatientDetail
                patient={patientSelectionne}
                onNavigate={navigate}
                onEdit={() => loadData()}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fiche détail patient ───────────────────────────────────────────────────────
function PatientDetail({ patient, onNavigate, onEdit }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    patientService.getOne(patient._id)
      .then(({ data }) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [patient._id]);

  if (loading) return <div className="bg-white rounded-xl border border-slate-200 p-8"><Spinner /></div>;
  const p = detail || patient;

  return (
    <div className="space-y-4">
      {/* Fiche patient */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-navy flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {p.nom?.[0]?.toUpperCase()}{p.prenom?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-brand font-bold text-navy text-lg">{p.nom} {p.prenom}</h2>
              <span className="text-xs font-mono text-slate-400">{p.numeroPatient}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {p.telephone && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">call</span>{p.telephone}
                </span>
              )}
              {p.dateNaissance && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">cake</span>{fmtDate(p.dateNaissance)}
                </span>
              )}
              {p.mobilite && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOBILITE_BADGE_COLOR[p.mobilite] || "bg-slate-100 text-slate-600"}`}>
                  {MOBILITE_LABEL[p.mobilite]}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate(`/transports/new?patientId=${p._id}`)}
            className="flex-shrink-0 flex items-center gap-1 text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Transport
          </button>
        </div>

        {/* Besoins spéciaux */}
        {(p.oxygene || p.brancardage || p.accompagnateur) && (
          <div className="flex gap-2 flex-wrap mb-3">
            {p.oxygene && <span className="text-xs bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-1 rounded-full">Oxygène</span>}
            {p.brancardage && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">Brancardage</span>}
            {p.accompagnateur && <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-1 rounded-full">Accompagnateur</span>}
          </div>
        )}

        {/* Infos admin */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {p.numeroSecu && (
            <div>
              <span className="text-slate-400">N° Sécu</span>
              <p className="font-mono text-slate-700 mt-0.5">{p.numeroSecu}</p>
            </div>
          )}
          {p.contactUrgence?.nom && (
            <div>
              <span className="text-slate-400">Contact urgence</span>
              <p className="text-slate-700 mt-0.5">{p.contactUrgence.nom} ({p.contactUrgence.lien}) — {p.contactUrgence.telephone}</p>
            </div>
          )}
        </div>

        {p.notes && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">{p.notes}</div>
        )}
      </div>

      {/* Historique transports */}
      {detail?.transports?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-brand font-bold text-navy text-sm uppercase tracking-wide">
              Historique ({detail.transports.length} transport(s))
            </h3>
          </div>
          <div className="divide-y divide-slate-50">
            {detail.transports.map((t) => (
              <div
                key={t._id}
                onClick={() => onNavigate(`/transports/${t._id}`)}
                className="flex items-center gap-4 px-5 py-3 hover:bg-surface cursor-pointer transition-colors"
              >
                <div className="min-w-[80px]">
                  <p className="text-xs font-mono text-slate-500">{fmtDate(t.dateTransport)}</p>
                  <p className="text-sm font-bold text-navy">{t.heureRDV || "—"}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{t.motif}</p>
                  <p className="text-xs text-slate-400 truncate">{t.adresseDestination?.nom || t.adresseDestination?.rue || "—"}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400">{t.typeTransport}</span>
                  <StatutBadge statut={t.statut} />
                </div>
                {t.recurrence?.active && (
                  <span className="material-symbols-outlined text-primary text-base">repeat</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {detail?.transports?.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          Aucun transport enregistré pour ce patient
        </div>
      )}
    </div>
  );
}
