import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { prescriptionService } from "../services/api";
import useSocket from "../hooks/useSocket";
import ModalNouvellePrescription from "../components/prescription/ModalPrescription";

const STATUT_CONFIG = {
  active:                { label: "Active",    cls: "bg-green-100 text-green-700"   },
  expiree:               { label: "Expirée",   cls: "bg-red-100 text-red-700"       },
  annulee:               { label: "Annulée",   cls: "bg-slate-100 text-slate-500"   },
  en_attente_validation: { label: "À valider", cls: "bg-amber-100 text-amber-700"   },
  incomplet:             { label: "Incomplet", cls: "bg-orange-100 text-orange-700" },
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

// ═════════════════════════════════════════════════════════════════════════════
// MODALE DÉTAIL / IMPRESSION
// ═════════════════════════════════════════════════════════════════════════════
function ModalDetailPrescription({ prescription: p, onClose, onEdit }) {
  const cfg = STATUT_CONFIG[p.statut] || { label: p.statut, cls: "bg-slate-100 text-slate-500" };
  const cx = p.contenuExtrait || {};

  const handlePrint = () => {
    const zone = document.getElementById("pmt-print-zone");
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>PMT ${p.numero}</title>
      <style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:20px}
        h2{font-size:14px;margin:0 0 2px}h3{font-size:11px;margin:0;font-weight:bold;text-transform:uppercase;color:#666;letter-spacing:.5px}
        .banner{background:#1A3A5C;color:#fff;padding:8px 12px;font-weight:bold;font-size:13px;margin-bottom:0}
        .card{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .field{margin-bottom:6px}.label{font-size:10px;color:#888;font-weight:bold;text-transform:uppercase}
        .value{font-size:12px;border-bottom:1px solid #e0e0e0;padding-bottom:2px;min-height:16px}
        .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:bold;background:#dcfce7;color:#166534}
        @media print{body{margin:8px}}
      </style></head><body>${zone.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div style={{ background: "#1A3A5C" }} className="px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-white font-bold">{p.numero}</p>
            <p className="text-slate-400 text-xs mt-0.5">CERFA n°11574 — émis le {fmtDate(p.dateEmission)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
              <span className="material-symbols-outlined text-sm">print</span>Imprimer
            </button>
            <button onClick={onEdit} className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
              <span className="material-symbols-outlined text-sm">edit</span>Modifier
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white ml-1">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6" id="pmt-print-zone">
          <div style={{ background: "#1A3A5C", color: "#fff", padding: "8px 12px", fontWeight: "bold", marginBottom: 12 }}>
            PRESCRIPTION MÉDICALE DE TRANSPORT — {p.numero}
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${cfg.cls}`}>{cfg.label}</span>
            <span className="text-sm text-slate-600 font-medium">{p.motif}</span>
            {cx.trajet?.allerRetour && <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">Aller-retour</span>}
          </div>
          <div className="border border-slate-200 rounded-xl p-4 mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Bénéficiaire</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Nom complet</p><p className="font-semibold">{p.patientId?.nom} {p.patientId?.prenom}</p></div>
              {cx.numeroSS && <div><p className="text-xs text-slate-400">N° Sécu</p><p className="font-mono">{cx.numeroSS}</p></div>}
              {cx.dateNaissancePatient && <div><p className="text-xs text-slate-400">Date de naissance</p><p>{fmtDate(cx.dateNaissancePatient)}</p></div>}
              {cx.telephonePatient && <div><p className="text-xs text-slate-400">Téléphone</p><p>{cx.telephonePatient}</p></div>}
              {cx.adressePatient?.rue && <div className="col-span-2"><p className="text-xs text-slate-400">Adresse</p><p>{cx.adressePatient.rue}{cx.adressePatient.cp ? `, ${cx.adressePatient.cp}` : ""}{cx.adressePatient.ville ? ` ${cx.adressePatient.ville}` : ""}</p></div>}
            </div>
          </div>
          <div className="border border-slate-200 rounded-xl p-4 mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Transport prescrit</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {cx.modeTransport && <div><p className="text-xs text-slate-400">Mode</p><p className="font-semibold">{cx.modeTransport}</p></div>}
              {cx.accompagnateur && <div><p className="text-xs text-slate-400">Accompagnateur</p><p>Oui</p></div>}
              {cx.trajet?.adresseDepart && <div><p className="text-xs text-slate-400">Départ</p><p>{cx.trajet.adresseDepart}</p></div>}
              {cx.trajet?.adresseArrivee && <div><p className="text-xs text-slate-400">Destination</p><p>{cx.trajet.adresseArrivee}</p></div>}
              {cx.trajet?.structureSoins && <div className="col-span-2"><p className="text-xs text-slate-400">Structure de soins</p><p>{cx.trajet.structureSoins}</p></div>}
              {cx.trajet?.nbTransportsIteratifs > 0 && <div><p className="text-xs text-slate-400">Transports itératifs</p><p>{cx.trajet.nbTransportsIteratifs}</p></div>}
            </div>
            {cx.situation && Object.values(cx.situation).some(Boolean) && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-2">Situation</p>
                <div className="flex flex-wrap gap-1.5">
                  {cx.situation.hemodialyse    && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Hémodialyse</span>}
                  {cx.situation.chimiotherapie && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Chimiothérapie</span>}
                  {cx.situation.radiotherapie  && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Radiothérapie</span>}
                  {cx.situation.hospitalisation && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Hospitalisation</span>}
                  {cx.situation.aldExonerante  && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">ALD exonérante</span>}
                  {cx.situation.atMp           && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">AT/MP</span>}
                </div>
              </div>
            )}
          </div>
          <div className="border border-slate-200 rounded-xl p-4 mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Prescripteur</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Médecin</p><p className="font-semibold">{p.medecin?.nom} {p.medecin?.prenom}</p></div>
              {p.medecin?.specialite   && <div><p className="text-xs text-slate-400">Spécialité</p><p>{p.medecin.specialite}</p></div>}
              {p.medecin?.etablissement && <div><p className="text-xs text-slate-400">Établissement</p><p>{p.medecin.etablissement}</p></div>}
              {p.medecin?.rpps         && <div><p className="text-xs text-slate-400">RPPS</p><p className="font-mono">{p.medecin.rpps}</p></div>}
              {p.medecin?.telephone    && <div><p className="text-xs text-slate-400">Téléphone</p><p>{p.medecin.telephone}</p></div>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div className="border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-400">Date d'émission</p>
              <p className="font-semibold">{fmtDate(p.dateEmission)}</p>
            </div>
            <div className="border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-400">Date d'expiration</p>
              <p className={`font-semibold ${!p.dateExpiration ? "text-slate-300" : ""}`}>{fmtDate(p.dateExpiration)}</p>
            </div>
          </div>
          {p.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Notes médicales</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{p.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODAL INCOMPLET
// ═════════════════════════════════════════════════════════════════════════════
function ModalIncomplet({ prescription, onClose, onSuccess }) {
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!commentaire.trim()) return;
    setLoading(true);
    try {
      await prescriptionService.incomplet(prescription._id, commentaire.trim());
      onSuccess();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-500">report_problem</span>
            <h2 className="font-bold text-navy text-base">Marquer incomplète</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-500">
            Indiquez au patient ce qu'il doit corriger pour que sa prescription soit validée.
          </p>
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 font-mono">
            {prescription.numero} · {prescription.motif}
          </div>
          <textarea
            rows={4}
            placeholder="Ex : Le nom du médecin est manquant. Veuillez joindre l'ordonnance signée en PDF…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 resize-none"
            autoFocus
          />
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !commentaire.trim()}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-40 transition-colors"
          >
            {loading ? "Envoi…" : "Envoyer au patient"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE — LISTE DES PRESCRIPTIONS
// ═════════════════════════════════════════════════════════════════════════════
export default function Prescriptions() {
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState([]);
  const [pendingMobile, setPendingMobile] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreMotif, setFiltreMotif] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showIncomplet, setShowIncomplet] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);

  const { subscribe } = useSocket();

  const loadPendingMobile = useCallback(async () => {
    try {
      const res = await prescriptionService.getAll({ statut: "en_attente_validation", source: "PATIENT_APP", limit: 50 });
      setPendingMobile(res.data?.prescriptions || []);
    } catch { /* silencieux */ }
  }, []);

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

  useEffect(() => { loadData(); loadPendingMobile(); }, [loadData, loadPendingMobile]);

  useEffect(() => {
    const unsub = subscribe("prescription:created", () => { loadData(); loadPendingMobile(); });
    return unsub;
  }, [subscribe, loadData, loadPendingMobile]);

  const handleValider = async (id) => {
    try {
      await prescriptionService.valider(id);
      loadData();
      loadPendingMobile();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de la validation");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Annuler cette prescription ?")) return;
    try {
      await prescriptionService.delete(id);
      loadData();
      loadPendingMobile();
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

      {showDetail && selectedPrescription && (
        <ModalDetailPrescription
          prescription={selectedPrescription}
          onClose={() => { setShowDetail(false); setSelectedPrescription(null); }}
          onEdit={() => { setShowDetail(false); setShowEdit(true); }}
        />
      )}

      {showEdit && selectedPrescription && (
        <ModalNouvellePrescription
          prescriptionToEdit={selectedPrescription}
          onClose={() => { setShowEdit(false); setSelectedPrescription(null); }}
          onSuccess={() => { setShowEdit(false); setSelectedPrescription(null); loadData(); }}
        />
      )}

      {showIncomplet && selectedPrescription && (
        <ModalIncomplet
          prescription={selectedPrescription}
          onClose={() => { setShowIncomplet(false); setSelectedPrescription(null); }}
          onSuccess={() => { setShowIncomplet(false); setSelectedPrescription(null); loadData(); loadPendingMobile(); }}
        />
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Prescriptions (PMT)</h1>
          <p className="text-slate-400 text-sm mt-0.5">Prescriptions Médicales de Transport — CERFA n°11574</p>
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
            { label: "Total",        val: stats.total,           icon: "description", color: "text-navy"       },
            { label: "Actives",      val: stats.actives,         icon: "check_circle", color: "text-green-600" },
            { label: "À valider",    val: stats.enAttente,       icon: "pending",     color: "text-amber-600"  },
            { label: "Expirées",     val: stats.expirees,        icon: "schedule",    color: "text-red-500"    },
            { label: "Expirent < 7j",val: stats.expirantBientot, icon: "warning",     color: "text-orange-500" },
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

      {/* Prescriptions en attente de l'app mobile */}
      {pendingMobile.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <h2 className="font-bold text-amber-700 text-sm">
              {pendingMobile.length} ordonnance{pendingMobile.length > 1 ? "s" : ""} à valider — App mobile
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {pendingMobile.map((p) => (
              <div key={p._id} className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-amber-400">{p.numero}</p>
                    <p className="font-bold text-navy text-sm">{p.patientId?.nom} {p.patientId?.prenom}</p>
                  </div>
                  <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-full border border-amber-200 whitespace-nowrap">{p.motif}</span>
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  {p.medecin?.nom && (
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-amber-400">medical_information</span>
                      Dr {p.medecin.prenom} {p.medecin.nom}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-amber-400">calendar_today</span>
                    Émise le {fmtDate(p.dateEmission)}
                  </div>
                  {p.fichierNom && (
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-green-500">attach_file</span>
                      <span className="truncate text-green-700 font-medium">{p.fichierNom}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1 border-t border-amber-100">
                  <button onClick={() => handleValider(p._id)} className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Valider
                  </button>
                  <button onClick={() => { setSelectedPrescription(p); setShowIncomplet(true); }} className="flex-1 flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>report_problem</span>Incomplet
                  </button>
                  <button onClick={() => { setSelectedPrescription(p); setShowDetail(true); }} className="px-3 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold py-2 rounded-lg border border-slate-200 transition-colors">
                    Voir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-5 flex items-center gap-3 flex-wrap">
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
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

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{erreur}</div>
      )}

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
                        <span className="font-semibold text-navy">{p.patientId?.nom} {p.patientId?.prenom}</span>
                        <br /><span className="text-xs text-slate-400">{p.patientId?.numeroPatient}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{p.motif}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {p.medecin?.nom ? (
                          <><span>{p.medecin.nom}</span>{p.medecin.specialite && <span className="text-xs text-slate-400 block">{p.medecin.specialite}</span>}</>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">{fmtDate(p.dateEmission)}</td>
                      <td className="px-5 py-3 font-mono text-xs">
                        <span className={expireSoon ? "text-orange-600 font-bold" : "text-slate-600"}>{fmtDate(p.dateExpiration)}</span>
                        {expireSoon && <span className="material-symbols-outlined text-orange-500 text-xs ml-1 align-middle">warning</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedPrescription(p); setShowDetail(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Voir le détail">
                            <span className="material-symbols-outlined text-base">visibility</span>
                          </button>
                          {!["annulee"].includes(p.statut) && (
                            <button onClick={() => { setSelectedPrescription(p); setShowEdit(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Modifier">
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                          )}
                          <button onClick={() => { setSelectedPrescription(p); setShowDetail(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Imprimer">
                            <span className="material-symbols-outlined text-base">print</span>
                          </button>
                          {p.statut === "en_attente_validation" && (
                            <>
                              {(p.document?.fileUrl || p.fichierUrl) ? (
                                <button onClick={() => navigate(`/prescriptions/${p._id}/validation`)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg font-semibold hover:bg-blue-700 ml-1" title="Ouvrir le workflow de validation PMT">
                                  Valider PMT
                                </button>
                              ) : (
                                <button onClick={() => handleValider(p._id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg font-semibold hover:bg-green-700 ml-1" title="Valider">
                                  Valider
                                </button>
                              )}
                              <button onClick={() => { setSelectedPrescription(p); setShowIncomplet(true); }} className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg font-semibold hover:bg-orange-600" title="Marquer incomplet">
                                Incomplet
                              </button>
                            </>
                          )}
                          {!["annulee", "expiree"].includes(p.statut) && (
                            <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="Annuler">
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
