/**
 * BlancBleu — Hook useDurationPredict
 * Appelle le microservice XGBoost pour prédire la durée d'un transport.
 * Échoue silencieusement si le service est hors ligne.
 */

import { useState, useEffect, useRef } from "react";
import { predictDuree } from "../services/optimizerService";

/**
 * @param {object|null} transportData  Données du transport (TransportInput)
 *                                     null → pas de prédiction
 * @returns {{ loading: boolean, prediction: object|null }}
 */
export default function useDurationPredict(transportData) {
  const [loading, setLoading]       = useState(false);
  const [prediction, setPrediction] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    // Annuler l'appel précédent si toujours en cours
    if (abortRef.current) abortRef.current();

    if (!transportData) {
      setLoading(false);
      setPrediction(null);
      return;
    }

    let cancelled = false;
    abortRef.current = () => { cancelled = true; };

    setLoading(true);
    setPrediction(null);

    predictDuree(transportData)
      .then((data) => {
        if (!cancelled) setPrediction(data);
      })
      .catch(() => {
        // Silence : le microservice peut être hors ligne
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Dépendances stables — primitives extraites de l'objet
    transportData?.distance_km,
    transportData?.heure_depart,
    transportData?.jour_semaine,
    transportData?.mobilite,
    transportData?.type_vehicule,
    transportData?.type_etablissement,
    transportData?.motif,
    transportData?.aller_retour,
    transportData?.nb_patients,
    transportData?.experience_chauffeur,
  ]);

  return { loading, prediction };
}
