import { useState, useEffect, useCallback } from "react";
import { factureService } from "../../../services/api";
import useSocket from "../../../hooks/useSocket";

/**
 * Chargement de la liste des factures + stats + maj temps réel (socket).
 *
 * Comportement identique au monolithe :
 *  - charge factures (limit 100, filtre statut) + stats à chaque changement de
 *    filterStatut, avec garde `cancelled` ;
 *  - s'abonne à `facture:updated` pour patcher une facture payée en ligne ;
 *  - expose reloadFactures() pour rafraîchir après mutation.
 *
 * @param {string} filterStatut - statut sélectionné ("" = tous)
 * @param {(msg:string,type?:string)=>void} addToast
 */
export function useFactures(filterStatut, addToast) {
  const [factures, setFactures] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useSocket();

  const reloadFactures = useCallback(() => {
    const params = { limit: 100 };
    if (filterStatut) params.statut = filterStatut;
    Promise.all([factureService.getAll(params), factureService.getStats()])
      .then(([f, s]) => {
        setFactures(f.data.factures || []);
        setStats(s.data);
      })
      .catch(() => {});
  }, [filterStatut]);

  // Socket : facture payée en ligne par le patient
  useEffect(() => {
    const unsub = subscribe("facture:updated", (data) => {
      setFactures((prev) =>
        prev.map((f) =>
          f._id === data._id
            ? {
                ...f,
                statut: data.statut,
                datePaiement: data.datePaiement,
                modePaiement: data.modePaiement,
                referenceExterne: data.referenceExterne,
              }
            : f,
        ),
      );
      addToast(`Facture ${data.numero} payée en ligne par le patient`);
    });
    return unsub;
  }, [subscribe, addToast]);

  // Chargement initial + à chaque changement de filtre
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 100 };
    if (filterStatut) params.statut = filterStatut;

    Promise.all([factureService.getAll(params), factureService.getStats()])
      .then(([f, s]) => {
        if (cancelled) return;
        setFactures(f.data.factures || []);
        setStats(s.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filterStatut]);

  return { factures, setFactures, stats, loading, reloadFactures };
}
