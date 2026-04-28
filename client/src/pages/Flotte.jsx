// Fichier : client/src/pages/Flotte.jsx
import { useState, useEffect, useCallback } from "react";
import VehicleCard from "../components/vehicle/VehicleCard";
import VehicleDetailPanel from "../components/vehicle/VehicleDetailPanel";
import { vehicleService } from "../services/api";
import useSocket from "../hooks/useSocket";

// ── Styles partagés dans le modal ─────────────────────────────────────────────
const inputCls =
  "border border-slate-200 rounded-lg px-3 py-2.5 w-full text-sm outline-none focus:border-primary transition-colors bg-white";

function Field({ label, error, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function Counter({ value, onChange, min = 0, max = 10 }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      <button type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold text-lg"
      >−</button>
      <span className="w-8 text-center font-mono font-bold text-navy">{value}</span>
      <button type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold text-lg"
      >+</button>
    </div>
  );
}

// ── Onglets ───────────────────────────────────────────────────────────────────
const TABS = [
  { icon: "🚐", label: "Identification" },
  { icon: "⛽", label: "Motorisation"   },
  { icon: "📊", label: "Kilométrage"    },
  { icon: "🏥", label: "Équipements"    },
  { icon: "📍", label: "Localisation"   },
];

const ENERGIES = [
  { v: "Diesel",     emoji: "🛢️", label: "Diesel"     },
  { v: "Essence",    emoji: "⛽", label: "Essence"    },
  { v: "Hybride",    emoji: "🔋", label: "Hybride"    },
  { v: "Electrique", emoji: "⚡", label: "Électrique" },
  { v: "GPL",        emoji: "🌿", label: "GPL"        },
  { v: "Hydrogène",  emoji: "💧", label: "Hydrogène"  },
];

const EQUIPEMENTS_LIST = [
  { key: "oxygene",       emoji: "🫁", label: "Oxygène"    },
  { key: "fauteuilRampe", emoji: "♿", label: "Fauteuil/rampe" },
  { key: "brancard",      emoji: "🛏️", label: "Brancard"   },
  { key: "dae",           emoji: "💓", label: "DAE"        },
  { key: "aspirateur",    emoji: "🌀", label: "Aspirateur" },
  { key: "climatisation", emoji: "❄️", label: "Climatisation" },
];

function Tab1({ form, set, errors }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Immatriculation *" error={errors.immatriculation}>
          <input type="text"
            value={form.immatriculation}
            onChange={(e) => set("immatriculation", e.target.value.toUpperCase())}
            className={`${inputCls}${errors.immatriculation ? " border-red-300" : ""}`}
            placeholder="AA-000-AA"
          />
        </Field>
        <Field label="Type *" error={errors.type}>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputCls}>
            <option value="VSL">VSL</option>
            <option value="AMBULANCE">Ambulance</option>
            <option value="TPMR">TPMR</option>
          </select>
        </Field>
      </div>
      <Field label="Nom / Désignation *" error={errors.nom}>
        <input type="text"
          value={form.nom}
          onChange={(e) => set("nom", e.target.value)}
          className={`${inputCls}${errors.nom ? " border-red-300" : ""}`}
          placeholder="Ex : VSL Nice 01"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Marque">
          <input type="text" value={form.marque} onChange={(e) => set("marque", e.target.value)} className={inputCls} placeholder="Citroën" />
        </Field>
        <Field label="Modèle">
          <input type="text" value={form.modele} onChange={(e) => set("modele", e.target.value)} className={inputCls} placeholder="Jumpy" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Année">
          <input type="number" value={form.annee} min={2000} max={2030}
            onChange={(e) => set("annee", parseInt(e.target.value) || new Date().getFullYear())}
            className={inputCls}
          />
        </Field>
        <Field label="Couleur">
          <input type="text" value={form.couleur} onChange={(e) => set("couleur", e.target.value)} className={inputCls} placeholder="Blanc" />
        </Field>
      </div>
      <Field label="Numéro de série (VIN)">
        <input type="text"
          value={form.numeroSerie}
          onChange={(e) => set("numeroSerie", e.target.value.toUpperCase())}
          className={inputCls}
          placeholder="VF7XXXXXXXXXXXXX"
        />
      </Field>
    </div>
  );
}

function Tab2({ form, set }) {
  const showAutonomie = ["Electrique", "Hybride"].includes(form.typeEnergie);
  return (
    <div className="space-y-5">
      <SectionTitle>Type d'énergie</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {ENERGIES.map((e) => (
          <button key={e.v} type="button"
            onClick={() => set("typeEnergie", e.v)}
            className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all flex flex-col items-center gap-1.5 ${
              form.typeEnergie === e.v
                ? "border-primary bg-blue-50 text-primary"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <span className="text-xl">{e.emoji}</span>
            {e.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Consommation (L/100 km)">
          <input type="number" step="0.1" min="0" max="30"
            value={form.consommationL100}
            onChange={(e) => set("consommationL100", e.target.value === "" ? "" : parseFloat(e.target.value))}
            className={inputCls}
            placeholder="7.5"
          />
        </Field>
        <Field label="Puissance (CV)">
          <input type="number" min="0"
            value={form.puissanceCv}
            onChange={(e) => set("puissanceCv", e.target.value === "" ? "" : parseInt(e.target.value))}
            className={inputCls}
            placeholder="120"
          />
        </Field>
      </div>
      {showAutonomie && (
        <Field label="Autonomie (km)">
          <input type="number" min="0"
            value={form.autonomieKm}
            onChange={(e) => set("autonomieKm", e.target.value === "" ? "" : parseInt(e.target.value))}
            className={inputCls}
            placeholder="450"
          />
        </Field>
      )}
    </div>
  );
}

function Tab3({ form, setNested }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Kilométrage actuel (km)">
          <input type="number" min="0"
            value={form.kilometrage.actuel}
            onChange={(e) => setNested("kilometrage", "actuel", parseInt(e.target.value) || 0)}
            className={inputCls}
          />
        </Field>
        <Field label="Dernier entretien (km)">
          <input type="number" min="0"
            value={form.kilometrage.dernierControle}
            onChange={(e) => setNested("kilometrage", "dernierControle", parseInt(e.target.value) || 0)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prochain vidange (km)">
          <input type="number" min="0"
            value={form.kilometrage.prochainVidange}
            onChange={(e) => setNested("kilometrage", "prochainVidange", e.target.value === "" ? "" : parseInt(e.target.value))}
            className={inputCls}
            placeholder="48 000"
          />
        </Field>
        <Field label="Prochain CT (km)">
          <input type="number" min="0"
            value={form.kilometrage.prochainControle}
            onChange={(e) => setNested("kilometrage", "prochainControle", e.target.value === "" ? "" : parseInt(e.target.value))}
            className={inputCls}
            placeholder="50 000"
          />
        </Field>
      </div>

      <Divider label="Contrôle technique" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date d'expiration">
          <input type="date"
            value={form.controleTechnique.dateExpiration}
            onChange={(e) => setNested("controleTechnique", "dateExpiration", e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="flex items-center" style={{ paddingTop: 26 }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={form.controleTechnique.rappel30j}
              onChange={(e) => setNested("controleTechnique", "rappel30j", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-slate-700">Rappel 30 jours avant</span>
          </label>
        </div>
      </div>

      <Divider label="Assurance" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Compagnie">
          <input type="text"
            value={form.assurance.compagnie}
            onChange={(e) => setNested("assurance", "compagnie", e.target.value)}
            className={inputCls}
            placeholder="AXA"
          />
        </Field>
        <Field label="N° Police">
          <input type="text"
            value={form.assurance.numeroPolice}
            onChange={(e) => setNested("assurance", "numeroPolice", e.target.value)}
            className={inputCls}
            placeholder="12345678"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date d'expiration">
          <input type="date"
            value={form.assurance.dateExpiration}
            onChange={(e) => setNested("assurance", "dateExpiration", e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="flex items-center" style={{ paddingTop: 26 }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={form.assurance.rappel30j}
              onChange={(e) => setNested("assurance", "rappel30j", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-slate-700">Rappel 30 jours avant</span>
          </label>
        </div>
      </div>

      <Divider label="Vignette Crit'Air" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Catégorie">
          <select
            value={form.vignetteControlePollution.categorie}
            onChange={(e) => setNested("vignetteControlePollution", "categorie", e.target.value)}
            className={inputCls}
          >
            <option value="">Sélectionner...</option>
            {["Crit'Air 1", "Crit'Air 2", "Crit'Air 3", "Non classé"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date d'expiration">
          <input type="date"
            value={form.vignetteControlePollution.dateExpiration}
            onChange={(e) => setNested("vignetteControlePollution", "dateExpiration", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
    </div>
  );
}

function Tab4({ form, setNested }) {
  return (
    <div className="space-y-5">
      <SectionTitle>Équipements médicaux</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {EQUIPEMENTS_LIST.map((eq) => (
          <button key={eq.key} type="button"
            onClick={() => setNested("equipements", eq.key, !form.equipements[eq.key])}
            className={`py-4 rounded-xl border-2 text-sm font-semibold transition-all flex flex-col items-center gap-2 ${
              form.equipements[eq.key]
                ? "border-primary bg-blue-50 text-primary"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <span className="text-2xl">{eq.emoji}</span>
            {eq.label}
          </button>
        ))}
      </div>

      <Divider label="Capacité" />
      <div className="grid grid-cols-3 gap-4">
        {[
          { key: "placesAssises",  label: "Places assises", min: 1, max: 6 },
          { key: "placesFauteuil", label: "Fauteuils",      min: 0, max: 2 },
          { key: "placesBrancard", label: "Brancards",      min: 0, max: 1 },
        ].map(({ key, label, min, max }) => (
          <div key={key} className="text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
            <Counter
              value={form.capacite[key]}
              min={min}
              max={max}
              onChange={(v) => setNested("capacite", key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Tab5({ form, set, setNested, onUseGaragePos }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Position actuelle du véhicule</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Latitude">
          <input type="number" step="0.0001"
            value={form.position.lat}
            onChange={(e) => setNested("position", "lat", e.target.value === "" ? "" : parseFloat(e.target.value))}
            className={inputCls}
            placeholder="43.7102"
          />
        </Field>
        <Field label="Longitude">
          <input type="number" step="0.0001"
            value={form.position.lng}
            onChange={(e) => setNested("position", "lng", e.target.value === "" ? "" : parseFloat(e.target.value))}
            className={inputCls}
            placeholder="7.2620"
          />
        </Field>
      </div>
      <button type="button" onClick={onUseGaragePos}
        className="flex items-center gap-2 text-xs text-primary font-semibold hover:underline"
      >
        <span className="material-symbols-outlined text-sm">location_on</span>
        Utiliser la position du garage (43.7102, 7.2620)
      </button>

      <Divider label="Garage d'attache" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom du garage">
          <input type="text"
            value={form.garage.nom}
            onChange={(e) => setNested("garage", "nom", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Adresse">
          <input type="text"
            value={form.garage.adresse}
            onChange={(e) => setNested("garage", "adresse", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Divider label="Statut initial" />
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: "disponible",   label: "Disponible",   cls: "border-green-300 bg-green-50 text-green-700"   },
          { v: "maintenance",  label: "Maintenance",  cls: "border-yellow-300 bg-yellow-50 text-yellow-700" },
          { v: "hors_service", label: "Hors service", cls: "border-red-300 bg-red-50 text-red-700"         },
        ].map((s) => (
          <label key={s.v}
            className={`py-3 rounded-xl border-2 text-sm font-semibold text-center cursor-pointer transition-all ${
              form.statut === s.v ? s.cls : "border-slate-200 text-slate-400 hover:border-slate-300"
            }`}
          >
            <input type="radio" name="statut" value={s.v}
              checked={form.statut === s.v}
              onChange={() => set("statut", s.v)}
              className="sr-only"
            />
            {s.label}
          </label>
        ))}
      </div>

      <Divider label="Notes internes" />
      <textarea
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
        maxLength={500}
        rows={4}
        className={`${inputCls} resize-none`}
        placeholder="Observations, remarques..."
      />
      <p className="text-xs text-slate-400 text-right font-mono">{form.notes.length}/500</p>
    </div>
  );
}

// ── Modal Nouveau Véhicule — 5 onglets ────────────────────────────────────────
function ModalNouveauVehicule({ onClose, onCreated }) {
  const [activeTab, setActiveTab] = useState(0);
  const [visited, setVisited] = useState(new Set([0]));
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    // Onglet 1
    immatriculation: "",
    nom:             "",
    type:            "VSL",
    marque:          "",
    modele:          "",
    annee:           new Date().getFullYear(),
    couleur:         "",
    numeroSerie:     "",
    // Onglet 2
    typeEnergie:      "Diesel",
    consommationL100: "",
    autonomieKm:      "",
    puissanceCv:      "",
    // Onglet 3
    kilometrage: { actuel: 0, dernierControle: 0, prochainVidange: "", prochainControle: "" },
    controleTechnique: { dateExpiration: "", rappel30j: true },
    assurance: { compagnie: "", numeroPolice: "", dateExpiration: "", rappel30j: true },
    vignetteControlePollution: { categorie: "", dateExpiration: "" },
    // Onglet 4
    equipements: { oxygene: false, fauteuilRampe: false, brancard: false, dae: false, aspirateur: false, chauffage: false, climatisation: false },
    capacite: { placesAssises: 1, placesFauteuil: 0, placesBrancard: 0 },
    // Onglet 5
    position: { lat: "", lng: "" },
    garage: { nom: "Garage principal", adresse: "59 Bd Madeleine, Nice", lat: 43.7102, lng: 7.262 },
    statut: "disponible",
    notes: "",
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setNested = (key, sub, val) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [sub]: val } }));

  const validateTab1 = () => {
    const errs = {};
    if (!form.immatriculation.trim()) errs.immatriculation = "Obligatoire";
    if (!form.nom.trim())             errs.nom = "Obligatoire";
    return errs;
  };

  const goTo = (next) => {
    if (next > activeTab && activeTab === 0) {
      const errs = validateTab1();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      setErrors({});
    }
    setVisited((v) => new Set([...v, next]));
    setActiveTab(next);
  };

  const handleSubmit = async () => {
    const errs = validateTab1();
    if (Object.keys(errs).length) { setErrors(errs); setActiveTab(0); return; }

    // Nettoyer les chaînes vides → undefined pour les champs numériques optionnels
    const payload = {
      ...form,
      consommationL100: form.consommationL100 !== "" ? form.consommationL100 : undefined,
      autonomieKm:      form.autonomieKm      !== "" ? form.autonomieKm      : undefined,
      puissanceCv:      form.puissanceCv      !== "" ? form.puissanceCv      : undefined,
      kilometrage: {
        actuel:          form.kilometrage.actuel || 0,
        dernierControle: form.kilometrage.dernierControle || 0,
        prochainVidange: form.kilometrage.prochainVidange !== "" ? form.kilometrage.prochainVidange : undefined,
        prochainControle:form.kilometrage.prochainControle !== "" ? form.kilometrage.prochainControle : undefined,
      },
      controleTechnique: {
        dateExpiration: form.controleTechnique.dateExpiration || undefined,
        rappel30j:      form.controleTechnique.rappel30j,
      },
      assurance: {
        ...form.assurance,
        dateExpiration: form.assurance.dateExpiration || undefined,
      },
      vignetteControlePollution: {
        categorie:      form.vignetteControlePollution.categorie      || undefined,
        dateExpiration: form.vignetteControlePollution.dateExpiration || undefined,
      },
      position: {
        lat:    form.position.lat !== "" ? form.position.lat : undefined,
        lng:    form.position.lng !== "" ? form.position.lng : undefined,
        adresse:"",
      },
    };

    setLoading(true);
    try {
      await vehicleService.create(payload);
      onCreated();
    } catch (err) {
      setErrors({ submit: err.response?.data?.message || "Erreur lors de la création." });
    } finally {
      setLoading(false);
    }
  };

  const useGaragePos = () =>
    setForm((f) => ({
      ...f,
      position: { ...f.position, lat: f.garage.lat, lng: f.garage.lng },
    }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 750, maxHeight: "90vh" }}
      >
        {/* ── Header fixe ───────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-brand font-bold text-navy text-base">
              Nouveau véhicule
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Barre de progression */}
          <div className="flex items-start">
            {TABS.map((t, i) => (
              <div key={i} className="flex items-center flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => (visited.has(i) || i <= activeTab) ? goTo(i) : undefined}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i === activeTab
                      ? "bg-primary border-primary text-white"
                      : visited.has(i)
                        ? "bg-blue-50 border-primary text-primary"
                        : "bg-white border-slate-200 text-slate-400"
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-[10px] font-semibold leading-none text-center whitespace-nowrap ${
                    i === activeTab ? "text-primary" : "text-slate-400"
                  }`}>
                    {t.label}
                  </span>
                </button>
                {i < TABS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < activeTab ? "bg-primary" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Contenu scrollable ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 0 && <Tab1 form={form} set={set} errors={errors} />}
          {activeTab === 1 && <Tab2 form={form} set={set} />}
          {activeTab === 2 && <Tab3 form={form} setNested={setNested} />}
          {activeTab === 3 && <Tab4 form={form} setNested={setNested} />}
          {activeTab === 4 && <Tab5 form={form} set={set} setNested={setNested} onUseGaragePos={useGaragePos} />}
          {errors.submit && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-4">
              {errors.submit}
            </p>
          )}
        </div>

        {/* ── Footer fixe ───────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={() => goTo(activeTab - 1)}
            disabled={activeTab === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Précédent
          </button>

          <span className="text-xs text-slate-400 font-mono">
            Onglet {activeTab + 1} / {TABS.length}
          </span>

          {activeTab < TABS.length - 1 ? (
            <button
              type="button"
              onClick={() => goTo(activeTab + 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Suivant
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Création…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">check</span>
                  Créer le véhicule
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const FILTRES_STATUT = [
  { value: "", label: "Tous" },
  { value: "disponible", label: "Disponibles" },
  { value: "en_mission", label: "En mission" },
  { value: "maintenance", label: "Maintenance" },
  { value: "hors_service", label: "Hors service" },
];

const FILTRES_TYPE = [
  { value: "", label: "Tous types" },
  { value: "VSL", label: "VSL" },
  { value: "AMBULANCE", label: "Ambulance" },
  { value: "TPMR", label: "TPMR" },
];

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div
      style={{
        width: 20,
        height: 20,
        border: "2px solid #e2e8f0",
        borderTop: "2px solid #1D6EF5",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
    Chargement…
  </div>
);

export default function Flotte() {
  const [vehicles,             setVehicles]             = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [filtreStatut,         setFiltreStatut]         = useState("");
  const [filtreType,           setFiltreType]           = useState("");
  const [showModal,            setShowModal]            = useState(false);
  const [vehiculeSelectionne,  setVehiculeSelectionne]  = useState(null);

  const { subscribe } = useSocket();

  const loadData = useCallback(async () => {
    try {
      const vehRes = await vehicleService.getAll();
      const payload = vehRes.data;
      const list = Array.isArray(payload)
        ? payload
        : payload?.data || payload?.vehicles || [];
      setVehicles(list);
    } catch {
      /* silencieux */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const unsub = subscribe("unit:location_updated", () => loadData());
    return unsub;
  }, [subscribe, loadData]);

  const vehiclesFiltres = vehicles.filter((v) => {
    if (filtreStatut && v.statut !== filtreStatut) return false;
    if (filtreType && v.type !== filtreType) return false;
    return true;
  });

  const disponibles = vehicles.filter((v) => v.statut === "disponible").length;
  const enMission = vehicles.filter((v) => v.statut === "en_mission").length;
  const maintenance = vehicles.filter((v) => v.statut === "maintenance").length;

  return (
    <div className="p-7 fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-navy text-xl">Flotte</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {vehicles.length} véhicule(s) enregistré(s)
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouveau véhicule
        </button>
      </div>

      {/* KPIs rapides */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: "Disponibles",
            value: disponibles,
            color: "text-green-600",
            bg: "bg-green-50",
          },
          {
            label: "En mission",
            value: enMission,
            color: "text-orange-600",
            bg: "bg-orange-50",
          },
          {
            label: "Maintenance",
            value: maintenance,
            color: "text-yellow-600",
            bg: "bg-yellow-50",
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`${k.bg} rounded-xl p-4 text-center border border-white`}
          >
            <p className={`text-2xl font-mono font-bold ${k.color}`}>
              {k.value}
            </p>
            <p className="text-xs text-slate-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-5 flex-wrap">
        {FILTRES_STATUT.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltreStatut(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              filtreStatut === f.value
                ? "bg-primary text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {FILTRES_TYPE.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltreType(f.value)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                filtreType === f.value
                  ? "bg-navy text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grille véhicules */}
      {loading ? (
        <Spinner />
      ) : vehiclesFiltres.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <span
            className="material-symbols-outlined text-slate-300"
            style={{ fontSize: 56 }}
          >
            airport_shuttle
          </span>
          <p className="text-slate-400 text-sm mt-3">
            Aucun véhicule correspondant aux filtres
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehiclesFiltres.map((v) => (
            <VehicleCard
              key={v._id}
              vehicle={v}
              onClick={() => setVehiculeSelectionne(v)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ModalNouveauVehicule
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            loadData();
          }}
        />
      )}

      {vehiculeSelectionne && (
        <VehicleDetailPanel
          vehicle={vehiculeSelectionne}
          onClose={() => setVehiculeSelectionne(null)}
          onUpdate={(updated) => {
            setVehicles((prev) =>
              prev.map((v) => v._id === updated._id ? updated : v)
            );
            setVehiculeSelectionne(updated);
          }}
        />
      )}
    </div>
  );
}
