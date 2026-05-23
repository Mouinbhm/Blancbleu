/**
 * BlancBleu — API client (façade)
 *
 * Re-exporte l'instance axios + tous les services par domaine.
 * Permet aux composants de continuer à importer depuis `services/api`
 * sans modification (les modules par domaine sont rétrocompatibles).
 */

import api from "./client";
import { vehicleService }   from "./vehicle";
import { transportService } from "./transport";
import { aiService }        from "./ai";

// Instance axios + intercepteurs (re-export default + named)
export { default } from "./client";
export { default as api } from "./client";

// Services par domaine
export * from "./auth";
export * from "./transport";
export * from "./vehicle";
export * from "./patient";
export * from "./prescription";
export * from "./facture";
export * from "./ai";
export * from "./geo";
export * from "./analytics";
export * from "./planning";
export * from "./personnel";
export * from "./notification";

// ─── Aliases rétrocompatibilité (anciens imports directs) ───────────────────
export const unitService            = vehicleService;
export const interventionService    = transportService;
export const getInterventions       = (params) => transportService.getAll(params);
export const createIntervention     = (data)   => transportService.create(data);
export const getUnits               = (params) => vehicleService.getAll(params);
export const analyzeIncident        = (data)   => aiService.analyze?.(data);

// (silence unused-import warning : `api` is exported via `export { default as api }`)
void api;
