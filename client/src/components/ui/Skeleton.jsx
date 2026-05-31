import { cn } from "../../lib/cn";

/**
 * Brique de base : div pulsante grise. Toutes les autres skeletons
 * spécifiques (TransportCard, VehicleCard, FactureRow, PatientRow…) en sont
 * composées. Sprint M6 — remplace les <Spinner /> pour donner à l'utilisateur
 * une perception de la mise en page avant le chargement effectif.
 */
export function Skeleton({ className, ...rest }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-slate-200", className)}
      {...rest}
    />
  );
}

/**
 * Skeleton d'une carte transport (Dashboard "transports actifs",
 * page Transports). Imite le layout réel : badge statut + ligne titre +
 * 2 lignes secondaires + footer.
 */
export function TransportCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-1" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

/**
 * Skeleton d'une carte véhicule (Dashboard liste véhicules, page Flotte).
 * Imite icône carrée + nom + statut.
 */
export function VehicleCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-3.5 w-24 mb-1.5" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>
  );
}

/**
 * Skeleton d'une ligne dans la table Factures (numero, patient, montants,
 * statuts, actions). Largeurs calibrées pour ne pas faire sauter la mise
 * en page au moment du remplacement par les vraies cellules.
 */
export function FactureRowSkeleton() {
  return (
    <tr className="border-b border-slate-100">
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-20 rounded-full" />
      </td>
      <td className="px-4 py-3 text-right">
        <Skeleton className="h-7 w-16 ml-auto rounded-md" />
      </td>
    </tr>
  );
}

/**
 * Skeleton d'une ligne patient (Liste des patients). Avatar circulaire +
 * nom + n° patient + ville + chip.
 */
export function PatientRowSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/5" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

/**
 * Helpers — listes prêtes à l'emploi.
 * <SkeletonList count={5} of={TransportCardSkeleton} />
 */
export function SkeletonList({ count = 5, of: Component, gap = "space-y-2" }) {
  return (
    <div className={gap}>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
}
