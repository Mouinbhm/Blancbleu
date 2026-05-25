import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket }     from "../services/socketClient";
import { transportKeys } from "./queries/useTransports";
import { vehicleKeys }   from "./queries/useVehicles";
import { analyticsKeys } from "./queries/useAnalytics";
import SOCKET_EVENTS    from "../lib/socketEvents";

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

    // Sprint M2 — Events canoniques uniquement. Anciens noms supprimés.
    socket.on(SOCKET_EVENTS.TRANSPORT_CREATED,  onTransportCreated);
    socket.on(SOCKET_EVENTS.TRANSPORT_STATUS,   onTransportStatut);
    socket.on(SOCKET_EVENTS.VEHICLE_POSITION,   onVehiculePosition);
    socket.on(SOCKET_EVENTS.VEHICLE_STATUS,     onVehiculeStatut);
    socket.on("vehicule:statut",                onVehiculeStatut); // legacy compat (emit non encore migré)
    socket.on("vehicule:assigne",               onVehiculeStatut); // legacy compat
    socket.on(SOCKET_EVENTS.STATS_UPDATE,       onStatsUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.TRANSPORT_CREATED,  onTransportCreated);
      socket.off(SOCKET_EVENTS.TRANSPORT_STATUS,   onTransportStatut);
      socket.off(SOCKET_EVENTS.VEHICLE_POSITION,   onVehiculePosition);
      socket.off(SOCKET_EVENTS.VEHICLE_STATUS,     onVehiculeStatut);
      socket.off("vehicule:statut",                onVehiculeStatut);
      socket.off("vehicule:assigne",               onVehiculeStatut);
      socket.off(SOCKET_EVENTS.STATS_UPDATE,       onStatsUpdate);
    };
  }, [qc]);
}
