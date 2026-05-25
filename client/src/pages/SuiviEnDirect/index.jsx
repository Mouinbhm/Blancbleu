import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useSocket from "../../hooks/useSocket";
import api from "../../services/api";

// Fix Leaflet default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const driverIcon = (color = "#0d9488") =>
  L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);">
      <span class="material-symbols-outlined" style="color:white;font-size:17px;">directions_car</span>
    </div>`,
  });

const STATUS_COLORS = {
  ASSIGNED:               "#6366f1",
  EN_ROUTE_TO_PICKUP:     "#0d9488",
  ARRIVED_AT_PICKUP:      "#f59e0b",
  PATIENT_ON_BOARD:       "#10b981",
  ARRIVED_AT_DESTINATION: "#3b82f6",
  COMPLETED:              "#64748b",
};

const STATUS_LABELS = {
  ASSIGNED:               "Assigné",
  EN_ROUTE_TO_PICKUP:     "En route",
  ARRIVED_AT_PICKUP:      "Arrivé patient",
  PATIENT_ON_BOARD:       "Patient à bord",
  ARRIVED_AT_DESTINATION: "À destination",
  COMPLETED:              "Terminé",
};

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [positions.length]);
  return null;
}

export default function SuiviEnDirect() {
  const [drivers, setDrivers]         = useState({});
  const [selected, setSelected]       = useState(null);
  const [history, setHistory]         = useState([]);
  const [loadingHistory, setLoadingH] = useState(false);
  const { subscribe, connected }      = useSocket();
  const markersRef                    = useRef({});

  // Chargement initial des positions live
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/v1/tracking/live");
        const map = {};
        (data.drivers || []).forEach((d) => {
          map[d.driverId] = {
            ...d,
            driverName: d.driverNom || d.driverName,
          };
        });
        setDrivers(map);
      } catch { /* silencieux */ }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  // Écoute Socket.IO : vehicle:position (Sprint M2 — unifié EN)
  useEffect(() => {
    const unsub = subscribe("vehicle:position", (data) => {
      setDrivers((prev) => ({
        ...prev,
        [data.driverId]: {
          ...prev[data.driverId],
          ...data,
          driverName: data.driverNom || data.driverName || prev[data.driverId]?.driverName,
        },
      }));
    });
    return unsub;
  }, [subscribe]);

  // Écoute Socket.IO : driver:status
  useEffect(() => {
    const unsub = subscribe("driver:status", (data) => {
      setDrivers((prev) => {
        if (!prev[data.driverId]) return prev;
        return { ...prev, [data.driverId]: { ...prev[data.driverId], status: data.status } };
      });
    });
    return unsub;
  }, [subscribe]);

  const handleSelectDriver = async (driverId) => {
    setSelected(driverId);
    setLoadingH(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await api.get(`/v1/tracking/history/${driverId}`, { params: { date: today } });
      setHistory((data.points || []).map((p) => [p.lat, p.lng]));
    } catch {
      setHistory([]);
    } finally {
      setLoadingH(false);
    }
  };

  const driverList = Object.values(drivers);
  const mapPositions = driverList.filter((d) => d.lat && d.lng).map((d) => [d.lat, d.lng]);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ── Panneau latéral ─────────────────────────────────────── */}
      <aside className="w-72 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-brand font-bold text-navy text-sm">Chauffeurs actifs</h2>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse" : "bg-slate-300"}`} />
            <span className="text-xs text-slate-400 font-mono">{connected ? "LIVE" : "OFFLINE"}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {driverList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-xs gap-2">
              <span className="material-symbols-outlined text-3xl">directions_car</span>
              Aucun chauffeur actif
            </div>
          ) : (
            driverList.map((d) => {
              const color = STATUS_COLORS[d.status] || "#64748b";
              const isSelected = selected === d.driverId;
              return (
                <div
                  key={d.driverId}
                  onClick={() => handleSelectDriver(d.driverId)}
                  className={`px-4 py-3 cursor-pointer transition-colors ${isSelected ? "bg-teal-50" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: color }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: "15px" }}>person</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-navy truncate">
                        {d.driverName || d.driverNom || d.driverId}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color }}>
                        {STATUS_LABELS[d.status] || d.status}
                      </p>
                    </div>
                    {d.speed != null && (
                      <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                        {Math.round(d.speed)} km/h
                      </span>
                    )}
                  </div>
                  {d.transportRef && (
                    <p className="text-xs text-slate-400 mt-1 pl-11">
                      {d.transportRef}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {selected && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            {loadingHistory ? (
              <span className="animate-pulse">Chargement historique…</span>
            ) : (
              <span>{history.length} points GPS aujourd'hui</span>
            )}
          </div>
        )}
      </aside>

      {/* ── Carte ──────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[43.7102, 7.262]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {mapPositions.length > 0 && <FitBounds positions={mapPositions} />}

          {/* Tracé historique */}
          {selected && history.length > 1 && (
            <Polyline positions={history} color="#0d9488" weight={3} opacity={0.6} dashArray="6 4" />
          )}

          {/* Marqueurs chauffeurs */}
          {driverList.filter((d) => d.lat && d.lng).map((d) => (
            <Marker
              key={d.driverId}
              position={[d.lat, d.lng]}
              icon={driverIcon(STATUS_COLORS[d.status] || "#64748b")}
              ref={(r) => { if (r) markersRef.current[d.driverId] = r; }}
              eventHandlers={{ click: () => handleSelectDriver(d.driverId) }}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-navy">{d.driverName || d.driverNom || d.driverId}</p>
                  <p className="text-slate-500 mt-0.5">{STATUS_LABELS[d.status] || d.status}</p>
                  {d.transportRef && <p className="text-slate-400 mt-0.5">{d.transportRef}</p>}
                  {d.updatedAt && (
                    <p className="text-slate-300 mt-1">
                      {new Date(d.updatedAt).toLocaleTimeString("fr-FR")}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Badge compteur */}
        <div className="absolute top-3 right-3 z-[1000] bg-white rounded-lg shadow border border-slate-200 px-3 py-1.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-bold text-navy">{driverList.length} chauffeur{driverList.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
