/**
 * Calculs comptables purs (testables) — totaux du récapitulatif annuel.
 *
 * Reproduisent à l'identique les reduce du monolithe Factures.jsx :
 *   - total CA       = Σ r.ca
 *   - total charges  = Σ r.charges
 *   - total résultat = Σ r.resultat
 *
 * Tolérants aux entrées partielles (champ manquant → 0) et à recap null/[].
 */

/** Somme d'un champ numérique sur les lignes du récap (NaN/undefined → 0). */
export function sumField(recap, field) {
  if (!Array.isArray(recap)) return 0;
  return recap.reduce((s, r) => s + (Number(r?.[field]) || 0), 0);
}

export const totalCA = (recap) => sumField(recap, "ca");
export const totalCharges = (recap) => sumField(recap, "charges");
export const totalResultat = (recap) => sumField(recap, "resultat");

/**
 * Totaux agrégés du récap annuel.
 * @returns {{ca:number, charges:number, resultat:number}}
 */
export function recapTotals(recap) {
  return {
    ca: totalCA(recap),
    charges: totalCharges(recap),
    resultat: totalResultat(recap),
  };
}
