import { createContext, useContext, useMemo, useState, useCallback } from "react";

const WizardCtx = createContext(null);

const INITIAL_FORM = {
  // Lien patient (si sélectionné depuis la fiche)
  patientId: null,
  // Patient
  patientNom: "",
  patientPrenom: "",
  patientTelephone: "",
  patientMobilite: "ASSIS",
  patientOxygene: false,
  patientBrancardage: false,
  patientAccompagnateur: false,
  // Adresses
  adresseDepart:      { rue: "", ville: "", codePostal: "", lat: null, lng: null },
  adresseDestination: { nom: "", rue: "", ville: "", codePostal: "", service: "", lat: null, lng: null },
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
  // Prescription (optionnelle)
  pmtFile: null,
  // Notes
  notes: "",
  lancerIA: false,
};

export const STEPS = [
  { id: "patient",      label: "Patient" },
  { id: "adresses",     label: "Adresses" },
  { id: "transport",    label: "Transport" },
  { id: "prescription", label: "Prescription" },
  { id: "recap",        label: "Récapitulatif" },
];

export function WizardProvider({ children, initialForm }) {
  const [form, setForm] = useState({ ...INITIAL_FORM, ...(initialForm || {}) });
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState({});

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  }, []);

  const setNested = useCallback((parent, key, value) => {
    setForm((f) => ({ ...f, [parent]: { ...f[parent], [key]: value } }));
  }, []);

  const validateStep = useCallback(() => {
    const e = {};
    const step = STEPS[stepIdx].id;
    if (step === "patient") {
      if (!form.patientNom.trim()) e.patientNom = "Nom obligatoire";
    }
    if (step === "adresses") {
      if (!form.adresseDepart.rue.trim()) e.adresseDepartRue = "Adresse de départ obligatoire";
      if (!form.adresseDestination.rue.trim() && !form.adresseDestination.nom.trim()) {
        e.adresseDestinationRue = "Adresse destination obligatoire";
      }
    }
    if (step === "transport") {
      if (!form.dateTransport) e.dateTransport = "Date obligatoire";
      if (!form.heureRDV)      e.heureRDV = "Heure obligatoire";
      // Cohérence mobilité ↔ type
      const m = form.patientMobilite;
      const t = form.typeTransport;
      if (m === "ASSIS" && t === "AMBULANCE") {
        e.typeTransport = "Patient ASSIS → VSL ou TPMR";
      } else if (m === "FAUTEUIL_ROULANT" && t === "AMBULANCE") {
        e.typeTransport = "Fauteuil roulant → TPMR requis";
      } else if (["ALLONGE", "CIVIERE"].includes(m) && t !== "AMBULANCE") {
        e.typeTransport = "Patient allongé/civière → AMBULANCE requise";
      }
    }
    return e;
  }, [form, stepIdx]);

  const goNext = useCallback(() => {
    const e = validateStep();
    setErrors(e);
    if (Object.keys(e).length === 0 && stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    }
  }, [validateStep, stepIdx]);

  const goPrev = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  const value = useMemo(
    () => ({ form, set, setNested, stepIdx, setStepIdx, goNext, goPrev, errors, setErrors, STEPS }),
    [form, set, setNested, stepIdx, goNext, goPrev, errors],
  );

  return <WizardCtx.Provider value={value}>{children}</WizardCtx.Provider>;
}

export function useWizard() {
  const ctx = useContext(WizardCtx);
  if (!ctx) throw new Error("useWizard must be used inside <WizardProvider>");
  return ctx;
}
