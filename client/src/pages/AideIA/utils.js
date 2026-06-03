/**
 * BlancBleu — Page Aide IA : helpers purs + constantes métier partagées.
 *
 * Aucune dépendance React — données et fonctions pures réutilisées par les
 * quatre modules (Dispatch / PMT / Routing / Duration).
 */

// ── Constantes métier ─────────────────────────────────────────────────────────
export const MOTIFS = [
  "Dialyse",
  "Chimiothérapie",
  "Radiothérapie",
  "Consultation",
  "Hospitalisation",
  "Sortie hospitalisation",
  "Rééducation",
  "Analyse",
  "Autre",
];

export const MOBILITES = [
  { v: "ASSIS", label: "Assis", icon: "accessible_forward", color: "emerald", desc: "VSL" },
  {
    v: "FAUTEUIL_ROULANT",
    label: "Fauteuil roulant",
    icon: "wheelchair_pickup",
    color: "blue",
    desc: "TPMR",
  },
  { v: "ALLONGE", label: "Allongé", icon: "airline_seat_flat", color: "orange", desc: "Ambulance" },
  { v: "CIVIERE", label: "Civière", icon: "emergency", color: "red", desc: "Ambulance" },
];

export const TYPES_VEHICULE = {
  VSL: { label: "VSL", color: "emerald", icon: "directions_car" },
  TPMR: { label: "TPMR", color: "blue", icon: "accessible" },
  AMBULANCE: { label: "Ambulance", color: "red", icon: "local_shipping" },
};

// ── Normalisation motif (accents → clés dataset Python) ──────────────────────
const MOTIF_MAP = {
  Chimiothérapie: "Chimiotherapie",
  Radiothérapie: "Consultation",
  Rééducation: "Consultation",
  "Sortie hospitalisation": "Hospitalisation",
  Analyse: "Consultation",
  Autre: "Consultation",
};

export function normalizeMotif(motif) {
  return MOTIF_MAP[motif] || motif || "Consultation";
}

export function fmtApiError(err, fallback) {
  const d = err.response?.data;
  if (!d) return err.message || fallback;
  if (typeof d.message === "string") return d.message;
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) return d.detail.map((e) => e.msg ?? JSON.stringify(e)).join(" · ");
  return fallback;
}

export function motifToEtab(motif) {
  const MAP = {
    Dialyse: "centre_dialyse",
    Chimiotherapie: "hopital_public",
    Hospitalisation: "hopital_public",
    Consultation: "clinique_privee",
  };
  return MAP[motif] || "hopital_public";
}

export function buildDurationInput(transport) {
  if (!transport) return null;
  const heureRDV = transport.heureRDV || "09:00";
  const heure = Math.max(6, Math.min(20, parseInt(heureRDV.split(":")[0]) || 8));
  const dateT = transport.dateTransport ? new Date(transport.dateTransport) : new Date();
  // JS getDay() : 0=dim → on convertit en lundi=0
  const jourJS = dateT.getDay();
  const jour = jourJS === 0 ? 6 : jourJS - 1;

  return {
    distance_km: 12.0, // estimation par défaut (géocodage non dispo ici)
    heure_depart: heure,
    jour_semaine: jour,
    mobilite: transport.patient?.mobilite || "ASSIS",
    type_vehicule: transport.typeTransport || "VSL",
    type_etablissement: "hopital_public",
    motif: normalizeMotif(transport.motif),
    aller_retour: transport.allerRetour || false,
    nb_patients: 1,
    experience_chauffeur: 0.5,
  };
}
