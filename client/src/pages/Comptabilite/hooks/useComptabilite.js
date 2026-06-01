import { useState, useEffect } from "react";
import api from "../../../services/api";

/**
 * Chargement du dashboard comptabilité pour une période (mois/année).
 * Comportement identique au monolithe : GET /comptabilite/dashboard avec
 * garde `cancelled`, compta=null en cas d'erreur.
 */
export function useComptabilite(annee, mois) {
  const [compta, setCompta] = useState(null);
  const [comptaLoading, setComptaLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setComptaLoading(true);
    api
      .get("/comptabilite/dashboard", { params: { annee, mois } })
      .then(({ data }) => {
        if (!cancelled) setCompta(data);
      })
      .catch(() => {
        if (!cancelled) setCompta(null);
      })
      .finally(() => {
        if (!cancelled) setComptaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [annee, mois]);

  return { compta, setCompta, comptaLoading };
}
