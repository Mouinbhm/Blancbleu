// Fichier : client/src/components/map/TransportMap.jsx
import { useEffect, useRef } from "react";
import { getSocket, getOrCreateSocket } from "../../services/socketService";

let L = null;
try {
  L = require("leaflet");
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
} catch {
  /* Leaflet non disponible */
}

const NICE = [43.7102, 7.262];
const OSRM_PUBLIC = "https://router.project-osrm.org";

// Injecte le CSS d'animation une seule fois dans le document
function _injectVehiculeCSS() {
  if (document.getElementById("vehicule-anim-css")) return;
  const style = document.createElement("style");
  style.id = "vehicule-anim-css";
  style.textContent = `
    @keyframes vehicule-pulse {
      0%, 100% { transform: scale(1) rotate(-5deg); }
      50%       { transform: scale(1.25) rotate(5deg); }
    }
    .vehicule-marker {
      background: none !important;
      border: none !important;
    }
  `;
  document.head.appendChild(style);
}

function _makeVehiculeIcon(L) {
  return L.divIcon({
    html: `<div style="
      font-size:30px;line-height:1;
      filter:drop-shadow(2px 2px 3px rgba(0,0,0,0.45));
      animation:vehicule-pulse 0.9s ease-in-out infinite;
    ">🚑</div>`,
    className: "vehicule-marker",
    iconSize:    [40, 40],
    iconAnchor:  [20, 20],
    popupAnchor: [0, -22],
  });
}

function _makeStaticIcon(L) {
  return L.divIcon({
    html: `<div style="
      font-size:28px;line-height:1;
      filter:drop-shadow(1px 1px 3px rgba(0,0,0,0.3));
      opacity:0.7;
    ">🚐</div>`,
    className: "vehicule-marker",
    iconSize:    [40, 40],
    iconAnchor:  [20, 20],
    popupAnchor: [0, -22],
  });
}

function _estJourJ(transport) {
  if (!transport?.dateTransport) return true;
  const jourTransport = new Date(transport.dateTransport);
  jourTransport.setHours(0, 0, 0, 0);
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  return jourTransport.getTime() === debutJour.getTime();
}

const STATUTS_TERRAIN = [
  "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
  "ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
];

export default function TransportMap({ transport, vehiclePosition }) {
  const mapRef            = useRef(null);
  const instanceRef       = useRef(null);
  const markersRef        = useRef({});
  const routeLayerRef     = useRef(null);
  const vehiculeMarkerRef = useRef(null);
  const markerSourceRef   = useRef(null); // "socket" | "static"

  // Calculé à chaque render, lu dans les cleanups via ref
  const estJourJRef = useRef(true);
  estJourJRef.current = _estJourJ(transport);

  // ── Initialisation carte Leaflet ──────────────────────────────────────────
  useEffect(() => {
    if (!L || !mapRef.current || instanceRef.current) return;

    instanceRef.current = L.map(mapRef.current, {
      center: NICE,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instanceRef.current);

    return () => {
      instanceRef.current?.remove();
      instanceRef.current = null;
    };
  }, []);

  // ── Marqueur départ (bleu) ────────────────────────────────────────────────
  useEffect(() => {
    if (!instanceRef.current) return;
    const coords = transport?.adresseDepart?.coordonnees;
    if (!coords?.lat) return;

    if (markersRef.current.depart) {
      markersRef.current.depart.setLatLng([coords.lat, coords.lng]);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:32px;height:32px;border-radius:50% 50% 50% 0;
          background:#1D6EF5;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          transform:rotate(-45deg);
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      markersRef.current.depart = L.marker([coords.lat, coords.lng], { icon })
        .addTo(instanceRef.current)
        .bindPopup(
          `<b>Départ</b><br>${transport.patient?.nom || ""} ${transport.patient?.prenom || ""}<br>${transport.adresseDepart?.rue || ""}`,
        );
    }
  }, [transport?.adresseDepart]);

  // ── Marqueur destination (vert) ───────────────────────────────────────────
  useEffect(() => {
    if (!instanceRef.current) return;
    const coords = transport?.adresseDestination?.coordonnees;
    if (!coords?.lat) return;

    if (markersRef.current.destination) {
      markersRef.current.destination.setLatLng([coords.lat, coords.lng]);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:#10b981;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
          </svg>
        </div>`,
        iconSize:   [32, 32],
        iconAnchor: [16, 16],
      });
      const nom = transport.adresseDestination?.nom || transport.adresseDestination?.rue || "Destination";
      markersRef.current.destination = L.marker([coords.lat, coords.lng], { icon })
        .addTo(instanceRef.current)
        .bindPopup(`<b>Destination</b><br>${nom}<br>${transport.adresseDestination?.service || ""}`);
    }

    const bounds = [];
    if (transport?.adresseDepart?.coordonnees?.lat)
      bounds.push([transport.adresseDepart.coordonnees.lat, transport.adresseDepart.coordonnees.lng]);
    bounds.push([coords.lat, coords.lng]);
    if (bounds.length >= 2)
      instanceRef.current.fitBounds(bounds, { padding: [40, 40] });
  }, [transport?.adresseDestination]);

  // ── Route polyline OSRM ────────────────────────────────────────────────────
  useEffect(() => {
    const dep  = transport?.adresseDepart?.coordonnees;
    const dest = transport?.adresseDestination?.coordonnees;
    if (!instanceRef.current || !dep?.lat || !dest?.lat || !L) return;

    let cancelled = false;
    const url =
      `${OSRM_PUBLIC}/route/v1/driving/` +
      `${dep.lng},${dep.lat};${dest.lng},${dest.lat}` +
      `?overview=full&geometries=geojson`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !instanceRef.current) return;
        if (routeLayerRef.current) instanceRef.current.removeLayer(routeLayerRef.current);

        if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates?.length > 1) {
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          routeLayerRef.current = L.polyline(coords, {
            color: "#1D6EF5", weight: 3, opacity: 0.65, dashArray: "8, 6",
          }).addTo(instanceRef.current);
        } else {
          routeLayerRef.current = L.polyline(
            [[dep.lat, dep.lng], [dest.lat, dest.lng]],
            { color: "#94a3b8", weight: 2, opacity: 0.5, dashArray: "4, 4" },
          ).addTo(instanceRef.current);
        }
      })
      .catch(() => {
        if (cancelled || !instanceRef.current) return;
        if (routeLayerRef.current) instanceRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = L.polyline(
          [[dep.lat, dep.lng], [dest.lat, dest.lng]],
          { color: "#94a3b8", weight: 2, opacity: 0.5, dashArray: "4, 4" },
        ).addTo(instanceRef.current);
      });

    return () => {
      cancelled = true;
      if (routeLayerRef.current && instanceRef.current) {
        instanceRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
    };
  }, [transport?.adresseDepart?.coordonnees, transport?.adresseDestination?.coordonnees]);

  // ── TÂCHE 1 : Debug socket — log tous les événements vehicule:position ────
  useEffect(() => {
    const socket = getSocket() || getOrCreateSocket();
    if (!socket) {
      console.warn("❌ [TransportMap] Socket non disponible");
      return;
    }

    const onDebug = (data) => {
      console.log("🚑 [TransportMap] vehicule:position reçu:", data);
      console.log("  vehiculeId reçu       :", String(data.vehiculeId || ""));
      console.log("  vehiculeId transport  :", String(transport?.vehicule?._id || transport?.vehicule || ""));
      console.log("  transportId reçu      :", String(data.transportId || ""));
      console.log("  transport._id         :", String(transport?._id || ""));
      console.log("  carte initialisée     :", !!instanceRef.current);
      console.log("  coordonnées           :", data.lat, data.lng);
    };

    socket.on("vehicule:position", onDebug);
    return () => socket.off("vehicule:position", onDebug);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TÂCHE 2 : Marqueur véhicule — écouteur direct sur le socket ───────────
  useEffect(() => {
    if (!L) return;
    _injectVehiculeCSS();

    const socket = getSocket() || getOrCreateSocket();
    if (!socket) {
      console.warn("❌ [TransportMap] Socket indisponible pour le marqueur véhicule");
      return;
    }

    const vehiculeIdTransport = String(
      transport?.vehicule?._id || transport?.vehicule || "",
    );

    const onPosition = (data) => {
      // ── Transport futur → ignorer les mises à jour de position ──────────
      if (!estJourJRef.current) {
        console.log("[TransportMap] Transport futur — position socket ignorée");
        return;
      }

      // ── Vérifier que la carte Leaflet est prête ──────────────────────────
      if (!instanceRef.current) {
        console.warn("[TransportMap] Carte pas encore prête, position ignorée");
        return;
      }

      // ── Filtrage par vehiculeId (string vs string) ────────────────────────
      const vehiculeIdData = String(data.vehiculeId || "");
      console.log(
        "[TransportMap] Comparaison IDs:",
        vehiculeIdData, "===", vehiculeIdTransport,
        "→", vehiculeIdData === vehiculeIdTransport || !vehiculeIdTransport,
      );
      // Accepter si les IDs correspondent OU si aucun véhicule lié (pas de filtre)
      if (vehiculeIdTransport && vehiculeIdData !== vehiculeIdTransport) return;

      // ── Validation des coordonnées ────────────────────────────────────────
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (isNaN(lat) || isNaN(lng)) {
        console.warn("[TransportMap] Coordonnées invalides reçues:", data);
        return;
      }

      const pos = [lat, lng];
      const nomVehicule =
        transport?.vehicule?.nom ||
        transport?.vehicule?.immatriculation ||
        "Véhicule";
      const tooltipLabel = `🚑 En route — ${data.vitesse || 50} km/h`;
      const popupContent = `
        <div style="text-align:center;padding:4px 2px">
          <strong>🚑 ${nomVehicule}</strong><br>
          <span style="color:#1D6EF5;font-weight:600">${data.vitesse || 50} km/h</span><br>
          <small style="color:#64748b">${data.progression || 0}% du trajet</small>
        </div>
      `;

      if (!vehiculeMarkerRef.current) {
        // Créer le marqueur pour la première fois
        vehiculeMarkerRef.current = L.marker(pos, {
          icon: _makeVehiculeIcon(L),
          zIndexOffset: 2000,
        })
          .addTo(instanceRef.current)
          .bindTooltip(tooltipLabel, { permanent: false, direction: "top" })
          .bindPopup(popupContent);

        markerSourceRef.current = "socket";
        console.log("✅ [TransportMap] Marqueur véhicule créé à:", pos);

        // Centrer la carte sur le véhicule à la première apparition
        instanceRef.current.panTo(pos, { animate: true, duration: 1.2 });
      } else {
        // Déplacer le marqueur existant
        vehiculeMarkerRef.current.setLatLng(pos);
        vehiculeMarkerRef.current.setTooltipContent(tooltipLabel);
        vehiculeMarkerRef.current.setPopupContent(popupContent);

        // Suivre le véhicule en douceur
        instanceRef.current.panTo(pos, { animate: true, duration: 1.5 });
      }
    };

    socket.on("vehicule:position", onPosition);

    return () => {
      socket.off("vehicule:position", onPosition);
      // Ne supprimer que les marqueurs créés par socket (pas le marqueur statique)
      if (vehiculeMarkerRef.current && markerSourceRef.current === "socket") {
        vehiculeMarkerRef.current.remove();
        vehiculeMarkerRef.current = null;
        markerSourceRef.current = null;
      }
    };
  }, [transport?._id, transport?.vehicule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Position temps réel DB (fallback si pas de socket actif) ─────────────
  useEffect(() => {
    if (!instanceRef.current || !vehiclePosition?.lat || vehiculeMarkerRef.current) return;
    // Ne pas afficher un marqueur animé pour les transports futurs
    if (!estJourJRef.current) return;

    const pos = [vehiclePosition.lat, vehiclePosition.lng];
    vehiculeMarkerRef.current = L.marker(pos, {
      icon: _makeVehiculeIcon(L),
      zIndexOffset: 2000,
    })
      .addTo(instanceRef.current)
      .bindTooltip("🚑 En route", { permanent: false, direction: "top" })
      .bindPopup("<b>🚑 Véhicule</b><br>Dernière position connue");

    markerSourceRef.current = "socket";
    instanceRef.current.panTo(pos, { animate: true });
  }, [vehiclePosition]);

  // ── Marqueur fixe pour transport futur en statut terrain incorrect ─────────
  useEffect(() => {
    if (!L || !instanceRef.current) return;
    if (estJourJRef.current) return;                          // transport du jour → pas ce marqueur
    if (!STATUTS_TERRAIN.includes(transport?.statut)) return; // pas en statut terrain → rien
    if (vehiculeMarkerRef.current) return;                    // marqueur déjà présent

    // Position au départ ou fallback garage BlancBleu (Nice)
    const dep = transport?.adresseDepart?.coordonnees;
    const pos = dep?.lat ? [dep.lat, dep.lng] : NICE;

    const dateStr = transport?.dateTransport
      ? new Date(transport.dateTransport).toLocaleDateString("fr-FR", {
          day: "numeric", month: "long", year: "numeric",
        })
      : "date inconnue";

    vehiculeMarkerRef.current = L.marker(pos, {
      icon: _makeStaticIcon(L),
      zIndexOffset: 2000,
    })
      .addTo(instanceRef.current)
      .bindTooltip(`🚐 En attente — Départ le ${dateStr}`, { permanent: false, direction: "top" })
      .bindPopup(
        `<div style="text-align:center;padding:4px 2px">
          <strong>🚐 En attente</strong><br>
          <small style="color:#64748b">Transport planifié le ${dateStr}</small>
        </div>`,
      );

    markerSourceRef.current = "static";

    return () => {
      if (vehiculeMarkerRef.current && markerSourceRef.current === "static") {
        vehiculeMarkerRef.current.remove();
        vehiculeMarkerRef.current = null;
        markerSourceRef.current = null;
      }
    };
  }, [transport?._id, transport?.statut, transport?.dateTransport]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (!L) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl text-slate-400 text-sm">
        <span className="material-symbols-outlined mr-2">map</span>
        Carte non disponible
      </div>
    );
  }

  const hasDepart      = !!transport?.adresseDepart?.coordonnees?.lat;
  const hasDestination = !!transport?.adresseDestination?.coordonnees?.lat;
  const noCoords       = !hasDepart && !hasDestination && !vehiclePosition?.lat;

  return (
    <div className="relative w-full h-full">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="w-full h-full rounded-xl" />
      {noCoords && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 rounded-xl pointer-events-none">
          <span className="material-symbols-outlined text-slate-300 text-3xl mb-1">location_off</span>
          <p className="text-xs text-slate-400 font-semibold">Coordonnées non renseignées</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {transport?.adresseDepart?.rue || "Adresse de départ manquante"}
          </p>
        </div>
      )}
    </div>
  );
}
