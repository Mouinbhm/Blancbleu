import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import {
  WizardProvider, useWizard, STEPS,
} from "../components/transport/wizard/WizardContext";
import { StepPatient }      from "../components/transport/wizard/StepPatient";
import { StepAdresses }     from "../components/transport/wizard/StepAdresses";
import { StepTransport }    from "../components/transport/wizard/StepTransport";
import { StepPrescription } from "../components/transport/wizard/StepPrescription";
import { StepRecap }        from "../components/transport/wizard/StepRecap";
import { WizardNavigation } from "../components/transport/wizard/WizardNavigation";
import { ErrorState }       from "../components/ui";
import {
  patientService, transportService, aiService,
} from "../services/api";

/**
 * NouveauTransport — refactor wizard (Sprint 3)
 *
 * Le formulaire monolithique de 920 LoC est découpé en 5 steps gérés par
 * un WizardContext local. La récurrence et l'option "lancer IA après création"
 * sont conservées. Le BAN autocomplete et l'estimation tarifaire en direct
 * sont reportées (à réintégrer dans un sprint UX dédié).
 */

const STEP_COMPONENTS = {
  patient:      StepPatient,
  adresses:     StepAdresses,
  transport:    StepTransport,
  prescription: StepPrescription,
  recap:        StepRecap,
};

function StepRenderer() {
  const { stepIdx } = useWizard();
  const C = STEP_COMPONENTS[STEPS[stepIdx].id];
  return <C />;
}

function WizardForm({ initialForm }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  return (
    <WizardProvider initialForm={initialForm}>
      <Inner navigate={navigate} submitting={submitting} setSubmitting={setSubmitting}
             serverError={serverError} setServerError={setServerError} />
    </WizardProvider>
  );
}

function Inner({ navigate, submitting, setSubmitting, serverError, setServerError }) {
  const { form, setErrors } = useWizard();

  const handleSubmit = async () => {
    // Final validation
    const e = {};
    if (form.recurrenceActive) {
      if (form.recurrenceJours.length === 0) e.recurrenceJours = "Sélectionnez au moins un jour";
      if (!form.recurrenceDateFin) e.recurrenceDateFin = "Date de fin obligatoire";
      else if (new Date(form.recurrenceDateFin) <= new Date(form.dateTransport)) {
        e.recurrenceDateFin = "La date de fin doit être postérieure à la date du transport";
      }
    }
    if (Object.keys(e).length) { setErrors(e); return; }

    setSubmitting(true);
    setServerError(null);
    try {
      const payload = {
        ...(form.patientId && { patientId: form.patientId }),
        patient: {
          nom: form.patientNom.trim(),
          prenom: form.patientPrenom.trim(),
          telephone: form.patientTelephone.trim(),
          mobilite: form.patientMobilite,
          oxygene: form.patientOxygene,
          brancardage: form.patientBrancardage,
          accompagnateur: form.patientAccompagnateur,
        },
        typeTransport: form.typeTransport,
        motif: form.motif,
        dateTransport: form.dateTransport,
        heureRDV: form.heureRDV,
        allerRetour: form.allerRetour,
        adresseDepart: {
          rue: form.adresseDepart.rue.trim(),
          ville: form.adresseDepart.ville.trim(),
          codePostal: form.adresseDepart.codePostal.trim(),
          ...(form.adresseDepart.lat && {
            coordonnees: { lat: form.adresseDepart.lat, lng: form.adresseDepart.lng },
          }),
        },
        adresseDestination: {
          nom: form.adresseDestination.nom.trim(),
          rue: form.adresseDestination.rue.trim(),
          ville: form.adresseDestination.ville.trim(),
          codePostal: form.adresseDestination.codePostal.trim(),
          service: form.adresseDestination.service.trim(),
          ...(form.adresseDestination.lat && {
            coordonnees: { lat: form.adresseDestination.lat, lng: form.adresseDestination.lng },
          }),
        },
        notes: form.notes,
      };

      if (form.recurrenceActive) {
        await transportService.creerRecurrents({
          ...payload,
          recurrence: { joursSemaine: form.recurrenceJours, dateFin: form.recurrenceDateFin },
        });
        navigate("/transports");
      } else {
        const { data } = await transportService.create({
          ...payload,
          recurrence: { active: false, frequence: "", joursSemaine: [] },
        });
        const newId = String(data.transport?._id || data._id || "");

        // PMT upload best-effort post-création
        if (form.pmtFile && newId) {
          try {
            const fd = new FormData();
            fd.append("file", form.pmtFile);
            fd.append("triggerOcr", "true");
            await transportService.uploadPmt(newId, fd);
          } catch { /* non bloquant */ }
        }

        if (form.lancerIA && newId) {
          try { await aiService.recommanderDispatch(newId); } catch { /* non bloquant */ }
        }
        navigate(`/transports/${newId}`);
      }
    } catch (err) {
      setServerError(err.response?.data?.message || "Erreur lors de la création du transport.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {serverError}
        </div>
      )}
      <StepRenderer />
      <WizardNavigation onSubmit={handleSubmit} submitting={submitting} />
    </>
  );
}

export default function NouveauTransport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const [initialForm, setInitialForm] = useState(null);
  const [loading, setLoading] = useState(!!patientIdParam);

  useEffect(() => {
    if (!patientIdParam) { setInitialForm({}); setLoading(false); return; }
    patientService.getOne(patientIdParam)
      .then(({ data }) => {
        setInitialForm({
          patientId: data._id,
          patientNom: data.nom || "",
          patientPrenom: data.prenom || "",
          patientTelephone: data.telephone || "",
          patientMobilite: data.mobilite || "ASSIS",
          patientOxygene: data.oxygene || false,
          patientBrancardage: data.brancardage || false,
          patientAccompagnateur: data.accompagnateur || false,
        });
      })
      .catch(() => setInitialForm({}))
      .finally(() => setLoading(false));
  }, [patientIdParam]);

  if (loading || initialForm === null) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center text-slate-500">
        Chargement…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          aria-label="Retour"
        >
          ←
        </button>
        <div>
          <h1 className="font-bold text-slate-900 text-xl">Nouveau transport</h1>
          <p className="text-slate-400 text-sm">Transport sanitaire non urgent</p>
        </div>
      </div>

      <ErrorBoundary FallbackComponent={ErrorState}>
        <WizardForm initialForm={initialForm} />
      </ErrorBoundary>
    </div>
  );
}
