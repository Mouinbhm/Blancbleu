import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import TransportHeatmap from "../components/map/TransportHeatmap";
import { Card, Skeleton, Badge } from "../components/ui";

// Centre Nice (point de référence par défaut)
const NICE_CENTER = [43.7102, 7.262];

function useHeatmapData(days) {
  return useQuery({
    queryKey: ["analytics", "heatmap", days],
    queryFn:  () => api.get(`/analytics/heatmap?days=${days}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

const PERIOD_OPTIONS = [
  { value: 7,   label: "7 j" },
  { value: 30,  label: "30 j" },
  { value: 90,  label: "90 j" },
  { value: 180, label: "180 j" },
];

export default function CarteAnalytique() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useHeatmapData(days);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Carte analytique</h1>
          <p className="text-sm text-gray-500">
            Densité des transports (départ + destination) sur la période sélectionnée.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                days === opt.value
                  ? "bg-primary text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase text-slate-500">Transports</div>
          <div className="text-2xl font-bold">{data?.count ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-slate-500">Points uniques</div>
          <div className="text-2xl font-bold">{data?.uniquePoints ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-slate-500">Densité max</div>
          <div className="text-2xl font-bold">
            {data?.maxWeight ?? "—"} <span className="text-sm font-normal text-slate-500">transports / zone</span>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
          {isLoading && <Skeleton className="w-full h-full" />}
          {isError && (
            <div className="h-full grid place-items-center text-red-600">
              Erreur de chargement
            </div>
          )}
          {!isLoading && !isError && (
            <MapContainer
              center={NICE_CENTER}
              zoom={12}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {data?.points?.length > 0 && (
                <TransportHeatmap points={data.points} maxWeight={data.maxWeight} />
              )}
            </MapContainer>
          )}
        </div>
      </Card>

      <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
        <span>Légende :</span>
        <Badge variant="info">Faible</Badge>
        <Badge variant="success">Moyen</Badge>
        <Badge variant="warning">Élevé</Badge>
        <Badge variant="danger">Très élevé</Badge>
        <span className="opacity-60">— agrégation par bucket ~110m (3 décimales).</span>
      </div>
    </div>
  );
}
