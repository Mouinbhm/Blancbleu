// Fichier : client/src/pages/Personnel.jsx
import { useState, useEffect, useCallback } from "react";
import { personnelService, vehicleService } from "../services/api";
import { useAuth } from "../context/AuthContext";

// ── Constantes métier ─────────────────────────────────────────────────────────
const ROLES    = ["Ambulancier", "Secouriste", "Infirmier", "Médecin", "Chauffeur", "Autre"];
const STATUTS  = ["en-service", "conge", "formation", "maladie", "inactif"];
const CONTRATS = ["CDI", "CDD", "Intérim", "Stage", "Alternance"];
const JOURS    = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CERTIF_TYPES = ["DEA", "AFGSU1", "AFGSU2", "PSE1", "PSE2", "CATU", "SST", "Formation continue", "Autre"];

const STATUT_CFG = {
  "en-service": { label: "En service",  bg: "bg-green-100",   text: "text-green-700"  },
  conge:        { label: "Congé",        bg: "bg-blue-100",    text: "text-blue-700"   },
  formation:    { label: "Formation",    bg: "bg-indigo-100",  text: "text-indigo-700" },
  maladie:      { label: "Maladie",      bg: "bg-red-100",     text: "text-red-700"    },
  inactif:      { label: "Inactif",      bg: "bg-slate-100",   text: "text-slate-600"  },
};

const CONTRAT_CFG = {
  CDI:        { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  CDD:        { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  "Intérim":  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200"  },
  Stage:      { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200"  },
  Alternance: { bg: "bg-pink-50",    text: "text-pink-700",    border: "border-pink-200"    },
};

// ── Styles réutilisables ──────────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white transition-all";
const labelCls = "text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5";

// ── Helpers ───────────────────────────────────────────────────────────────────
function calculerAnciennete(dateEmbauche) {
  if (!dateEmbauche) return null;
  const debut = new Date(dateEmbauche);
  const now   = new Date();
  if (isNaN(debut)) return null;
  const diffMonths = Math.floor((now - debut) / (1000 * 60 * 60 * 24 * 30.44));
  if (diffMonths < 1) return "< 1 mois";
  const annees = Math.floor(diffMonths / 12);
  const mois   = diffMonths % 12;
  if (annees === 0) return `${mois} mois`;
  if (mois   === 0) return `${annees} an${annees > 1 ? "s" : ""}`;
  return `${annees} an${annees > 1 ? "s" : ""} ${mois} mois`;
}

const OPTIONAL_KEYS = [
  "telephone", "email", "dateNaissance", "adresse", "photoUrl",
  "numeroPermis", "permisExpiration", "typeContrat", "dateEmbauche",
  "uniteAssignee", "notes",
];
function calculerCompletion(form) {
  const hasCerts = (form.certifications?.length ?? 0) > 0;
  const hasDispo = Object.values(form.disponibilites || {}).some(Boolean);
  const extra = [hasCerts ? "x" : "", hasDispo ? "x" : ""];
  const all = [...OPTIONAL_KEYS.map((k) => form[k] || ""), ...extra];
  return Math.round((all.filter(Boolean).length / all.length) * 100);
}

function toDateInput(val) {
  if (!val) return "";
  return new Date(val).toISOString().split("T")[0];
}

function initForm(m) {
  return {
    nom:             m?.nom            || "",
    prenom:          m?.prenom         || "",
    dateNaissance:   toDateInput(m?.dateNaissance),
    adresse:         m?.adresse        || "",
    telephone:       m?.telephone      || "",
    email:           m?.email          || "",
    photoUrl:        m?.photoUrl       || "",
    role:            m?.role           || "Ambulancier",
    numeroPermis:    m?.numeroPermis   || "",
    permisExpiration:toDateInput(m?.permisExpiration),
    certifications:  (m?.certifications || []).map((c) => ({
      nom:            c.nom            || "",
      dateObtention:  toDateInput(c.dateObtention),
      dateExpiration: toDateInput(c.dateExpiration),
    })),
    statut:          m?.statut         || "en-service",
    typeContrat:     m?.typeContrat    || "",
    dateEmbauche:    toDateInput(m?.dateEmbauche),
    salaireBrut:     m?.salaireBrut   ?? 0,
    salaireNet:      m?.salaireNet    ?? 0,
    uniteAssignee:   m?.uniteAssignee?._id || m?.uniteAssignee || "",
    disponibilites:  m?.disponibilites || Object.fromEntries(JOURS.map((j) => [j, false])),
    notes:           m?.notes          || "",
  };
}

const STEPS = [
  { label: "Identité",      icon: "person",            desc: "Informations personnelles"  },
  { label: "Qualifications",icon: "workspace_premium",  desc: "Rôle et certifications"     },
  { label: "Affectation",   icon: "assignment_ind",     desc: "Contrat, véhicule, dispo"   },
];

// ══════════════════════════════════════════════════════════════════════════════
// MODAL — WIZARD 3 ÉTAPES
// ══════════════════════════════════════════════════════════════════════════════
function ModalMembre({ membre, onClose, onSaved }) {
  const editing = !!membre?._id;
  const [step, setStep]       = useState(0);
  const [form, setForm]       = useState(() => initForm(membre));
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur]   = useState(null);

  useEffect(() => {
    vehicleService
      .getAll()
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : r.data?.vehicles || [];
        setVehicles(list);
      })
      .catch(() => {});
  }, []);

  const set  = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const addCert    = () => setForm((f) => ({ ...f, certifications: [...f.certifications, { nom: "", dateObtention: "", dateExpiration: "" }] }));
  const removeCert = (i) => setForm((f) => ({ ...f, certifications: f.certifications.filter((_, idx) => idx !== i) }));
  const updateCert = (i, key, val) => setForm((f) => ({
    ...f,
    certifications: f.certifications.map((c, idx) => idx === i ? { ...c, [key]: val } : c),
  }));
  const toggleJour = (jour) => setForm((f) => ({
    ...f,
    disponibilites: { ...f.disponibilites, [jour]: !f.disponibilites[jour] },
  }));

  const validateStep = () => {
    if (step === 0 && (!form.nom.trim() || !form.prenom.trim())) {
      setErreur("Nom et prénom sont obligatoires.");
      return false;
    }
    setErreur(null);
    return true;
  };

  const handleNext = () => { if (validateStep()) setStep((s) => s + 1); };
  const handlePrev = () => { setErreur(null); setStep((s) => s - 1); };

  const handleSubmit = async () => {
    if (!form.nom.trim() || !form.prenom.trim()) {
      setErreur("Nom et prénom sont obligatoires.");
      return;
    }
    setLoading(true);
    setErreur(null);
    try {
      const payload = {
        ...form,
        uniteAssignee:  form.uniteAssignee  || null,
        certifications: form.certifications.filter((c) => c.nom.trim()),
        salaireBrut:    parseFloat(form.salaireBrut) || 0,
        salaireNet:     parseFloat(form.salaireNet)  || 0,
      };
      if (editing) {
        await personnelService.update(membre._id, payload);
      } else {
        await personnelService.create(payload);
      }
      onSaved();
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const completion = calculerCompletion(form);
  const anciennete = calculerAnciennete(form.dateEmbauche);
  const initials   = `${form.prenom?.[0] || "?"}${form.nom?.[0] || ""}`.toUpperCase();
  // Circonférence du cercle SVG (r=14) : 2π×14 ≈ 88
  const circ = 88;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: "92vh" }}>

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-navy to-blue-800 rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-blue-300 text-xs font-mono tracking-widest uppercase">
              {editing ? "Modifier le membre" : "Nouveau membre"}
            </p>
            <h3 className="text-white font-brand font-bold text-base mt-0.5">
              {STEPS[step].desc}
            </h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white text-sm font-bold">{completion}%</p>
              <p className="text-blue-300 text-xs">complété</p>
            </div>
            {/* Completion ring */}
            <div className="relative w-11 h-11 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={`${(completion / 100) * circ} ${circ}`} strokeLinecap="round"
                  style={{ transition: "stroke-dasharray .5s ease" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                {step + 1}/{STEPS.length}
              </span>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white ml-1">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* ── Steps indicator ── */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-2 ${i < step ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i < step
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : i === step
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}>
                    {i < step
                      ? <span className="material-symbols-outlined text-sm">check</span>
                      : i + 1
                    }
                  </div>
                  <span className={`text-xs font-semibold hidden sm:block ${
                    i === step ? "text-navy" : i < step ? "text-emerald-600" : "text-slate-400"
                  }`}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 rounded transition-all ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Error banner ── */}
        {erreur && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {erreur}
          </div>
        )}

        {/* ── Scrollable content ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ════ STEP 0 — Identité ════ */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex-shrink-0">
                  {form.photoUrl
                    ? <img src={form.photoUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover border-2 border-primary/30 shadow-sm" />
                    : <div className="w-16 h-16 rounded-full bg-gradient-to-br from-navy to-blue-500 flex items-center justify-center text-white text-xl font-bold shadow-sm">
                        {initials}
                      </div>
                  }
                </div>
                <div className="flex-1">
                  <label className={labelCls}>URL de la photo (optionnel)</label>
                  <input
                    type="url"
                    value={form.photoUrl}
                    onChange={(e) => set("photoUrl", e.target.value)}
                    className={inputCls}
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
              </div>

              {/* Nom / Prénom */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Prénom *</label>
                  <input
                    type="text" value={form.prenom} autoFocus
                    onChange={(e) => set("prenom", e.target.value)}
                    className={`${inputCls} ${!form.prenom.trim() && erreur ? "border-red-300" : ""}`}
                    placeholder="Jean"
                  />
                </div>
                <div>
                  <label className={labelCls}>Nom *</label>
                  <input
                    type="text" value={form.nom}
                    onChange={(e) => set("nom", e.target.value)}
                    className={`${inputCls} ${!form.nom.trim() && erreur ? "border-red-300" : ""}`}
                    placeholder="MARTIN"
                  />
                </div>
              </div>

              {/* Date naissance / Téléphone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date de naissance</label>
                  <input type="date" value={form.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Téléphone</label>
                  <input type="tel" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} className={inputCls} placeholder="06 00 00 00 00" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Email professionnel</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} placeholder="prenom.nom@blancbleu.fr" />
              </div>

              <div>
                <label className={labelCls}>Adresse</label>
                <input type="text" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} placeholder="12 rue Victor Hugo, Nice" />
              </div>
            </div>
          )}

          {/* ════ STEP 1 — Qualifications ════ */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Rôle */}
              <div>
                <label className={labelCls}>Rôle professionnel *</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r} type="button"
                      onClick={() => set("role", r)}
                      className={`py-2.5 px-3 rounded-xl border-2 text-xs font-semibold transition-all text-center ${
                        form.role === r
                          ? "border-primary bg-blue-50 text-primary shadow-sm"
                          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permis */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                  Permis de conduire
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Numéro de permis</label>
                    <input type="text" value={form.numeroPermis} onChange={(e) => set("numeroPermis", e.target.value)} className={inputCls} placeholder="123456789012" />
                  </div>
                  <div>
                    <label className={labelCls}>Date d'expiration</label>
                    <input type="date" value={form.permisExpiration} onChange={(e) => set("permisExpiration", e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Certifications */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                    Certifications & formations
                  </p>
                  <button
                    type="button" onClick={addCert}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-blue-700 border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Ajouter
                  </button>
                </div>

                {form.certifications.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <span className="material-symbols-outlined text-3xl block mb-1.5 text-slate-300">workspace_premium</span>
                    <p className="text-sm">Aucune certification ajoutée</p>
                    <p className="text-xs mt-1">DEA, AFGSU, PSE1, PSE2…</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.certifications.map((cert, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <label className={labelCls}>Type</label>
                            <select
                              value={cert.nom}
                              onChange={(e) => updateCert(i, "nom", e.target.value)}
                              className={inputCls}
                            >
                              <option value="">Choisir...</option>
                              {CERTIF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <button
                            type="button" onClick={() => removeCert(i)}
                            className="mt-6 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className={labelCls}>Obtenu le</label>
                            <input type="date" value={cert.dateObtention} onChange={(e) => updateCert(i, "dateObtention", e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Expire le</label>
                            <input type="date" value={cert.dateExpiration} onChange={(e) => updateCert(i, "dateExpiration", e.target.value)} className={inputCls} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ STEP 2 — Affectation & Contrat ════ */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Infos professionnelles */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                  Informations professionnelles
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Statut opérationnel</label>
                    <select value={form.statut} onChange={(e) => set("statut", e.target.value)} className={inputCls}>
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>{STATUT_CFG[s]?.label || s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Type de contrat</label>
                    <select value={form.typeContrat} onChange={(e) => set("typeContrat", e.target.value)} className={inputCls}>
                      <option value="">Non renseigné</option>
                      {CONTRATS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Date d'embauche</label>
                    <input
                      type="date" value={form.dateEmbauche}
                      onChange={(e) => set("dateEmbauche", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    {anciennete ? (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-base">schedule</span>
                        <div>
                          <p className="text-xs text-slate-400">Ancienneté calculée</p>
                          <p className="text-sm font-bold text-primary">{anciennete}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-400 text-center">
                        Ancienneté calculée<br />automatiquement
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Salaires */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Salaire brut (€)</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.salaireBrut}
                    onChange={(e) => set("salaireBrut", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Salaire net (€)</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.salaireNet}
                    onChange={(e) => set("salaireNet", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Véhicule assigné */}
              <div>
                <label className={labelCls}>Véhicule assigné</label>
                <select value={form.uniteAssignee} onChange={(e) => set("uniteAssignee", e.target.value)} className={inputCls}>
                  <option value="">— Aucun véhicule —</option>
                  {vehicles.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.immatriculation} — {v.nom} ({v.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Disponibilités */}
              <div>
                <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Disponibilités
                </p>
                <div className="flex flex-wrap gap-2">
                  {JOURS.map((jour) => (
                    <button
                      key={jour} type="button"
                      onClick={() => toggleJour(jour)}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                        form.disponibilites[jour]
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {jour.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {Object.values(form.disponibilites).filter(Boolean).length} jour(s) sélectionné(s)
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls}>Notes internes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  className={inputCls}
                  placeholder="Informations particulières, restrictions, observations..."
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer navigation ── */}
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50/50 rounded-b-2xl">
          <button
            type="button"
            onClick={step === 0 ? onClose : handlePrev}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-white transition-all"
          >
            <span className="material-symbols-outlined text-sm">
              {step === 0 ? "close" : "arrow_back"}
            </span>
            {step === 0 ? "Annuler" : "Précédent"}
          </button>

          <div className="flex items-center gap-2">
            {/* Dots indicateur */}
            {STEPS.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === step ? "bg-primary w-4" : i < step ? "bg-emerald-400" : "bg-slate-200"}`} />
            ))}
          </div>

          {step < STEPS.length - 1 ? (
            <button
              type="button" onClick={handleNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-primary/20"
            >
              Suivant
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          ) : (
            <button
              type="button" onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
            >
              {loading
                ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.4)", borderTop: "2px solid white", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />Enregistrement…</>
                : <>{editing ? "Mettre à jour" : "Créer le membre"}<span className="material-symbols-outlined text-sm">check</span></>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FICHE DÉTAIL — slide-over latéral
// ══════════════════════════════════════════════════════════════════════════════
function FicheDetail({ membre, onClose, onEdit }) {
  const { user } = useAuth();
  const anciennete = calculerAnciennete(membre.dateEmbauche);
  const cfg = STATUT_CFG[membre.statut] || STATUT_CFG.inactif;
  const contratCfg = CONTRAT_CFG[membre.typeContrat] || null;
  const initials = `${membre.prenom?.[0] || "?"}${membre.nom?.[0] || ""}`.toUpperCase();
  const joursActifs = Object.entries(membre.disponibilites || {}).filter(([, v]) => v).map(([k]) => k.slice(0, 3));

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm h-full overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideInRight .25s ease" }}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-navy to-blue-800 px-5 py-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="flex items-center gap-4">
            {membre.photoUrl
              ? <img src={membre.photoUrl} alt="avatar" className="w-16 h-16 rounded-full border-2 border-white/30 object-cover" />
              : <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">{initials}</div>
            }
            <div>
              <h3 className="text-white font-brand font-bold text-lg">{membre.prenom} {membre.nom}</h3>
              <p className="text-blue-300 text-sm">{membre.role}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                {contratCfg && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${contratCfg.bg} ${contratCfg.text} ${contratCfg.border}`}>{membre.typeContrat}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5 text-sm">
          {/* Coordonnées */}
          <Section title="Coordonnées" icon="contact_page">
            <Row icon="call" label={membre.telephone || "—"} />
            <Row icon="mail" label={membre.email || "—"} />
            {membre.adresse && <Row icon="location_on" label={membre.adresse} />}
            {membre.dateNaissance && (
              <Row icon="cake" label={new Date(membre.dateNaissance).toLocaleDateString("fr-FR")} />
            )}
          </Section>

          {/* Contrat */}
          {(membre.typeContrat || membre.dateEmbauche) && (
            <Section title="Contrat" icon="work">
              {membre.typeContrat && <Row icon="badge" label={membre.typeContrat} />}
              {membre.dateEmbauche && (
                <Row icon="calendar_today" label={`Depuis le ${new Date(membre.dateEmbauche).toLocaleDateString("fr-FR")}`} />
              )}
              {anciennete && (
                <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 mt-1">
                  <span className="material-symbols-outlined text-primary text-sm">schedule</span>
                  <span className="text-primary font-bold">{anciennete}</span>
                  <span className="text-slate-400 text-xs">d'ancienneté</span>
                </div>
              )}
              {user?.role !== "dispatcher" && (membre.salaireBrut > 0 || membre.salaireNet > 0) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {membre.salaireBrut > 0 && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400">Brut</p>
                      <p className="text-sm font-bold text-navy">{membre.salaireBrut.toLocaleString("fr-FR")} €</p>
                    </div>
                  )}
                  {membre.salaireNet > 0 && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400">Net</p>
                      <p className="text-sm font-bold text-navy">{membre.salaireNet.toLocaleString("fr-FR")} €</p>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Permis */}
          {membre.numeroPermis && (
            <Section title="Permis de conduire" icon="drive_eta">
              <Row icon="numbers" label={membre.numeroPermis} />
              {membre.permisExpiration && (
                <Row icon="event" label={`Expire le ${new Date(membre.permisExpiration).toLocaleDateString("fr-FR")}`} />
              )}
            </Section>
          )}

          {/* Certifications */}
          {(membre.certifications?.length > 0) && (
            <Section title="Certifications" icon="workspace_premium">
              {membre.certifications.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="font-semibold text-navy">{c.nom}</span>
                  {c.dateExpiration && (
                    <span className="text-xs text-slate-400">
                      exp. {new Date(c.dateExpiration).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Véhicule */}
          {membre.uniteAssignee && (
            <Section title="Véhicule assigné" icon="local_shipping">
              <Row icon="directions_car" label={`${membre.uniteAssignee.immatriculation || ""} — ${membre.uniteAssignee.nom || ""} (${membre.uniteAssignee.type || ""})`} />
            </Section>
          )}

          {/* Disponibilités */}
          {joursActifs.length > 0 && (
            <Section title="Disponibilités" icon="event_available">
              <div className="flex flex-wrap gap-1.5 mt-1">
                {joursActifs.map((j) => (
                  <span key={j} className="px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-xs font-semibold">{j}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Notes */}
          {membre.notes && (
            <Section title="Notes internes" icon="notes">
              <p className="text-slate-600 text-sm leading-relaxed bg-slate-50 rounded-lg px-3 py-2">{membre.notes}</p>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4">
          <button
            onClick={onEdit}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            Modifier ce membre
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
        <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ icon, label }) {
  return (
    <div className="flex items-center gap-2 text-slate-600 py-0.5">
      <span className="material-symbols-outlined text-slate-300 text-sm flex-shrink-0">{icon}</span>
      <span className="text-sm truncate">{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════════
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
      <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      Chargement…
    </div>
  );
}

export default function Personnel() {
  const [personnel, setPersonnel]   = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [erreur, setErreur]         = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreRole, setFiltreRole]     = useState("");
  const [recherche, setRecherche]       = useState("");
  const [modal, setModal]           = useState(null); // null | { membre? }
  const [detail, setDetail]         = useState(null); // membre | null

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
    if (filtreRole   && p.role   !== filtreRole)   return false;
    if (recherche.trim()) {
      const q = recherche.toLowerCase();
      if (!`${p.nom} ${p.prenom}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-7 fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Personnel</h1>
          <p className="text-slate-400 text-sm mt-0.5">{personnel.length} membre(s) actif(s)</p>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          Nouveau membre
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total",           value: stats.total,                                                                     color: "text-navy"    },
            { label: "En service",      value: stats.parStatut?.enService,                                                      color: "text-green-600"},
            { label: "Congé / Maladie", value: (stats.parStatut?.conge || 0) + (stats.parStatut?.maladie || 0),                color: "text-orange-600"},
            { label: "Formation",       value: stats.parStatut?.formation,                                                      color: "text-indigo-600"},
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
          <input
            type="text" placeholder="Rechercher…" value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="flex-1 text-sm outline-none"
          />
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
                {["Membre", "Rôle", "Statut", "Contrat", "Ancienneté", "Certif.", "Téléphone", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtre.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">Aucun membre trouvé</td>
                </tr>
              ) : (
                filtre.map((p) => {
                  const cfg        = STATUT_CFG[p.statut] || STATUT_CFG.inactif;
                  const contratCfg = CONTRAT_CFG[p.typeContrat] || null;
                  const anc        = calculerAnciennete(p.dateEmbauche);
                  const certCount  = p.certifications?.length ?? 0;
                  const initials   = `${p.nom?.[0] || "?"}${p.prenom?.[0] || ""}`.toUpperCase();

                  return (
                    <tr key={p._id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => setDetail(p)}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          {p.photoUrl
                            ? <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                            : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
                          }
                          <div>
                            <button
                              onClick={() => setDetail(p)}
                              className="font-semibold text-navy hover:text-primary transition-colors"
                            >
                              {p.nom} {p.prenom}
                            </button>
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
                      <td className="px-4 py-3">
                        {contratCfg ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${contratCfg.bg} ${contratCfg.text} ${contratCfg.border}`}>
                            {p.typeContrat}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">{anc || "—"}</td>
                      <td className="px-4 py-3">
                        {certCount > 0
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                              <span className="material-symbols-outlined text-xs">workspace_premium</span>
                              {certCount}
                            </span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.telephone || "—"}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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

      {/* Modals */}
      {modal !== null && (
        <ModalMembre
          membre={modal.membre}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData(); }}
        />
      )}

      {detail && (
        <FicheDetail
          membre={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setModal({ membre: detail }); setDetail(null); }}
        />
      )}
    </div>
  );
}
