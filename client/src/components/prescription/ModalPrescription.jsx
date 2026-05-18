import { useState, useEffect, useRef } from "react";
import { prescriptionService, patientService } from "../../services/api";

// ── Shared UI primitives ──────────────────────────────────────────────────────

export function SectionBanner({ titre }) {
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
    <label className={`flex items-center gap-2 cursor-pointer select-none ${sub ? "text-xs text-slate-600" : "text-sm text-slate-700"}`}>
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

// N° SS : 15 cases individuelles (groupes 1—2—2—2—3—3—2)
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
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
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

// ── Helpers ───────────────────────────────────────────────────────────────────

export function autoDeduceMotif(situation) {
  if (situation.chimiotherapie) return "Chimiothérapie";
  if (situation.hemodialyse)    return "Dialyse";
  if (situation.radiotherapie)  return "Radiothérapie";
  if (situation.hospitalisation) return "Hospitalisation";
  return "Consultation";
}

function genNumPreview() {
  const d = new Date();
  return `PMT-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    Math.floor(Math.random() * 9000) + 1000,
  )}`;
}

export const FORM_INIT = {
  patientId: "",
  recherchePatient: "",
  numeroSS: Array(15).fill(""),
  dateNaissancePatient: "",
  adressePatient: "",
  cpPatient: "",
  villePatient: "",
  telephonePatient: "",
  situation: {
    hospitalisation: false, chimiotherapie: false, radiotherapie: false,
    hemodialyse: false, aldExonerante: false, aldNonExonerante: false, atMp: false,
  },
  modeTransport: "",
  ambulanceMotifs: {
    positionAllongee: false, brancardage: false, surveillance: false,
    oxygene: false, asepsie: false,
  },
  accompagnateur: false,
  departType: "domicile",
  adresseDepart: "",
  arriveeType: "structure",
  adresseArrivee: "",
  structureSoins: "",
  allerRetour: false,
  nbTransportsIteratifs: "",
  urgenceSAMU: false,
  autresUrgences: false,
  precisionUrgence: "",
  notes: "",
  exonerationTM: false,
  pensionMilitaire: false,
  "medecin.nom": "",
  "medecin.prenom": "",
  "medecin.rpps": "",
  "medecin.telephone": "",
  "medecin.specialite": "",
  "medecin.etablissement": "",
  "medecin.adresse": "",
  "medecin.nStructure": "",
  dateEmission: new Date().toISOString().slice(0, 10),
  dateExpiration: "",
};

// ── Modal principale ──────────────────────────────────────────────────────────
/**
 * patientPreset — when provided (from patient detail tab), the patient field is
 * pre-filled and the search UI is hidden.
 * Shape: { _id, nom, prenom, numeroPatient }
 */
export default function ModalNouvellePrescription({ onClose, onSuccess, prescriptionToEdit, patientPreset }) {
  const isEdit = Boolean(prescriptionToEdit);

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
  const [form, setForm] = useState(() => {
    const base = buildFormFromPrescription(prescriptionToEdit);
    if (patientPreset && !isEdit) return { ...base, patientId: patientPreset._id };
    return base;
  });
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");
  const numRef = useRef(prescriptionToEdit?.numero || genNumPreview());

  const motifAuto = autoDeduceMotif(form.situation);

  useEffect(() => {
    if (patientPreset) return;
    patientService
      .getAll({ limit: 100, recherche: form.recherchePatient || undefined })
      .then(({ data }) => setPatients(data.patients || []))
      .catch(() => {});
  }, [form.recherchePatient, patientPreset]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setSituation = (k, v) => setForm((f) => ({ ...f, situation: { ...f.situation, [k]: v } }));
  const setAmbulance = (k, v) => setForm((f) => ({ ...f, ambulanceMotifs: { ...f.ambulanceMotifs, [k]: v } }));

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
          adressePatient: { rue: form.adressePatient, cp: form.cpPatient, ville: form.villePatient },
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
          urgence: { samu: form.urgenceSAMU, autres: form.autresUrgences, precision: form.precisionUrgence },
          casParticuliers: { exonerationTM: form.exonerationTM, pensionMilitaire: form.pensionMilitaire },
          prescripteur: { adresse: form["medecin.adresse"], nStructure: form["medecin.nStructure"] },
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

        {/* ── EN-TÊTE ── */}
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

        {/* ── CONTENU SCROLLABLE ── */}
        <div className="overflow-y-auto flex-1">

          {/* Dates */}
          <div className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Lbl required>Date d'émission</Lbl>
                <FInput type="date" value={form.dateEmission} onChange={(e) => set("dateEmission", e.target.value)} />
              </div>
              <div>
                <Lbl>Date d'expiration</Lbl>
                <FInput type="date" value={form.dateExpiration} onChange={(e) => set("dateExpiration", e.target.value)} />
              </div>
              <div>
                <Lbl>Motif (auto-déduit)</Lbl>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm font-semibold text-[#1D6EF5] h-[38px] flex items-center">
                  {motifAuto}
                </div>
              </div>
            </div>
          </div>

          {/* ══ BÉNÉFICIAIRE ══ */}
          <SectionBanner titre="▌ LA PERSONNE BÉNÉFICIAIRE DU TRANSPORT" />
          <div className="bg-white px-6 py-5 space-y-4 border-b border-slate-200">

            {patientPreset ? (
              /* Patient pré-sélectionné depuis le dossier patient */
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-blue-500 text-base">person</span>
                <div>
                  <p className="text-sm font-bold text-blue-900">{patientPreset.nom} {patientPreset.prenom}</p>
                  <p className="text-xs text-blue-600 font-mono">{patientPreset.numeroPatient}</p>
                </div>
                <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
                  Patient actif
                </span>
              </div>
            ) : (
              /* Recherche patient (mode standalone) */
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
            )}

            {/* N° SS */}
            <div>
              <Lbl>N° d'immatriculation Sécurité Sociale</Lbl>
              <p className="text-[11px] text-slate-400 mb-1">Sexe — Année — Mois — Département — Commune — Ordre — Clé</p>
              <NumeroSSInput value={form.numeroSS} onChange={(v) => set("numeroSS", v)} />
            </div>

            {/* Infos complémentaires */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Lbl>Date de naissance</Lbl>
                <FInput type="date" value={form.dateNaissancePatient} onChange={(e) => set("dateNaissancePatient", e.target.value)} />
              </div>
              <div>
                <Lbl>Téléphone</Lbl>
                <FInput type="tel" placeholder="06 00 00 00 00" value={form.telephonePatient} onChange={(e) => set("telephonePatient", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <Lbl>Adresse (rue)</Lbl>
                <FInput placeholder="N° et rue" value={form.adressePatient} onChange={(e) => set("adressePatient", e.target.value)} />
              </div>
              <div>
                <Lbl>Code postal</Lbl>
                <FInput placeholder="75000" maxLength={5} value={form.cpPatient} onChange={(e) => set("cpPatient", e.target.value.replace(/\D/g, "").slice(0, 5))} />
              </div>
              <div>
                <Lbl>Ville</Lbl>
                <FInput placeholder="Paris" value={form.villePatient} onChange={(e) => set("villePatient", e.target.value)} />
              </div>
            </div>
          </div>

          {/* ══ PRESCRIPTION MÉDICALE ══ */}
          <SectionBanner titre="▌ LA PRESCRIPTION MÉDICALE" />
          <div className="bg-white px-6 py-5 space-y-6 border-b border-slate-200">

            {/* ① Situation */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span style={{ background: "#1D6EF5" }} className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">①</span>
                Situation
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6">
                <CaseCocher label="Hospitalisation (complète, partielle ou ambulatoire)" checked={form.situation.hospitalisation} onChange={(v) => setSituation("hospitalisation", v)} />
                <CaseCocher label="Séances de chimiothérapie" checked={form.situation.chimiotherapie} onChange={(v) => setSituation("chimiotherapie", v)} />
                <CaseCocher label="Séances de radiothérapie" checked={form.situation.radiotherapie} onChange={(v) => setSituation("radiotherapie", v)} />
                <CaseCocher label="Hémodialyse" checked={form.situation.hemodialyse} onChange={(v) => setSituation("hemodialyse", v)} />
                <CaseCocher label="ALD exonérante" checked={form.situation.aldExonerante} onChange={(v) => setSituation("aldExonerante", v)} />
                <CaseCocher label="ALD non exonérante" checked={form.situation.aldNonExonerante} onChange={(v) => setSituation("aldNonExonerante", v)} />
                <CaseCocher label="Accident du travail / Maladie professionnelle" checked={form.situation.atMp} onChange={(v) => setSituation("atMp", v)} />
              </div>
            </div>

            {/* ② Mode de transport */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span style={{ background: "#1D6EF5" }} className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">②</span>
                Mode de transport
              </p>
              <div className="space-y-3">
                <div>
                  <RadioBtn checked={form.modeTransport === "AMBULANCE"} onChange={() => set("modeTransport", "AMBULANCE")} label="Transport en ambulance — justifié par :" />
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
                <RadioBtn checked={form.modeTransport === "VSL"} onChange={() => set("modeTransport", "VSL")} label="Transport assis professionnalisé (VSL)" />
                <RadioBtn checked={form.modeTransport === "TPMR"} onChange={() => set("modeTransport", "TPMR")} label="Véhicule adapté fauteuil roulant (TPMR)" />
                <RadioBtn checked={form.modeTransport === "INDIVIDUEL"} onChange={() => set("modeTransport", "INDIVIDUEL")} label="Moyen de transport individuel" />
                <div className="pt-1 border-t border-slate-100">
                  <CaseCocher label="Accompagnateur nécessaire" checked={form.accompagnateur} onChange={(v) => set("accompagnateur", v)} />
                </div>
              </div>
            </div>

            {/* ③ Trajet */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span style={{ background: "#1D6EF5" }} className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">③</span>
                Trajet
              </p>
              <div className="space-y-3">
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Départ</p>
                  <div className="flex flex-wrap gap-4">
                    <RadioBtn checked={form.departType === "domicile"} onChange={() => set("departType", "domicile")} label="Domicile" />
                    <RadioBtn checked={form.departType === "autre"} onChange={() => set("departType", "autre")} label="Autre lieu" />
                    <RadioBtn checked={form.departType === "structure"} onChange={() => set("departType", "structure")} label="Structure de soins" />
                  </div>
                  <FInput placeholder="Adresse de départ" value={form.adresseDepart} onChange={(e) => set("adresseDepart", e.target.value)} />
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Arrivée</p>
                  <div className="flex flex-wrap gap-4">
                    <RadioBtn checked={form.arriveeType === "domicile"} onChange={() => set("arriveeType", "domicile")} label="Domicile" />
                    <RadioBtn checked={form.arriveeType === "autre"} onChange={() => set("arriveeType", "autre")} label="Autre lieu" />
                    <RadioBtn checked={form.arriveeType === "structure"} onChange={() => set("arriveeType", "structure")} label="Structure de soins" />
                  </div>
                  <FInput placeholder="Adresse de destination" value={form.adresseArrivee} onChange={(e) => set("adresseArrivee", e.target.value)} />
                  <FInput placeholder="Nom de l'établissement de soins (si applicable)" value={form.structureSoins} onChange={(e) => set("structureSoins", e.target.value)} />
                </div>
                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <CaseCocher label="Transport aller-retour" checked={form.allerRetour} onChange={(v) => set("allerRetour", v)} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Transports itératifs :</span>
                    <input
                      type="number" min="0" placeholder="0" value={form.nbTransportsIteratifs}
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
                <span style={{ background: "#1D6EF5" }} className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">④</span>
                Urgence
              </p>
              <div className="space-y-2">
                <CaseCocher label="Urgence SAMU — Centre 15" checked={form.urgenceSAMU} onChange={(v) => set("urgenceSAMU", v)} />
                <CaseCocher label="Autres urgences" checked={form.autresUrgences} onChange={(v) => set("autresUrgences", v)} />
                {form.autresUrgences && (
                  <div className="ml-6">
                    <FInput placeholder="Préciser…" value={form.precisionUrgence} onChange={(e) => set("precisionUrgence", e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            {/* ⑤ Éléments médicaux */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span style={{ background: "#1D6EF5" }} className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">⑤</span>
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
                <span style={{ background: "#1D6EF5" }} className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">⑥</span>
                Cas particuliers
              </p>
              <div className="space-y-2">
                <CaseCocher label="Exonération du ticket modérateur" checked={form.exonerationTM} onChange={(v) => set("exonerationTM", v)} />
                <CaseCocher label="Pension militaire d'invalidité" checked={form.pensionMilitaire} onChange={(v) => set("pensionMilitaire", v)} />
              </div>
            </div>
          </div>

          {/* ══ PRESCRIPTEUR ══ */}
          <SectionBanner titre="▌ IDENTIFICATION DU PRESCRIPTEUR" />
          <div className="bg-white px-6 py-5 pb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <Lbl required>Nom du médecin</Lbl>
                  <FInput placeholder="Nom" value={form["medecin.nom"]} onChange={(e) => set("medecin.nom", e.target.value)} />
                </div>
                <div>
                  <Lbl>Prénom</Lbl>
                  <FInput placeholder="Prénom" value={form["medecin.prenom"]} onChange={(e) => set("medecin.prenom", e.target.value)} />
                </div>
                <div>
                  <Lbl>Identifiant RPPS (11 chiffres)</Lbl>
                  <FInput placeholder="00000000000" maxLength={11} value={form["medecin.rpps"]} onChange={(e) => set("medecin.rpps", e.target.value.replace(/\D/g, "").slice(0, 11))} />
                </div>
                <div>
                  <Lbl required>Date de prescription</Lbl>
                  <FInput type="date" value={form.dateEmission} onChange={(e) => set("dateEmission", e.target.value)} />
                </div>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center">
                  <span className="material-symbols-outlined text-slate-300 text-3xl block mb-1">draw</span>
                  <p className="text-xs text-slate-400">Zone de signature du médecin</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <Lbl>Raison sociale de l'établissement</Lbl>
                  <FInput placeholder="Hôpital, cabinet médical…" value={form["medecin.etablissement"]} onChange={(e) => set("medecin.etablissement", e.target.value)} />
                </div>
                <div>
                  <Lbl>Spécialité</Lbl>
                  <FInput placeholder="Cardiologie, Oncologie…" value={form["medecin.specialite"]} onChange={(e) => set("medecin.specialite", e.target.value)} />
                </div>
                <div>
                  <Lbl>Adresse de l'établissement</Lbl>
                  <FInput placeholder="N° rue, ville, code postal" value={form["medecin.adresse"]} onChange={(e) => set("medecin.adresse", e.target.value)} />
                </div>
                <div>
                  <Lbl>N° structure (AM / FINESS / SIRET)</Lbl>
                  <FInput placeholder="Identifiant structure" value={form["medecin.nStructure"]} onChange={(e) => set("medecin.nStructure", e.target.value)} />
                </div>
                <div>
                  <Lbl>Téléphone</Lbl>
                  <FInput type="tel" placeholder="04 00 00 00 00" value={form["medecin.telephone"]} onChange={(e) => set("medecin.telephone", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ERREUR ── */}
        {erreur && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-2.5 text-red-700 text-sm shrink-0 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {erreur}
          </div>
        )}

        {/* ── FOOTER ── */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
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
                  <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
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
