/**
 * Mappers/derivations du domaine facture (pures, testables).
 */

/** Nom affichable du patient d'une facture (patientId direct ou via transport). */
export const patientNom = (f) => {
  if (f.patientId?.nom) return `${f.patientId.nom} ${f.patientId.prenom || ""}`.trim();
  if (f.transportId?.patient?.nom)
    return `${f.transportId.patient.nom} ${f.transportId.patient.prenom || ""}`.trim();
  return "—";
};
