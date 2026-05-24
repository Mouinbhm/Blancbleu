import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

/**
 * Couche heatmap Leaflet à monter à l'intérieur d'un <MapContainer>.
 *
 * Props :
 *   - points : Array<[lat, lng, weight]>
 *   - maxWeight : poids max (utilisé pour normaliser l'intensité)
 *   - options : surcharges Leaflet.heat (radius, blur, gradient…)
 */
export default function TransportHeatmap({ points, maxWeight = 10, options = {} }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    // Nettoie une couche précédente
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!points || points.length === 0) return undefined;

    layerRef.current = L.heatLayer(points, {
      radius:  25,
      blur:    18,
      maxZoom: 17,
      max:     Math.max(1, maxWeight),
      gradient: {
        0.2: "#2563eb",  // blue
        0.4: "#10b981",  // green
        0.6: "#f59e0b",  // amber
        0.8: "#ef4444",  // red
        1.0: "#7f1d1d",  // dark red
      },
      ...options,
    }).addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, maxWeight, options]);

  return null;
}
