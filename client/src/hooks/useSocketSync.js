import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket }     from "../services/socketClient";
import { transportKeys } from "./queries/useTransports";
import { vehicleKeys }   from "./queries/useVehicles";
import { analyticsKeys } from "./queries/useAnalytics";

/**
 * Branche les événements Socket.IO sur l'invalidation React Query.
 * À monter UNE SEULE FOIS dans le Layout authentifié.
 *
 * Plutôt que de pousser des données dans tous les composants, on invalide les
 * queries concernées : React Query refetch automatiquement les queries actives.
 */
export function useSocketSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onTransportCreated = () => {
      qc.invalidateQueries({ queryKey: transportKeys.all });
      qc.invalidateQueries({ queryKey: analyticsKeys.all });
    };

    const onTransportStatut = (payload) => {
      const transportId = payload?.transportId || payload?.transport?._id;
      if (transportId) {
        qc.invalidateQueries({ queryKey: transportKeys.detail(transportId) });
        qc.invalidateQueries({ queryKey: transportKeys.timeline(transportId) });
      }
      qc.invalidateQueries({ queryKey: transportKeys.all });
      qc.invalidateQueries({ queryKey: analyticsKeys.all });
    };

    const onVehiculePosition = (payload) => {
      const vehicleId = payload?.vehicleId || payload?.vehiculeId || payload?._id;
      if (vehicleId) {
        qc.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
      }
    };

    const onVehiculeStatut = (payload) => {
      const vehicleId = payload?.vehicleId || payload?.vehiculeId || payload?._id;
      if (vehicleId) qc.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
      qc.invalidateQueries({ queryKey: vehicleKeys.all });
    };

    const onStatsUpdate = () => {
      qc.invalidateQueries({ queryKey: analyticsKeys.all });
    };

    socket.on("transport:created",       onTransportCreated);
    socket.on("transport:statut",        onTransportStatut);
    socket.on("transport:statut_change", onTransportStatut);
    socket.on("vehicule:position",       onVehiculePosition);
    socket.on("vehicule:statut",         onVehiculeStatut);
    socket.on("vehicule:assigne",        onVehiculeStatut);
    socket.on("stats:update",            onStatsUpdate);

    return () => {
      socket.off("transport:created",       onTransportCreated);
      socket.off("transport:statut",        onTransportStatut);
      socket.off("transport:statut_change", onTransportStatut);
      socket.off("vehicule:position",       onVehiculePosition);
      socket.off("vehicule:statut",         onVehiculeStatut);
      socket.off("vehicule:assigne",        onVehiculeStatut);
      socket.off("stats:update",            onStatsUpdate);
    };
  }, [qc]);
}
