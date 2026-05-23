import { useParams } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { TransportHeader }     from "../components/transport/TransportHeader";
import { TransportInfoPanel }  from "../components/transport/TransportInfoPanel";
import { TransportTimeline }   from "../components/transport/TransportTimeline";
import { PatientCard }         from "../components/transport/PatientCard";
import { PrescriptionPanel }   from "../components/transport/PrescriptionPanel";
import { SignaturePad }        from "../components/transport/SignaturePad";
import { DispatchAIPanel }     from "../components/transport/DispatchAIPanel";
import { TransportMapPanel }   from "../components/transport/TransportMapPanel";
import { ErrorState }          from "../components/ui";

/**
 * TransportDetail — orchestrator
 *
 * Refactor Sprint 3 : la page passe de 2064 LoC à ~50 LoC. Chaque panneau
 * est un composant autonome dans `components/transport/*` qui consomme ses
 * propres queries React Query (data fetching + cache + invalidation).
 * Le Layout monte useSocketSync() qui invalide les caches en temps réel.
 *
 * NOTE Sprint 3 — Comportements pas encore migrés depuis l'ancienne page :
 *   - Boutons d'action lifecycle complets (en route, à bord, terminer, etc.)
 *     → TransportHeader expose seulement "Annuler" ; les autres transitions
 *       sont déclenchées côté chauffeur ou via API directe pour le moment.
 *   - Modal d'attente / retour base / facturation CPAM avec sélection
 *     prescription → à reporter dans un sprint ultérieur si besoin.
 *   - Export PDF mission → à porter sur un bouton dans le header.
 *
 * Ces flux sont fonctionnellement présents côté backend (endpoints inchangés)
 * mais leur UI dispatcher n'est plus exposée sur cette page. À tracer dans
 * SPRINT-3-NOTES.md pour traitement futur.
 */
export default function TransportDetail() {
  const { id } = useParams();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <ErrorBoundary FallbackComponent={ErrorState}>
        <TransportHeader transportId={id} />

        <div className="grid grid-cols-12 gap-6 mt-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <TransportInfoPanel  transportId={id} />
            <TransportMapPanel   transportId={id} />
            <DispatchAIPanel     transportId={id} />
            <PrescriptionPanel   transportId={id} />
            <SignaturePad        transportId={id} />
          </div>
          <aside className="col-span-12 lg:col-span-4 space-y-6">
            <PatientCard         transportId={id} />
            <TransportTimeline   transportId={id} />
          </aside>
        </div>
      </ErrorBoundary>
    </div>
  );
}
