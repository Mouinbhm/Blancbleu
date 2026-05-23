import { useEffect, useState } from "react";
import { useTransport } from "../../hooks/queries/useTransports";
import { getSocket } from "../../services/socketClient";
import TransportMap from "../map/TransportMap";
import { Card, Skeleton } from "../ui";

/**
 * Wrapper React Query autour du composant Leaflet existant.
 * Écoute la position GPS du véhicule en temps réel (event tracking:gps_updated
 * de la room transport:{id}).
 */
export function TransportMapPanel({ transportId }) {
  const { data: transport, isLoading } = useTransport(transportId);
  const [vehiclePos, setVehiclePos] = useState(null);

  useEffect(() => {
    if (!transportId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit("join:transport", transportId);

    const onGps = (d) => {
      if (String(d.transportId) !== String(transportId)) return;
      setVehiclePos({ lat: d.lat, lng: d.lng });
    };
    const onPosition = (d) => {
      if (String(d.transportId) !== String(transportId)) return;
      setVehiclePos({ lat: d.lat, lng: d.lng });
    };

    socket.on("tracking:gps_updated", onGps);
    socket.on("vehicule:position",    onPosition);

    return () => {
      socket.emit("leave:transport", transportId);
      socket.off("tracking:gps_updated", onGps);
      socket.off("vehicule:position",    onPosition);
    };
  }, [transportId]);

  if (isLoading || !transport) {
    return (
      <Card>
        <Card.Header><h3 className="font-semibold text-sm uppercase tracking-wide">Carte</h3></Card.Header>
        <Card.Body>
          <Skeleton className="h-64 w-full" />
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-800">
          Carte temps réel
        </h3>
      </Card.Header>
      <Card.Body className="p-0">
        <TransportMap transport={transport} vehiclePosition={vehiclePos} />
      </Card.Body>
    </Card>
  );
}

export default TransportMapPanel;
