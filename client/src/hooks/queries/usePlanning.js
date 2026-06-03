import { useQuery } from "@tanstack/react-query";
import { planningService } from "../../services/api";

export const planningKeys = {
  all: ["planning"],
  mensuel: (annee, mois) => ["planning", "mensuel", annee, mois],
};

/**
 * Transports du mois (vue calendrier Planning).
 * planningService.mensuel calcule dateDebut/dateFin (1er → dernier jour) et
 * interroge /transports avec limit:500 — shape identique à l'appel manuel.
 */
export function usePlanningMensuel(annee, mois) {
  return useQuery({
    queryKey: planningKeys.mensuel(annee, mois),
    queryFn: () => planningService.mensuel(annee, mois).then((r) => r.data),
  });
}
