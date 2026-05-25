import { useEffect, useState } from "react";
import { useTransport } from "../../hooks/queries/useTransports";
import { getSocket } from "../../services/socketClient";
import TransportMap from "../map/TransportMap";
import { Card, Skeleton } from "../ui";

/**
 * Wrapper React Query autour du composant Leaflet existant.
 * Sprint M2 — Écoute les events canoniques transport:gps (room transport:{id})
 * et vehicle:position (staff). Voir docs/socket-events.md.
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

    // Sprint M2 — events canoniques (remplacent tracking:gps_updated + vehicule:position)
    socket.on("transport:gps",     onGps);
    socket.on("vehicle:position",  onPosition);

    return () => {
      socket.emit("leave:transport", transportId);
      socket.off("transport:gps",     onGps);
      socket.off("vehicle:position",  onPosition);
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
