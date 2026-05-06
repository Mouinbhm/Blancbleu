import { useState, useEffect, useCallback, useRef } from "react";
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

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSANTS PMT (CERFA n°11574)
// ═════════════════════════════════════════════════════════════════════════════

function SectionBanner({ titre }) {
  return (
    <div style={{ background: "#1A3A5C" }} className="text-white px-5 py-3 font-bold text-sm tracking-wide">
      {titre}
    </div>
  );
}

function Lbl({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function FInput({ className = "", ...props }) {
  return (
    <input
      className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1D6EF5] focus:ring-1 focus:ring-[#1D6EF5]/20 bg-white transition-colors ${className}`}
      {...props}
    />
  );
}

function CaseCocher({ checked, onChange, label, sub = false }) {
  return (
    <label
      className={`flex items-center gap-2 cursor-pointer select-none ${
        sub ? "text-xs text-slate-600" : "text-sm text-slate-700"
      }`}
    >
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          checked ? "bg-[#1D6EF5] border-[#1D6EF5]" : "border-slate-300 bg-white"
        }`}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5l2.5 2.5 4.5-5.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span>{label}</span>
    </label>
  );
}

function RadioBtn({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
      <div
        onClick={onChange}
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          checked ? "border-[#1D6EF5]" : "border-slate-300"
        }`}
      >
        {checked && <div className="w-2 h-2 rounded-full bg-[#1D6EF5]" />}
      </div>
      <span>{label}</span>
    </label>
  );
}

// ── Numéro SS : 15 cases individuelles ────────────────────────────────────────
// Groupes : 1 — 2 — 2 — 2 — 3 — 3 — 2 (= 15 chiffres)
function NumeroSSInput({ value, onChange }) {
  const refs = useRef([]);
  const groups = [1, 2, 2, 2, 3, 3, 2];
  let cursor = 0;
  const groupBounds = groups.map((size) => {
    const start = cursor;
    cursor += size;
    return { start, size };
  });

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const next = [...value];
    next[i] = char;
    onChange(next);
    if (char && i < 14) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {groupBounds.map(({ start, size }, gi) => (
        <div key={gi} className="flex items-center">
          <div className="flex gap-0.5">
            {Array.from({ length: size }).map((_, si) => {
              const i = start + si;
              return (
                <input
                  key={i}
                  ref={(el) => (refs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={value[i] || ""}
                  onChange={(e) => handleChange(i, e)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-7 h-8 text-center border border-slate-300 rounded text-sm font-mono outline-none focus:border-[#1D6EF5] focus:ring-1 focus:ring-[#1D6EF5]/20 bg-white transition-colors"
                />
              );
            })}
          </div>
          {gi < groupBounds.length - 1 && (
            <span className="text-slate-400 px-1 text-xs select-none font-bold">—</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Auto-déduction motif depuis les cases cochées ────────────────────────────
function autoDeduceMotif(situation) {
  if (situation.chimiotherapie) return "Chimiothérapie";
  if (situation.hemodialyse) return "Dialyse";
  if (situation.radiotherapie) return "Radiothérapie";
  if (situation.hospitalisation) return "Hospitalisation";
  return "Consultation";
}

function genNumPreview() {
  const d = new Date();
  return `PMT-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    Math.floor(Math.random() * 9000) + 1000,
  )}`;
}

const FORM_INIT = {
  // Patient
  patientId: "",
  recherchePatient: "",
  numeroSS: Array(15).fill(""),
  dateNaissancePatient: "",
  adressePatient: "",
  cpPatient: "",
  villePatient: "",
  telephonePatient: "",

  // ① Situation
  situation: {
    hospitalisation: false,
    chimiotherapie: false,
    radiotherapie: false,
    hemodialyse: false,
    aldExonerante: false,
    aldNonExonerante: false,
    atMp: false,
  },

  // ② Mode transport
  modeTransport: "",
  ambulanceMotifs: {
    positionAllongee: false,
    brancardage: false,
    surveillance: false,
    oxygene: false,
    asepsie: false,
  },
  accompagnateur: false,

  // ③ Trajet
  departType: "domicile",
  adresseDepart: "",
  arriveeType: "structure",
  adresseArrivee: "",
  structureSoins: "",
  allerRetour: false,
  nbTransportsIteratifs: "",

  // ④ Urgence
  urgenceSAMU: false,
  autresUrgences: false,
  precisionUrgence: "",

  // ⑤ Éléments médicaux
  notes: "",

  // ⑥ Cas particuliers
  exonerationTM: false,
  pensionMilitaire: false,

  // Prescripteur
  "medecin.nom": "",
  "medecin.prenom": "",
  "medecin.rpps": "",
  "medecin.telephone": "",
  "medecin.specialite": "",
  "medecin.etablissement": "",
  "medecin.adresse": "",
  "medecin.nStructure": "",

  // Dates
  dateEmission: new Date().toISOString().slice(0, 10),
  dateExpiration: "",
};

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

          {/* Patient */}
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

          {/* Transport */}
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
                  {cx.situation.hemodialyse && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Hémodialyse</span>}
                  {cx.situation.chimiotherapie && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Chimiothérapie</span>}
                  {cx.situation.radiotherapie && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Radiothérapie</span>}
                  {cx.situation.hospitalisation && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Hospitalisation</span>}
                  {cx.situation.aldExonerante && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">ALD exonérante</span>}
                  {cx.situation.atMp && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">AT/MP</span>}
                </div>
              </div>
            )}
          </div>

          {/* Prescripteur */}
          <div className="border border-slate-200 rounded-xl p-4 mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Prescripteur</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Médecin</p><p className="font-semibold">{p.medecin?.nom} {p.medecin?.prenom}</p></div>
              {p.medecin?.specialite && <div><p className="text-xs text-slate-400">Spécialité</p><p>{p.medecin.specialite}</p></div>}
              {p.medecin?.etablissement && <div><p className="text-xs text-slate-400">Établissement</p><p>{p.medecin.etablissement}</p></div>}
              {p.medecin?.rpps && <div><p className="text-xs text-slate-400">RPPS</p><p className="font-mono">{p.medecin.rpps}</p></div>}
              {p.medecin?.telephone && <div><p className="text-xs text-slate-400">Téléphone</p><p>{p.medecin.telephone}</p></div>}
            </div>
          </div>

          {/* Dates */}
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
// MODALE NOUVELLE / MODIFIER PRESCRIPTION (CERFA n°11574)
// ═════════════════════════════════════════════════════════════════════════════
function ModalNouvellePrescription({ onClose, onSuccess, prescriptionToEdit }) {
  const isEdit = Boolean(prescriptionToEdit);

  // Pré-remplissage depuis la prescription existante
  const buildFormFromPrescription = (p) => {
    if (!p) return FORM_INIT;
    const cx = p.contenuExtrait || {};
    return {
      ...FORM_INIT,
      patientId: p.patientId?._id || p.patientId || "",
      recherchePatient: "",
      numeroSS: cx.numeroSS ? cx.numeroSS.split("") : Array(15).fill(""),
      dateNaissancePatient: cx.dateNaissancePatient || "",
      adressePatient: cx.adressePatient?.rue || "",
      cpPatient: cx.adressePatient?.cp || "",
      villePatient: cx.adressePatient?.ville || "",
      telephonePatient: cx.telephonePatient || "",
      situation: cx.situation || FORM_INIT.situation,
      modeTransport: cx.modeTransport || "",
      ambulanceMotifs: cx.ambulanceMotifs || FORM_INIT.ambulanceMotifs,
      accompagnateur: cx.accompagnateur || false,
      departType: cx.trajet?.departType || "domicile",
      adresseDepart: cx.trajet?.adresseDepart || "",
      arriveeType: cx.trajet?.arriveeType || "structure",
      adresseArrivee: cx.trajet?.adresseArrivee || "",
      structureSoins: cx.trajet?.structureSoins || "",
      allerRetour: cx.trajet?.allerRetour || false,
      nbTransportsIteratifs: cx.trajet?.nbTransportsIteratifs || "",
      urgenceSAMU: cx.urgence?.samu || false,
      autresUrgences: cx.urgence?.autres || false,
      precisionUrgence: cx.urgence?.precision || "",
      exonerationTM: cx.casParticuliers?.exonerationTM || false,
      pensionMilitaire: cx.casParticuliers?.pensionMilitaire || false,
      notes: p.notes || "",
      "medecin.nom": p.medecin?.nom || "",
      "medecin.prenom": p.medecin?.prenom || "",
      "medecin.rpps": p.medecin?.rpps || "",
      "medecin.telephone": p.medecin?.telephone || "",
      "medecin.specialite": p.medecin?.specialite || "",
      "medecin.etablissement": p.medecin?.etablissement || "",
      "medecin.adresse": cx.prescripteur?.adresse || "",
      "medecin.nStructure": cx.prescripteur?.nStructure || "",
      dateEmission: p.dateEmission ? p.dateEmission.slice(0, 10) : new Date().toISOString().slice(0, 10),
      dateExpiration: p.dateExpiration ? p.dateExpiration.slice(0, 10) : "",
    };
  };

  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(() => buildFormFromPrescription(prescriptionToEdit));
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");
  const numRef = useRef(prescriptionToEdit?.numero || genNumPreview());

  const motifAuto = autoDeduceMotif(form.situation);

  useEffect(() => {
    patientService
      .getAll({ limit: 100, recherche: form.recherchePatient || undefined })
      .then(({ data }) => setPatients(data.patients || []))
      .catch(() => {});
  }, [form.recherchePatient]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setSituation = (k, v) =>
    setForm((f) => ({ ...f, situation: { ...f.situation, [k]: v } }));
  const setAmbulance = (k, v) =>
    setForm((f) => ({ ...f, ambulanceMotifs: { ...f.ambulanceMotifs, [k]: v } }));

  const handleSubmit = async (isDraft) => {
    if (!form.patientId) return setErreur("Sélectionnez un patient.");
    if (!form.dateEmission) return setErreur("La date d'émission est obligatoire.");
    if (!form["medecin.nom"]) return setErreur("Le nom du médecin prescripteur est obligatoire.");

    setSubmitting(true);
    setErreur("");
    try {
      const payload = {
        patientId: form.patientId,
        motif: motifAuto,
        dateEmission: form.dateEmission,
        dateExpiration: form.dateExpiration || undefined,
        medecin: {
          nom: form["medecin.nom"],
          prenom: form["medecin.prenom"],
          rpps: form["medecin.rpps"],
          telephone: form["medecin.telephone"],
          specialite: form["medecin.specialite"],
          etablissement: form["medecin.etablissement"],
        },
        etablissementDestination: form.structureSoins || undefined,
        notes: form.notes,
        statut: isDraft ? "en_attente_validation" : "active",
        contenuExtrait: {
          numeroSS: form.numeroSS.join(""),
          dateNaissancePatient: form.dateNaissancePatient,
          adressePatient: {
            rue: form.adressePatient,
            cp: form.cpPatient,
            ville: form.villePatient,
          },
          telephonePatient: form.telephonePatient,
          situation: form.situation,
          modeTransport: form.modeTransport,
          ambulanceMotifs: form.ambulanceMotifs,
          accompagnateur: form.accompagnateur,
          trajet: {
            departType: form.departType,
            adresseDepart: form.adresseDepart,
            arriveeType: form.arriveeType,
            adresseArrivee: form.adresseArrivee,
            structureSoins: form.structureSoins,
            allerRetour: form.allerRetour,
            nbTransportsIteratifs: form.nbTransportsIteratifs,
          },
          urgence: {
            samu: form.urgenceSAMU,
            autres: form.autresUrgences,
            precision: form.precisionUrgence,
          },
          casParticuliers: {
            exonerationTM: form.exonerationTM,
            pensionMilitaire: form.pensionMilitaire,
          },
          prescripteur: {
            adresse: form["medecin.adresse"],
            nStructure: form["medecin.nStructure"],
          },
        },
      };
      const { data } = isEdit
        ? await prescriptionService.update(prescriptionToEdit._id, payload)
        : await prescriptionService.create(payload);
      onSuccess(data);
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── EN-TÊTE FIXE ─────────────────────────────────────────────────── */}
        <div style={{ background: "#1A3A5C" }} className="px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-white font-bold text-base leading-tight">
              {isEdit ? "Modifier la prescription" : "Nouvelle prescription"}
            </p>
            <p className="text-slate-400 text-xs mt-0.5 font-mono">
              CERFA n°11574 — {numRef.current}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors ml-4 shrink-0">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* ── CONTENU SCROLLABLE ────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">

          {/* DATES (hors section) */}
          <div className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Lbl required>Date d'émission</Lbl>
                <FInput
                  type="date"
                  value={form.dateEmission}
                  onChange={(e) => set("dateEmission", e.target.value)}
                />
              </div>
              <div>
                <Lbl>Date d'expiration</Lbl>
                <FInput
                  type="date"
                  value={form.dateExpiration}
                  onChange={(e) => set("dateExpiration", e.target.value)}
                />
              </div>
              <div>
                <Lbl>Motif (auto-déduit)</Lbl>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm font-semibold text-[#1D6EF5] h-[38px] flex items-center">
                  {motifAuto}
                </div>
              </div>
            </div>
          </div>

          {/* ══ SECTION 2 — BÉNÉFICIAIRE ═══════════════════════════════════════ */}
          <SectionBanner titre="▌ LA PERSONNE BÉNÉFICIAIRE DU TRANSPORT" />
          <div className="bg-white px-6 py-5 space-y-4 border-b border-slate-200">

            {/* Recherche + sélection patient */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Lbl required>Rechercher un patient</Lbl>
                <FInput
                  placeholder="Nom, prénom, numéro…"
                  value={form.recherchePatient}
                  onChange={(e) => set("recherchePatient", e.target.value)}
                />
              </div>
              <div>
                <Lbl required>Patient sélectionné</Lbl>
                <select
                  value={form.patientId}
                  onChange={(e) => set("patientId", e.target.value)}
                  size={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#1D6EF5] focus:ring-1 focus:ring-[#1D6EF5]/20 bg-white"
                >
                  <option value="">-- Sélectionner --</option>
                  {patients.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.nom} {p.prenom} — {p.numeroPatient}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* N° SS */}
            <div>
              <Lbl>N° d'immatriculation Sécurité Sociale</Lbl>
              <p className="text-[11px] text-slate-400 mb-1">
                Sexe — Année — Mois — Département — Commune — Ordre — Clé
              </p>
              <NumeroSSInput
                value={form.numeroSS}
                onChange={(v) => set("numeroSS", v)}
              />
            </div>

            {/* Infos complémentaires */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Lbl>Date de naissance</Lbl>
                <FInput
                  type="date"
                  value={form.dateNaissancePatient}
                  onChange={(e) => set("dateNaissancePatient", e.target.value)}
                />
              </div>
              <div>
                <Lbl>Téléphone</Lbl>
                <FInput
                  type="tel"
                  placeholder="06 00 00 00 00"
                  value={form.telephonePatient}
                  onChange={(e) => set("telephonePatient", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <Lbl>Adresse (rue)</Lbl>
                <FInput
                  placeholder="N° et rue"
                  value={form.adressePatient}
                  onChange={(e) => set("adressePatient", e.target.value)}
                />
              </div>
              <div>
                <Lbl>Code postal</Lbl>
                <FInput
                  placeholder="75000"
                  maxLength={5}
                  value={form.cpPatient}
                  onChange={(e) => set("cpPatient", e.target.value.replace(/\D/g, "").slice(0, 5))}
                />
              </div>
              <div>
                <Lbl>Ville</Lbl>
                <FInput
                  placeholder="Paris"
                  value={form.villePatient}
                  onChange={(e) => set("villePatient", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ══ SECTION 3 — PRESCRIPTION MÉDICALE ══════════════════════════════ */}
          <SectionBanner titre="▌ LA PRESCRIPTION MÉDICALE" />
          <div className="bg-white px-6 py-5 space-y-6 border-b border-slate-200">

            {/* ① Situation */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span
                  style={{ background: "#1D6EF5" }}
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                >
                  ①
                </span>
                Situation
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6">
                <CaseCocher
                  label="Hospitalisation (complète, partielle ou ambulatoire)"
                  checked={form.situation.hospitalisation}
                  onChange={(v) => setSituation("hospitalisation", v)}
                />
                <CaseCocher
                  label="Séances de chimiothérapie"
                  checked={form.situation.chimiotherapie}
                  onChange={(v) => setSituation("chimiotherapie", v)}
                />
                <CaseCocher
                  label="Séances de radiothérapie"
                  checked={form.situation.radiotherapie}
                  onChange={(v) => setSituation("radiotherapie", v)}
                />
                <CaseCocher
                  label="Hémodialyse"
                  checked={form.situation.hemodialyse}
                  onChange={(v) => setSituation("hemodialyse", v)}
                />
                <CaseCocher
                  label="ALD exonérante"
                  checked={form.situation.aldExonerante}
                  onChange={(v) => setSituation("aldExonerante", v)}
                />
                <CaseCocher
                  label="ALD non exonérante"
                  checked={form.situation.aldNonExonerante}
                  onChange={(v) => setSituation("aldNonExonerante", v)}
                />
                <CaseCocher
                  label="Accident du travail / Maladie professionnelle"
                  checked={form.situation.atMp}
                  onChange={(v) => setSituation("atMp", v)}
                />
              </div>
            </div>

            {/* ② Mode de transport */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span
                  style={{ background: "#1D6EF5" }}
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                >
                  ②
                </span>
                Mode de transport
              </p>
              <div className="space-y-3">
                {/* Ambulance */}
                <div>
                  <RadioBtn
                    checked={form.modeTransport === "AMBULANCE"}
                    onChange={() => set("modeTransport", "AMBULANCE")}
                    label="Transport en ambulance — justifié par :"
                  />
                  {form.modeTransport === "AMBULANCE" && (
                    <div className="mt-2 ml-6 pl-3 border-l-2 border-[#1D6EF5]/25 space-y-2">
                      <CaseCocher sub label="Position allongée ou demi-assise" checked={form.ambulanceMotifs.positionAllongee} onChange={(v) => setAmbulance("positionAllongee", v)} />
                      <CaseCocher sub label="Brancardage ou portage" checked={form.ambulanceMotifs.brancardage} onChange={(v) => setAmbulance("brancardage", v)} />
                      <CaseCocher sub label="Surveillance par personne qualifiée" checked={form.ambulanceMotifs.surveillance} onChange={(v) => setAmbulance("surveillance", v)} />
                      <CaseCocher sub label="Administration d'oxygène" checked={form.ambulanceMotifs.oxygene} onChange={(v) => setAmbulance("oxygene", v)} />
                      <CaseCocher sub label="Asepsie rigoureuse" checked={form.ambulanceMotifs.asepsie} onChange={(v) => setAmbulance("asepsie", v)} />
                    </div>
                  )}
                </div>
                <RadioBtn
                  checked={form.modeTransport === "VSL"}
                  onChange={() => set("modeTransport", "VSL")}
                  label="Transport assis professionnalisé (VSL)"
                />
                <RadioBtn
                  checked={form.modeTransport === "TPMR"}
                  onChange={() => set("modeTransport", "TPMR")}
                  label="Véhicule adapté fauteuil roulant (TPMR)"
                />
                <RadioBtn
                  checked={form.modeTransport === "INDIVIDUEL"}
                  onChange={() => set("modeTransport", "INDIVIDUEL")}
                  label="Moyen de transport individuel"
                />
                <div className="pt-1 border-t border-slate-100">
                  <CaseCocher
                    label="Accompagnateur nécessaire"
                    checked={form.accompagnateur}
                    onChange={(v) => set("accompagnateur", v)}
                  />
                </div>
              </div>
            </div>

            {/* ③ Trajet */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span
                  style={{ background: "#1D6EF5" }}
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                >
                  ③
                </span>
                Trajet
              </p>
              <div className="space-y-3">
                {/* Départ */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Départ</p>
                  <div className="flex flex-wrap gap-4">
                    <RadioBtn checked={form.departType === "domicile"} onChange={() => set("departType", "domicile")} label="Domicile" />
                    <RadioBtn checked={form.departType === "autre"} onChange={() => set("departType", "autre")} label="Autre lieu" />
                    <RadioBtn checked={form.departType === "structure"} onChange={() => set("departType", "structure")} label="Structure de soins" />
                  </div>
                  <FInput
                    placeholder="Adresse de départ"
                    value={form.adresseDepart}
                    onChange={(e) => set("adresseDepart", e.target.value)}
                  />
                </div>
                {/* Arrivée */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Arrivée</p>
                  <div className="flex flex-wrap gap-4">
                    <RadioBtn checked={form.arriveeType === "domicile"} onChange={() => set("arriveeType", "domicile")} label="Domicile" />
                    <RadioBtn checked={form.arriveeType === "autre"} onChange={() => set("arriveeType", "autre")} label="Autre lieu" />
                    <RadioBtn checked={form.arriveeType === "structure"} onChange={() => set("arriveeType", "structure")} label="Structure de soins" />
                  </div>
                  <FInput
                    placeholder="Adresse de destination"
                    value={form.adresseArrivee}
                    onChange={(e) => set("adresseArrivee", e.target.value)}
                  />
                  <FInput
                    placeholder="Nom de l'établissement de soins (si applicable)"
                    value={form.structureSoins}
                    onChange={(e) => set("structureSoins", e.target.value)}
                  />
                </div>
                {/* Options trajet */}
                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <CaseCocher
                    label="Transport aller-retour"
                    checked={form.allerRetour}
                    onChange={(v) => set("allerRetour", v)}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Transports itératifs :</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.nbTransportsIteratifs}
                      onChange={(e) => set("nbTransportsIteratifs", e.target.value)}
                      className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-[#1D6EF5] bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ④ Urgence */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span
                  style={{ background: "#1D6EF5" }}
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                >
                  ④
                </span>
                Urgence
              </p>
              <div className="space-y-2">
                <CaseCocher
                  label="Urgence SAMU — Centre 15"
                  checked={form.urgenceSAMU}
                  onChange={(v) => set("urgenceSAMU", v)}
                />
                <CaseCocher
                  label="Autres urgences"
                  checked={form.autresUrgences}
                  onChange={(v) => set("autresUrgences", v)}
                />
                {form.autresUrgences && (
                  <div className="ml-6">
                    <FInput
                      placeholder="Préciser…"
                      value={form.precisionUrgence}
                      onChange={(e) => set("precisionUrgence", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ⑤ Éléments médicaux */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span
                  style={{ background: "#1D6EF5" }}
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                >
                  ⑤
                </span>
                Éléments d'ordre médical justifiant le transport
              </p>
              <textarea
                rows={3}
                placeholder="Éléments médicaux justifiant la prescription de transport…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1D6EF5] focus:ring-1 focus:ring-[#1D6EF5]/20 resize-none bg-white"
              />
            </div>

            {/* ⑥ Cas particuliers */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span
                  style={{ background: "#1D6EF5" }}
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                >
                  ⑥
                </span>
                Cas particuliers
              </p>
              <div className="space-y-2">
                <CaseCocher
                  label="Exonération du ticket modérateur"
                  checked={form.exonerationTM}
                  onChange={(v) => set("exonerationTM", v)}
                />
                <CaseCocher
                  label="Pension militaire d'invalidité"
                  checked={form.pensionMilitaire}
                  onChange={(v) => set("pensionMilitaire", v)}
                />
              </div>
            </div>
          </div>

          {/* ══ SECTION 4 — IDENTIFICATION PRESCRIPTEUR ════════════════════════ */}
          <SectionBanner titre="▌ IDENTIFICATION DU PRESCRIPTEUR" />
          <div className="bg-white px-6 py-5 pb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Colonne gauche — Médecin */}
              <div className="space-y-3">
                <div>
                  <Lbl required>Nom du médecin</Lbl>
                  <FInput
                    placeholder="Nom"
                    value={form["medecin.nom"]}
                    onChange={(e) => set("medecin.nom", e.target.value)}
                  />
                </div>
                <div>
                  <Lbl>Prénom</Lbl>
                  <FInput
                    placeholder="Prénom"
                    value={form["medecin.prenom"]}
                    onChange={(e) => set("medecin.prenom", e.target.value)}
                  />
                </div>
                <div>
                  <Lbl>Identifiant RPPS (11 chiffres)</Lbl>
                  <FInput
                    placeholder="00000000000"
                    maxLength={11}
                    value={form["medecin.rpps"]}
                    onChange={(e) =>
                      set("medecin.rpps", e.target.value.replace(/\D/g, "").slice(0, 11))
                    }
                  />
                </div>
                <div>
                  <Lbl required>Date de prescription</Lbl>
                  <FInput
                    type="date"
                    value={form.dateEmission}
                    onChange={(e) => set("dateEmission", e.target.value)}
                  />
                </div>
                {/* Zone signature (placeholder visuel) */}
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center">
                  <span className="material-symbols-outlined text-slate-300 text-3xl block mb-1">
                    draw
                  </span>
                  <p className="text-xs text-slate-400">Zone de signature du médecin</p>
                </div>
              </div>

              {/* Colonne droite — Établissement */}
              <div className="space-y-3">
                <div>
                  <Lbl>Raison sociale de l'établissement</Lbl>
                  <FInput
                    placeholder="Hôpital, cabinet médical…"
                    value={form["medecin.etablissement"]}
                    onChange={(e) => set("medecin.etablissement", e.target.value)}
                  />
                </div>
                <div>
                  <Lbl>Spécialité</Lbl>
                  <FInput
                    placeholder="Cardiologie, Oncologie…"
                    value={form["medecin.specialite"]}
                    onChange={(e) => set("medecin.specialite", e.target.value)}
                  />
                </div>
                <div>
                  <Lbl>Adresse de l'établissement</Lbl>
                  <FInput
                    placeholder="N° rue, ville, code postal"
                    value={form["medecin.adresse"]}
                    onChange={(e) => set("medecin.adresse", e.target.value)}
                  />
                </div>
                <div>
                  <Lbl>N° structure (AM / FINESS / SIRET)</Lbl>
                  <FInput
                    placeholder="Identifiant structure"
                    value={form["medecin.nStructure"]}
                    onChange={(e) => set("medecin.nStructure", e.target.value)}
                  />
                </div>
                <div>
                  <Lbl>Téléphone</Lbl>
                  <FInput
                    type="tel"
                    placeholder="04 00 00 00 00"
                    value={form["medecin.telephone"]}
                    onChange={(e) => set("medecin.telephone", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── MESSAGE D'ERREUR ─────────────────────────────────────────────── */}
        {erreur && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-2.5 text-red-700 text-sm shrink-0 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {erreur}
          </div>
        )}

        {/* ── FOOTER FIXE ──────────────────────────────────────────────────── */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors font-medium"
            >
              Enregistrer comme brouillon
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(false)}
              className="flex items-center justify-center gap-2 px-5 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
              style={{ background: submitting ? "#94a3b8" : "#1D6EF5" }}
            >
              {submitting ? (
                <>
                  <div
                    style={{
                      width: 14, height: 14,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid white",
                      borderRadius: "50%",
                      animation: "spin .7s linear infinite",
                    }}
                  />
                  En cours…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {isEdit ? "Enregistrer les modifications" : "Valider la prescription"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE — LISTE DES PRESCRIPTIONS
// ═════════════════════════════════════════════════════════════════════════════
export default function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreMotif, setFiltreMotif] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);

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
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select
          value={filtreMotif}
          onChange={(e) => setFiltreMotif(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary"
        >
          <option value="">Tous les motifs</option>
          {MOTIFS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(filtreStatut || filtreMotif) && (
          <button
            onClick={() => { setFiltreStatut(""); setFiltreMotif(""); }}
            className="text-sm text-primary hover:underline"
          >
            Réinitialiser
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{prescriptions.length} résultat(s)</span>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {erreur}
        </div>
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
                  const expireSoon =
                    p.dateExpiration &&
                    p.statut === "active" &&
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
                            {p.medecin.specialite && (
                              <span className="text-xs text-slate-400 block">{p.medecin.specialite}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">{fmtDate(p.dateEmission)}</td>
                      <td className="px-5 py-3 font-mono text-xs">
                        <span className={expireSoon ? "text-orange-600 font-bold" : "text-slate-600"}>
                          {fmtDate(p.dateExpiration)}
                        </span>
                        {expireSoon && (
                          <span className="material-symbols-outlined text-orange-500 text-xs ml-1 align-middle">
                            warning
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Voir */}
                          <button
                            onClick={() => { setSelectedPrescription(p); setShowDetail(true); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Voir le détail"
                          >
                            <span className="material-symbols-outlined text-base">visibility</span>
                          </button>
                          {/* Modifier */}
                          {!["annulee"].includes(p.statut) && (
                            <button
                              onClick={() => { setSelectedPrescription(p); setShowEdit(true); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Modifier"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                          )}
                          {/* Imprimer */}
                          <button
                            onClick={() => { setSelectedPrescription(p); setShowDetail(true); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Imprimer"
                          >
                            <span className="material-symbols-outlined text-base">print</span>
                          </button>
                          {/* Valider brouillon */}
                          {p.statut === "en_attente_validation" && (
                            <button
                              onClick={() => handleValider(p._id)}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg font-semibold hover:bg-green-700 ml-1"
                            >
                              Valider
                            </button>
                          )}
                          {/* Annuler */}
                          {!["annulee", "expiree"].includes(p.statut) && (
                            <button
                              onClick={() => handleDelete(p._id)}
                              className="p-1.5 rounded-lg text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
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
