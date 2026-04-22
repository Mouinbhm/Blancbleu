// Fichier : client/src/pages/NouveauTransport.jsx
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { transportService, patientService } from "../services/api";
import AdresseAutocomplete from "../components/forms/AdresseAutocomplete";

// Jours fériés français 2025–2026 (miroir de recurrenceService.js côté backend)
const JOURS_FERIES_FR = new Set([
  "2025-01-01","2025-04-21","2025-05-01","2025-05-08","2025-05-29",
  "2025-06-09","2025-07-14","2025-08-15","2025-11-01","2025-11-11","2025-12-25",
  "2026-01-01","2026-04-06","2026-05-01","2026-05-08","2026-05-14",
  "2026-05-25","2026-07-14","2026-08-15","2026-11-01","2026-11-11","2026-12-25",
]);

/** Calcule les occurrences côté client (preview uniquement). */
function calculerOccurrences(dateDebut, dateFin, joursSemaine) {
  if (!dateDebut || !dateFin || joursSemaine.length === 0) return { nb: 0, nbExclus: 0 };
  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);
  if (fin <= debut) return { nb: 0, nbExclus: 0 };
  let nb = 0, nbExclus = 0;
  const courant = new Date(debut);
  courant.setHours(0, 0, 0, 0);
  while (courant <= fin && nb + nbExclus < 365) {
    const jourISO = courant.getDay() === 0 ? 7 : courant.getDay();
    if (joursSemaine.includes(jourISO)) {
      if (JOURS_FERIES_FR.has(courant.toISOString().slice(0, 10))) nbExclus++;
      else nb++;
    }
    courant.setDate(courant.getDate() + 1);
  }
  return { nb, nbExclus };
}

const MOTIFS = [
  "Dialyse","Chimiothérapie","Radiothérapie","Consultation",
  "Hospitalisation","Sortie hospitalisation","Rééducation","Analyse","Autre",
];

const JOURS = [
  { num: 1, label: "Lun" },{ num: 2, label: "Mar" },{ num: 3, label: "Mer" },
  { num: 4, label: "Jeu" },{ num: 5, label: "Ven" },{ num: 6, label: "Sam" },
  { num: 7, label: "Dim" },
];

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white transition-colors";

const sectionCls = "bg-white rounded-xl border border-slate-200 p-5 mb-4";

function Section({ title, icon, children }) {
  return (
    <div className={sectionCls}>
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
        <h3 className="font-brand font-bold text-navy text-sm uppercase tracking-wide">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children, error }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── État initial des blocs adresse (inclut lat/lng pour le GPS) ───────────────
const ADRESSE_DEPART_INIT = {
  rue: "", ville: "Nice", codePostal: "06000", lat: null, lng: null,
};
const ADRESSE_DEST_INIT = {
  nom: "", rue: "", ville: "Nice", codePostal: "06000", service: "",
  lat: null, lng: null,
};

// ── Sélecteur de patient existant ─────────────────────────────────────────────
function PatientSelector({ value, onChange }) {
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!recherche.trim()) { setResultats([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await patientService.getAll({ recherche, limit: 10 });
        setResultats(data.patients || []);
        setShowDropdown(true);
      } catch { /* silencieux */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [recherche]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (p) => {
    onChange(p);
    setRecherche(`${p.nom} ${p.prenom}`);
    setShowDropdown(false);
  };

  const handleClear = () => {
    onChange(null);
    setRecherche("");
    setResultats([]);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Rechercher un patient existant…"
          value={value ? `${value.nom} ${value.prenom}` : recherche}
          onChange={(e) => { if (!value) setRecherche(e.target.value); }}
          readOnly={!!value}
          className={`flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none transition-colors ${value ? "border-green-400 bg-green-50 text-green-800" : "border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/20"}`}
        />
        {value && (
          <button type="button" onClick={handleClear} className="px-3 py-2.5 border border-slate-200 rounded-lg text-slate-400 hover:text-red-400 hover:border-red-200 transition-colors text-sm">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>
      {value && (
        <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200 text-xs text-green-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          Patient lié : {value.nom} {value.prenom}
          {value.mobilite && <span className="ml-1 font-semibold">· {value.mobilite}</span>}
          {value.telephone && <span>· {value.telephone}</span>}
        </div>
      )}
      {showDropdown && resultats.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 mt-1 max-h-48 overflow-y-auto">
          {resultats.map((p) => (
            <div key={p._id} onClick={() => handleSelect(p)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface cursor-pointer transition-colors border-b border-slate-50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-white text-xs font-bold">
                {p.nom?.[0]}{p.prenom?.[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">{p.nom} {p.prenom}</p>
                <p className="text-xs text-slate-400">{p.numeroPatient} · {p.mobilite} {p.telephone ? `· ${p.telephone}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {showDropdown && recherche.trim() && resultats.length === 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 mt-1 px-4 py-3 text-sm text-slate-400">
          Aucun patient trouvé — remplissez le formulaire ci-dessous
        </div>
      )}
    </div>
  );
}

const MOBILITE_TYPE = {
  ASSIS: "VSL",
  FAUTEUIL_ROULANT: "TPMR",
  ALLONGE: "AMBULANCE",
  CIVIERE: "AMBULANCE",
};

export default function NouveauTransport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get("patientId");

  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [errors, setErrors] = useState({});
  const [patientLie, setPatientLie] = useState(null); // Patient entity sélectionné

  // Charger le patient depuis l'URL si fourni (depuis la fiche patient)
  useEffect(() => {
    if (patientIdParam) {
      patientService.getOne(patientIdParam)
        .then(({ data }) => {
          setPatientLie(data);
          // Pré-remplir le formulaire avec les données du patient
          setForm((f) => ({
            ...f,
            patientNom: data.nom || "",
            patientPrenom: data.prenom || "",
            patientTelephone: data.telephone || "",
            patientMobilite: data.mobilite || "ASSIS",
            patientOxygene: data.oxygene || false,
            patientBrancardage: data.brancardage || false,
            patientAccompagnateur: data.accompagnateur || false,
            typeTransport: MOBILITE_TYPE[data.mobilite] || "VSL",
          }));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientIdParam]);

  // Quand un patient est sélectionné via la recherche, pré-remplir le formulaire
  const handlePatientSelect = (p) => {
    setPatientLie(p);
    if (p) {
      setForm((f) => ({
        ...f,
        patientNom: p.nom || "",
        patientPrenom: p.prenom || "",
        patientTelephone: p.telephone || "",
        patientMobilite: p.mobilite || "ASSIS",
        patientOxygene: p.oxygene || false,
        patientBrancardage: p.brancardage || false,
        patientAccompagnateur: p.accompagnateur || false,
        typeTransport: MOBILITE_TYPE[p.mobilite] || "VSL",
      }));
    }
  };

  const [form, setForm] = useState({
    // Patient
    patientNom: "",
    patientPrenom: "",
    patientTelephone: "",
    patientMobilite: "ASSIS",
    patientOxygene: false,
    patientBrancardage: false,
    patientAccompagnateur: false,
    patientNotes: "",
    // Transport
    typeTransport: "VSL",
    motif: "Consultation",
    dateTransport: "",
    heureRDV: "",
    allerRetour: false,
    // Récurrence
    recurrenceActive: false,
    recurrenceJours: [],
    recurrenceDateFin: "",
    // Notes
    notes: "",
  });

  // Adresses séparées du reste du form pour clarifier la gestion GPS
  const [adresseDepart, setAdresseDepart] = useState(ADRESSE_DEPART_INIT);
  const [adresseDest, setAdresseDest] = useState(ADRESSE_DEST_INIT);

  // ── Estimation tarifaire CPAM ─────────────────────────────────────────────────
  const [estimation, setEstimation] = useState(null);
  const [estimationLoading, setEstimationLoading] = useState(false);
  const estDebounceRef = useRef(null);

  // Recalcule l'estimation dès que les adresses ou le type changent.
  // Utilise les coordonnées GPS déjà connues (évite un second géocodage).
  useEffect(() => {
    clearTimeout(estDebounceRef.current);

    const lat1 = adresseDepart.lat;
    const lng1 = adresseDepart.lng;
    const lat2 = adresseDest.lat;
    const lng2 = adresseDest.lng;

    // Si l'une des deux adresses n'a pas encore de GPS, on ne peut pas estimer
    if (!lat1 || !lat2) {
      setEstimation(null);
      return;
    }

    estDebounceRef.current = setTimeout(async () => {
      setEstimationLoading(true);
      try {
        const { data } = await transportService.estimerTarif({
          typeTransport: form.typeTransport,
          lat1, lng1, lat2, lng2,
          allerRetour: form.allerRetour,
          heureRDV: form.heureRDV || undefined,
          dateTransport: form.dateTransport || undefined,
        });
        setEstimation(data);
      } catch {
        setEstimation(null);
      } finally {
        setEstimationLoading(false);
      }
    }, 600);

    return () => clearTimeout(estDebounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adresseDepart.lat, adresseDepart.lng,
    adresseDest.lat, adresseDest.lng,
    form.typeTransport, form.allerRetour, form.heureRDV, form.dateTransport,
  ]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const set = (key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "patientMobilite") {
        next.typeTransport = MOBILITE_TYPE[value] || "VSL";
      }
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const toggleJour = (num) => {
    setForm((f) => ({
      ...f,
      recurrenceJours: f.recurrenceJours.includes(num)
        ? f.recurrenceJours.filter((j) => j !== num)
        : [...f.recurrenceJours, num],
    }));
  };

  // Callback AdresseAutocomplete → départ
  const handleAdresseDepartChange = (adresse) => {
    setAdresseDepart((prev) => ({ ...prev, ...adresse }));
    if (errors.departRue) setErrors((e) => ({ ...e, departRue: "" }));
  };

  // Callback AdresseAutocomplete → destination
  const handleAdresseDestChange = (adresse) => {
    setAdresseDest((prev) => ({ ...prev, ...adresse }));
    if (errors.destRue) setErrors((e) => ({ ...e, destRue: "" }));
  };

  const apercu = useMemo(
    () => calculerOccurrences(form.dateTransport, form.recurrenceDateFin, form.recurrenceJours),
    [form.dateTransport, form.recurrenceDateFin, form.recurrenceJours],
  );

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.patientNom.trim()) e.patientNom = "Nom obligatoire";
    if (!form.motif) e.motif = "Motif obligatoire";
    if (!form.dateTransport) e.dateTransport = "Date obligatoire";
    if (!form.heureRDV) e.heureRDV = "Heure obligatoire";
    if (!adresseDepart.rue.trim()) e.departRue = "Adresse de départ obligatoire";
    if (!adresseDest.rue.trim() && !adresseDest.nom.trim())
      e.destRue = "Adresse destination obligatoire";
    if (form.recurrenceActive) {
      if (form.recurrenceJours.length === 0)
        e.recurrenceJours = "Sélectionnez au moins un jour de la semaine";
      if (!form.recurrenceDateFin)
        e.recurrenceDateFin = "Date de fin obligatoire";
      else if (new Date(form.recurrenceDateFin) <= new Date(form.dateTransport))
        e.recurrenceDateFin = "La date de fin doit être postérieure à la date du transport";
    }
    return e;
  };

  // ── Soumission ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErreur(null);
    try {
      const basePayload = {
        // Lien vers l'entité Patient si elle a été sélectionnée
        ...(patientLie && { patientId: patientLie._id }),
        patient: {
          nom: form.patientNom.trim(),
          prenom: form.patientPrenom.trim(),
          telephone: form.patientTelephone.trim(),
          mobilite: form.patientMobilite,
          oxygene: form.patientOxygene,
          brancardage: form.patientBrancardage,
          accompagnateur: form.patientAccompagnateur,
          notes: form.patientNotes,
        },
        typeTransport: form.typeTransport,
        motif: form.motif,
        dateTransport: form.dateTransport,
        heureRDV: form.heureRDV,
        allerRetour: form.allerRetour,
        // Adresses avec coordonnées GPS si disponibles
        adresseDepart: {
          rue: adresseDepart.rue.trim(),
          ville: adresseDepart.ville.trim(),
          codePostal: adresseDepart.codePostal.trim(),
          ...(adresseDepart.lat && {
            coordonnees: { lat: adresseDepart.lat, lng: adresseDepart.lng },
          }),
        },
        adresseDestination: {
          nom: adresseDest.nom.trim(),
          rue: adresseDest.rue.trim(),
          ville: adresseDest.ville.trim(),
          codePostal: adresseDest.codePostal.trim(),
          service: adresseDest.service.trim(),
          ...(adresseDest.lat && {
            coordonnees: { lat: adresseDest.lat, lng: adresseDest.lng },
          }),
        },
        notes: form.notes,
      };

      if (form.recurrenceActive) {
        await transportService.creerRecurrents({
          ...basePayload,
          recurrence: {
            joursSemaine: form.recurrenceJours,
            dateFin: form.recurrenceDateFin,
          },
        });
        navigate("/transports");
      } else {
        const { data } = await transportService.create({
          ...basePayload,
          recurrence: { active: false, frequence: "", joursSemaine: [] },
        });
        navigate(`/transports/${String(data.transport?._id || data._id || "")}`);
      }
    } catch (err) {
      setErreur(
        err.response?.data?.message || "Erreur lors de la création du transport.",
      );
    } finally {
      setLoading(false);
    }
  };

  const typeLabel =
    form.typeTransport === "VSL"
      ? "VSL — Véhicule Sanitaire Léger"
      : form.typeTransport === "TPMR"
        ? "TPMR — Transport Personnes à Mobilité Réduite"
        : "Ambulance";

  return (
    <div className="p-7 fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-surface transition-colors"
        >
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Nouveau transport</h1>
          <p className="text-slate-400 text-sm">Transport sanitaire non urgent</p>
        </div>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {erreur}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Patient ── */}
        <Section title="Patient" icon="personal_injury">
          {/* Sélecteur patient existant */}
          <div className="mb-4 pb-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Lier à un patient existant (optionnel)
            </p>
            <PatientSelector value={patientLie} onChange={handlePatientSelect} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom" required error={errors.patientNom}>
              <input
                type="text"
                value={form.patientNom}
                onChange={(e) => set("patientNom", e.target.value)}
                className={inputCls}
                placeholder="Nom de famille"
              />
            </Field>
            <Field label="Prénom">
              <input
                type="text"
                value={form.patientPrenom}
                onChange={(e) => set("patientPrenom", e.target.value)}
                className={inputCls}
                placeholder="Prénom"
              />
            </Field>
            <Field label="Téléphone">
              <input
                type="tel"
                value={form.patientTelephone}
                onChange={(e) => set("patientTelephone", e.target.value)}
                className={inputCls}
                placeholder="06 00 00 00 00"
              />
            </Field>
            <Field label="Mobilité" required>
              <select
                value={form.patientMobilite}
                onChange={(e) => set("patientMobilite", e.target.value)}
                className={inputCls}
              >
                <option value="ASSIS">Assis (autonome)</option>
                <option value="FAUTEUIL_ROULANT">Fauteuil roulant</option>
                <option value="ALLONGE">Allongé</option>
                <option value="CIVIERE">Civière</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-primary bg-blue-50 rounded-lg px-3 py-2">
            <span className="material-symbols-outlined text-base">info</span>
            Type de transport : <span className="font-bold ml-1">{typeLabel}</span>
          </div>
          <div className="flex flex-wrap gap-4 mt-4">
            {[
              { key: "patientOxygene", label: "Oxygène" },
              { key: "patientBrancardage", label: "Brancardage" },
              { key: "patientAccompagnateur", label: "Accompagnateur" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* ── Planification ── */}
        <Section title="Planification" icon="calendar_month">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Motif" required error={errors.motif}>
              <select
                value={form.motif}
                onChange={(e) => set("motif", e.target.value)}
                className={inputCls}
              >
                {MOTIFS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <div />
            <Field label="Date du transport" required error={errors.dateTransport}>
              <input
                type="date"
                value={form.dateTransport}
                onChange={(e) => set("dateTransport", e.target.value)}
                className={inputCls}
                min={new Date().toISOString().split("T")[0]}
              />
            </Field>
            <Field label="Heure de RDV" required error={errors.heureRDV}>
              <input
                type="time"
                value={form.heureRDV}
                onChange={(e) => set("heureRDV", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allerRetour}
              onChange={(e) => set("allerRetour", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-slate-700 font-medium">
              Aller-retour (créer automatiquement le transport retour)
            </span>
          </label>
        </Section>

        {/* ── Adresses avec autocomplétion BAN ── */}
        <Section title="Adresses" icon="location_on">

          {/* Départ */}
          <div className="mb-5">
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">
              Adresse de départ
            </p>
            {/* Autocomplétion — remplit rue + GPS */}
            <div className="mb-3">
              <AdresseAutocomplete
                label="Recherche d'adresse"
                required
                error={errors.departRue}
                value={adresseDepart}
                onChange={handleAdresseDepartChange}
                placeholder="Saisir le numéro et nom de la rue…"
                id="depart-autocomplete"
              />
            </div>
            {/* Champs complémentaires toujours visibles (saisie manuelle possible) */}
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Field label="Code postal">
                <input
                  type="text"
                  value={adresseDepart.codePostal}
                  onChange={(e) =>
                    setAdresseDepart((a) => ({ ...a, codePostal: e.target.value }))
                  }
                  className={inputCls}
                  maxLength={5}
                />
              </Field>
              <div className="col-span-2">
                <Field label="Ville">
                  <input
                    type="text"
                    value={adresseDepart.ville}
                    onChange={(e) =>
                      setAdresseDepart((a) => ({ ...a, ville: e.target.value }))
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Destination */}
          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">
              Adresse de destination
            </p>
            <div className="grid grid-cols-1 gap-3 mb-3">
              <Field label="Nom de l'établissement">
                <input
                  type="text"
                  value={adresseDest.nom}
                  onChange={(e) =>
                    setAdresseDest((a) => ({ ...a, nom: e.target.value }))
                  }
                  className={inputCls}
                  placeholder="Ex : CHU de Nice, Hôpital Pasteur…"
                />
              </Field>
              <Field label="Service / Unité">
                <input
                  type="text"
                  value={adresseDest.service}
                  onChange={(e) =>
                    setAdresseDest((a) => ({ ...a, service: e.target.value }))
                  }
                  className={inputCls}
                  placeholder="Ex : Dialyse, Oncologie, Cardiologie…"
                />
              </Field>
            </div>
            {/* Autocomplétion destination */}
            <div className="mb-3">
              <AdresseAutocomplete
                label="Recherche d'adresse"
                error={errors.destRue}
                value={adresseDest}
                onChange={handleAdresseDestChange}
                placeholder="Saisir le numéro et nom de la rue…"
                id="dest-autocomplete"
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Field label="Code postal">
                <input
                  type="text"
                  value={adresseDest.codePostal}
                  onChange={(e) =>
                    setAdresseDest((a) => ({ ...a, codePostal: e.target.value }))
                  }
                  className={inputCls}
                  maxLength={5}
                />
              </Field>
              <div className="col-span-2">
                <Field label="Ville">
                  <input
                    type="text"
                    value={adresseDest.ville}
                    onChange={(e) =>
                      setAdresseDest((a) => ({ ...a, ville: e.target.value }))
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Estimation tarifaire CPAM ── */}
        {(estimationLoading || estimation) && (
          <div className="bg-white rounded-xl border border-amber-200 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-100">
              <span className="material-symbols-outlined text-amber-500 text-xl">payments</span>
              <h3 className="font-brand font-bold text-navy text-sm uppercase tracking-wide flex-1">
                Estimation tarifaire
              </h3>
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full">
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>info</span>
                Estimation
              </span>
            </div>

            {estimationLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <div style={{ width: 14, height: 14, border: "2px solid #e2e8f0", borderTop: "2px solid #f59e0b", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                Calcul du tarif CPAM en cours…
              </div>
            ) : estimation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <span className="material-symbols-outlined text-base text-slate-400">route</span>
                    Distance estimée
                    {form.allerRetour && <span className="text-xs text-slate-400">(aller-retour)</span>}
                  </span>
                  <span className="font-mono font-semibold text-slate-700">
                    {estimation.estimation?.distanceFacturee?.toFixed(1)} km
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-400 mb-1">Montant total</p>
                    <p className="text-base font-bold text-navy">{estimation.estimation?.montantTotal?.toFixed(2)} €</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-500 mb-1">Part CPAM</p>
                    <p className="text-base font-bold text-blue-700">{estimation.estimation?.montantCPAM?.toFixed(2)} €</p>
                    <p className="text-[10px] text-blue-400">{estimation.estimation?.tauxPriseEnCharge}%</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-500 mb-1">Part patient</p>
                    <p className="text-base font-bold text-green-700">{estimation.estimation?.montantPatient?.toFixed(2)} €</p>
                  </div>
                </div>
                {estimation.avertissement && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    {estimation.avertissement}
                  </p>
                )}
                {estimation.estimation?.supplements > 0 && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">nightlight</span>
                    Supplément nuit/dimanche inclus : {estimation.estimation.supplements.toFixed(2)} €
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ── Récurrence ── */}
        <Section title="Récurrence" icon="repeat">
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.recurrenceActive}
              onChange={(e) => set("recurrenceActive", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm font-medium text-slate-700">Transport récurrent</span>
          </label>

          {form.recurrenceActive && (
            <div className="space-y-4 pl-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Jours de la semaine
                </p>
                <div className="flex gap-2 flex-wrap">
                  {JOURS.map(({ num, label }) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => toggleJour(num)}
                      className={`w-10 h-10 rounded-xl text-xs font-bold transition-colors ${
                        form.recurrenceJours.includes(num)
                          ? "bg-primary text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {errors.recurrenceJours && (
                  <p className="text-xs text-red-500 mt-1">{errors.recurrenceJours}</p>
                )}
              </div>

              <Field label="Date de fin de récurrence" error={errors.recurrenceDateFin}>
                <input
                  type="date"
                  value={form.recurrenceDateFin}
                  onChange={(e) => set("recurrenceDateFin", e.target.value)}
                  className={inputCls}
                  min={form.dateTransport || new Date().toISOString().split("T")[0]}
                />
              </Field>

              {apercu.nb > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-blue-700 mb-1">
                    <span className="material-symbols-outlined text-base">event_repeat</span>
                    {apercu.nb} transport(s) seront générés
                  </div>
                  {apercu.nbExclus > 0 && (
                    <p className="text-xs text-amber-700 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      {apercu.nbExclus} jour(s) férié(s) automatiquement exclu(s)
                    </p>
                  )}
                  {apercu.nb >= 365 && (
                    <p className="text-xs text-orange-700 flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined text-sm">info</span>
                      Limité à 365 occurrences maximum par sécurité
                    </p>
                  )}
                </div>
              )}

              {form.recurrenceJours.length > 0 && form.recurrenceDateFin && apercu.nb === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">warning</span>
                  Aucune occurrence : tous les jours sélectionnés sont fériés ou hors de la plage.
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Notes ── */}
        <Section title="Notes" icon="notes">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder="Informations complémentaires, instructions particulières…"
          />
        </Section>

        {/* Boutons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-surface transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            {loading ? (
              <>
                <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                Création…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">
                  {form.recurrenceActive ? "event_repeat" : "check"}
                </span>
                {form.recurrenceActive
                  ? `Créer la série${apercu.nb > 0 ? ` (${apercu.nb} transport${apercu.nb > 1 ? "s" : ""})` : ""}`
                  : "Créer le transport"}
              </>
            )}
          </button>
        </div>
      </form>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
