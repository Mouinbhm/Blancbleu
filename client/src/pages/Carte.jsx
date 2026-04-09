/**
 * BlancBleu — Carte Temps Réel
 * Leaflet + OpenStreetMap + Socket.IO
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { unitService, interventionService } from "../services/api";
import useSocket from "../hooks/useSocket";

// ── Fix icônes Leaflet ──────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Centre Nice ─────────────────────────────────────────────────────────────
const NICE_CENTER = [43.7102, 7.262];
const NICE_ZOOM = 13;

// ── Couleurs par statut ─────────────────────────────────────────────────────
const COULEURS_STATUT = {
  disponible: { bg: "#10b981", text: "#fff", label: "Disponible" },
  en_mission: { bg: "#f59e0b", text: "#fff", label: "En mission" },
  maintenance: { bg: "#6b7280", text: "#fff", label: "Maintenance" },
  hors_service: { bg: "#ef4444", text: "#fff", label: "Hors service" },
  pause: { bg: "#8b5cf6", text: "#fff", label: "Pause" },
};

const COULEURS_PRIORITE = {
  P1: { bg: "#ef4444", pulse: true },
  P2: { bg: "#f59e0b", pulse: false },
  P3: { bg: "#3b82f6", pulse: false },
};

// ── Icône SVG ambulance ─────────────────────────────────────────────────────
function creerIconeUnite(unit) {
  const couleur = COULEURS_STATUT[unit.statut]?.bg || "#6b7280";
  const lettre = unit.type?.charAt(0) || "A";
  const pulse = unit.statut === "en_mission";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
      ${
        pulse
          ? `<circle cx="20" cy="20" r="18" fill="${couleur}" opacity="0.25">
        <animate attributeName="r" values="16;22;16" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite"/>
      </circle>`
          : ""
      }
      <circle cx="20" cy="20" r="16" fill="${couleur}" stroke="white" stroke-width="2.5"/>
      <text x="20" y="25" font-family="monospace" font-size="13" font-weight="bold"
            fill="white" text-anchor="middle">${lettre}</text>
      <polygon points="20,44 13,32 27,32" fill="${couleur}"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [40, 48],
    iconAnchor: [20, 44],
    popupAnchor: [0, -44],
  });
}

// ── Icône incident ──────────────────────────────────────────────────────────
function creerIconeIncident(intervention) {
  const couleur = COULEURS_PRIORITE[intervention.priorite]?.bg || "#3b82f6";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15" fill="${couleur}" stroke="white" stroke-width="2.5"/>
      <text x="18" y="23" font-family="monospace" font-size="14" font-weight="bold"
            fill="white" text-anchor="middle">${intervention.priorite || "P?"}</text>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// ── Composant centrage auto ─────────────────────────────────────────────────
function CentrerSurUnite({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.5 });
  }, [position, map]);
  return null;
}

// ── Popup Unité ─────────────────────────────────────────────────────────────
function PopupUnite({ unit }) {
  const col = COULEURS_STATUT[unit.statut] || COULEURS_STATUT.disponible;
  return (
    <div style={{ minWidth: 200 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            background: col.bg,
            color: col.text,
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {col.label}
        </span>
        <strong style={{ fontSize: 14 }}>{unit.nom}</strong>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
        <div>
          🚑 Type : <strong>{unit.type}</strong>
        </div>
        <div>
          ⛽ Carburant : <strong>{unit.carburant}%</strong>
        </div>
        {unit.equipage?.length > 0 && (
          <div>👥 Équipage : {unit.equipage.map((e) => e.nom).join(", ")}</div>
        )}
        {unit.position?.vitesse > 0 && (
          <div>
            🏎 Vitesse : <strong>{unit.position.vitesse} km/h</strong>
          </div>
        )}
        {unit.position?.updatedAt && (
          <div style={{ marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
            Mis à jour :{" "}
            {new Date(unit.position.updatedAt).toLocaleTimeString("fr-FR")}
          </div>
        )}
        {unit.interventionEnCours && (
          <div
            style={{
              marginTop: 6,
              padding: "4px 8px",
              background: "#fef3c7",
              borderRadius: 6,
              fontSize: 11,
            }}
          >
            🚨 Mission :{" "}
            {unit.interventionEnCours.numero ||
              unit.interventionEnCours.typeIncident}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Popup Intervention ──────────────────────────────────────────────────────
function PopupIntervention({ intervention }) {
  const col = COULEURS_PRIORITE[intervention.priorite] || COULEURS_PRIORITE.P3;
  return (
    <div style={{ minWidth: 200 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            background: col.bg,
            color: "#fff",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {intervention.priorite}
        </span>
        <strong style={{ fontSize: 13 }}>{intervention.typeIncident}</strong>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
        <div>📍 {intervention.adresse}</div>
        <div>
          🔖 Statut : <strong>{intervention.statut}</strong>
        </div>
        {intervention.patient?.etat && (
          <div>
            🧑 Patient : <strong>{intervention.patient.etat}</strong>
          </div>
        )}
        {intervention.unitAssignee?.nom && (
          <div>
            🚑 Unité : <strong>{intervention.unitAssignee.nom}</strong>
          </div>
        )}
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
          {new Date(intervention.createdAt).toLocaleTimeString("fr-FR")}
        </div>
      </div>
    </div>
  );
}

// ── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────
export default function Carte() {
  const [units, setUnits] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtreType, setFiltreType] = useState("tous");
  const [unitSelectee, setUnitSelectee] = useState(null);
  const [centrerSur, setCentrerSur] = useState(null);
  const [showUnits, setShowUnits] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [dernierUpdate, setDernierUpdate] = useState(null);
  const markersRef = useRef({});

  const { subscribe, connected } = useSocket();

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    const charger = async () => {
      try {
        const [u, i] = await Promise.all([
          unitService.getAll(),
          interventionService.getAll({ limit: 20 }),
        ]);
        setUnits(u.data || []);
        setInterventions(
          (i.data?.interventions || []).filter(
            (x) =>
              x.coordonnees?.lat &&
              !["COMPLETED", "CANCELLED"].includes(x.statut),
          ),
        );
      } catch (err) {
        console.error("Erreur chargement carte:", err);
      } finally {
        setLoading(false);
      }
    };
    charger();
    const iv = setInterval(charger, 30000); // refresh toutes les 30s
    return () => clearInterval(iv);
  }, []);

  // ── Socket.IO — position GPS ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribe("unit:location_updated", (data) => {
      setUnits((prev) =>
        prev.map((u) =>
          u._id === data.unitId
            ? { ...u, position: data.position, statut: data.statut }
            : u,
        ),
      );
      setDernierUpdate(new Date());
    });
    return unsub;
  }, [subscribe]);

  // ── Socket.IO — nouvelle intervention ────────────────────────────────────
  useEffect(() => {
    const unsub = subscribe("intervention:created", (data) => {
      if (data.coordonnees?.lat) {
        setInterventions((prev) => [data, ...prev].slice(0, 30));
      }
    });
    return unsub;
  }, [subscribe]);

  // ── Socket.IO — statut unité ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribe("unit:status_changed", (data) => {
      setUnits((prev) =>
        prev.map((u) =>
          u._id === data.unitId ? { ...u, statut: data.nouveauStatut } : u,
        ),
      );
    });
    return unsub;
  }, [subscribe]);

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const unitsFiltrees = units.filter((u) => {
    const okStatut = filtreStatut === "tous" || u.statut === filtreStatut;
    const okType = filtreType === "tous" || u.type === filtreType;
    return okStatut && okType && u.position?.lat;
  });

  const interventionsFiltrees = interventions.filter(
    (i) => i.coordonnees?.lat && i.coordonnees?.lng,
  );

  // ── Sélection unité ───────────────────────────────────────────────────────
  const selectionnerUnite = useCallback((unit) => {
    setUnitSelectee(unit);
    setCentrerSur([unit.position.lat, unit.position.lng]);
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: "4px solid #e2e8f0",
              borderTop: "4px solid #1D6EF5",
              borderRadius: "50%",
              animation: "spin .8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "#64748b", fontWeight: 600 }}>
            Chargement de la carte...
          </p>
        </div>
      </div>
    );

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f8fafc",
      }}
    >
      {/* ── Barre d'outils ── */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          zIndex: 1000,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#0f172a",
              margin: 0,
            }}
          >
            🗺️ Carte en direct
          </p>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
            {unitsFiltrees.length} unités · {interventionsFiltrees.length}{" "}
            interventions actives
          </p>
        </div>

        {/* Statut connexion */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 20,
            background: connected ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${connected ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#10b981" : "#ef4444",
              animation: connected ? "pulse 2s infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: connected ? "#059669" : "#dc2626",
            }}
          >
            {connected ? "Temps réel actif" : "Déconnecté"}
          </span>
        </div>

        {/* Filtres */}
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            cursor: "pointer",
          }}
        >
          <option value="tous">Tous statuts</option>
          <option value="disponible">Disponibles</option>
          <option value="en_mission">En mission</option>
          <option value="maintenance">Maintenance</option>
        </select>

        <select
          value={filtreType}
          onChange={(e) => setFiltreType(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            cursor: "pointer",
          }}
        >
          <option value="tous">Tous types</option>
          <option value="SMUR">SMUR</option>
          <option value="VSAV">VSAV</option>
          <option value="VSL">VSL</option>
        </select>

        {/* Toggles couches */}
        <button
          onClick={() => setShowUnits((v) => !v)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            border: "1px solid #e2e8f0",
            cursor: "pointer",
            background: showUnits ? "#eff6ff" : "#f8fafc",
            color: showUnits ? "#1D6EF5" : "#94a3b8",
          }}
        >
          🚑 Unités {showUnits ? "✓" : "✗"}
        </button>

        <button
          onClick={() => setShowIncidents((v) => !v)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            border: "1px solid #e2e8f0",
            cursor: "pointer",
            background: showIncidents ? "#fff7ed" : "#f8fafc",
            color: showIncidents ? "#ea580c" : "#94a3b8",
          }}
        >
          🚨 Incidents {showIncidents ? "✓" : "✗"}
        </button>

        {dernierUpdate && (
          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>
            MAJ : {dernierUpdate.toLocaleTimeString("fr-FR")}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Panel gauche : liste unités ── */}
        <div
          style={{
            width: 260,
            background: "#fff",
            borderRight: "1px solid #e2e8f0",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              Unités ({unitsFiltrees.length})
            </p>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {unitsFiltrees.map((unit) => {
              const col =
                COULEURS_STATUT[unit.statut] || COULEURS_STATUT.disponible;
              const actif = unitSelectee?._id === unit._id;
              return (
                <div
                  key={unit._id}
                  onClick={() => selectionnerUnite(unit)}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid #f8fafc",
                    cursor: "pointer",
                    transition: "all .15s",
                    background: actif ? "#eff6ff" : "white",
                    borderLeft: actif
                      ? "3px solid #1D6EF5"
                      : "3px solid transparent",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: col.bg,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: "#0f172a",
                      }}
                    >
                      {unit.nom}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "#94a3b8",
                        marginLeft: "auto",
                      }}
                    >
                      {unit.type}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      marginTop: 3,
                      paddingLeft: 16,
                    }}
                  >
                    {col.label} · ⛽{unit.carburant}%
                    {unit.position?.vitesse > 0 &&
                      ` · ${unit.position.vitesse}km/h`}
                  </div>
                  {unit.statut === "en_mission" && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#f59e0b",
                        marginTop: 2,
                        paddingLeft: 16,
                        fontWeight: 600,
                      }}
                    >
                      🚨 En intervention
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid #f1f5f9",
              background: "#f8fafc",
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                margin: "0 0 8px",
              }}
            >
              Légende
            </p>
            {Object.entries(COULEURS_STATUT).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: v.bg,
                  }}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {v.label}
                </span>
              </div>
            ))}
            <div
              style={{
                marginTop: 8,
                borderTop: "1px solid #e2e8f0",
                paddingTop: 8,
              }}
            >
              {Object.entries(COULEURS_PRIORITE)
                .slice(0, 3)
                .map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: v.bg,
                      }}
                    />
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      Incident {k}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ── Carte Leaflet ── */}
        <div style={{ flex: 1, position: "relative" }}>
          <MapContainer
            center={NICE_CENTER}
            zoom={NICE_ZOOM}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ZoomControl position="bottomright" />

            {/* Centrage sur unité sélectionnée */}
            {centrerSur && <CentrerSurUnite position={centrerSur} />}

            {/* Marqueurs unités */}
            {showUnits &&
              unitsFiltrees.map((unit) => (
                <Marker
                  key={unit._id}
                  position={[unit.position.lat, unit.position.lng]}
                  icon={creerIconeUnite(unit)}
                  eventHandlers={{ click: () => setUnitSelectee(unit) }}
                >
                  <Popup maxWidth={250} className="blancbleu-popup">
                    <PopupUnite unit={unit} />
                  </Popup>
                </Marker>
              ))}

            {/* Marqueurs interventions */}
            {showIncidents &&
              interventionsFiltrees.map((intervention) => (
                <Marker
                  key={intervention._id}
                  position={[
                    intervention.coordonnees.lat,
                    intervention.coordonnees.lng,
                  ]}
                  icon={creerIconeIncident(intervention)}
                >
                  <Popup maxWidth={250}>
                    <PopupIntervention intervention={intervention} />
                  </Popup>
                  {/* Zone de rayon pour P1 */}
                  {intervention.priorite === "P1" && (
                    <Circle
                      center={[
                        intervention.coordonnees.lat,
                        intervention.coordonnees.lng,
                      ]}
                      radius={500}
                      pathOptions={{
                        color: "#ef4444",
                        fillColor: "#ef4444",
                        fillOpacity: 0.08,
                        weight: 1.5,
                        dashArray: "5,5",
                      }}
                    />
                  )}
                </Marker>
              ))}
          </MapContainer>

          {/* Compteur en bas */}
          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: 20,
              zIndex: 1000,
              background: "rgba(255,255,255,0.95)",
              borderRadius: 12,
              padding: "8px 16px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              display: "flex",
              gap: 16,
              fontSize: 12,
            }}
          >
            {Object.entries(COULEURS_STATUT).map(([k, v]) => {
              const n = units.filter((u) => u.statut === k).length;
              if (!n) return null;
              return (
                <div
                  key={k}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: v.bg,
                    }}
                  />
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{n}</span>
                  <span style={{ color: "#64748b" }}>
                    {v.label.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .leaflet-popup-content-wrapper { border-radius:12px !important; }
        .leaflet-popup-content { margin:12px !important; }
      `}</style>
    </div>
  );
}
