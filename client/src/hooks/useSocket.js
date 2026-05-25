/**
 * BlancBleu — Hook useSocket
 * Gère la connexion Socket.IO et expose les événements temps réel
 *
 * Usage :
 *   const { connected, events, stats, alertes } = useSocket();
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../services/socketClient";

export default function useSocket() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [alertes, setAlertes] = useState([]);
  const [events, setEvents] = useState([]);
  const listenersRef = useRef({});

  useEffect(() => {
    if (!user) return;

    const socket = getSocket();

    // ── Connexion ──────────────────────────────────────────────────────────
    const onConnect = () => {
      setConnected(true);
      socket.emit("join:role", { role: user.role, userId: user._id });
    };

    const onDisconnect = () => setConnected(false);

    const onAck = (data) => {
      console.log("✅ Socket temps réel établi:", data.message);
    };

    // ── transport:created (demande patient depuis app mobile) ─────────────
    const onTransportCreated = (data) => {
      addEvent({ type: "transport:created", data, color: "blue" });
      if (Notification.permission === "granted") {
        new Notification(`🚑 Nouvelle demande — ${data.patient?.nom || ''} ${data.patient?.prenom || ''}`.trim(), {
          body: `${data.motif || ''} · ${data.typeTransport || ''}`,
          icon: "/favicon.ico",
        });
      }
    };

    // ── intervention:created ───────────────────────────────────────────────
    const onInterventionCreated = (data) => {
      addEvent({ type: "intervention:created", data, color: "blue" });
      // Notification navigateur
      if (Notification.permission === "granted") {
        new Notification(`🚑 Nouvelle intervention — ${data.priorite}`, {
          body: `${data.typeIncident} · ${data.adresse}`,
          icon: "/favicon.ico",
        });
      }
    };

    // ── unit:assigned ──────────────────────────────────────────────────────
    const onUnitAssigned = (data) => {
      addEvent({ type: "unit:assigned", data, color: "purple" });
    };

    // ── transport:status (Sprint M2 — unifié) ─────────────────────────────
    const onStatusUpdated = (data) => {
      addEvent({ type: "status:updated", data, color: "orange" });
    };

    // ── escalation:triggered ───────────────────────────────────────────────
    const onEscalationTriggered = (data) => {
      addEvent({ type: "escalation:triggered", data, color: "red" });
      setAlertes((prev) => [data, ...prev].slice(0, 10));
      // Notification urgente
      if (Notification.permission === "granted") {
        new Notification("🚨 ESCALADE BlancBleu", {
          body: data.alertes?.[0]?.message || "Alerte critique",
          icon: "/favicon.ico",
        });
      }
    };

    // ── dispatch:completed ─────────────────────────────────────────────────
    const onDispatchCompleted = (data) => {
      addEvent({ type: "dispatch:completed", data, color: "green" });
    };

    // ── unit:status_changed ────────────────────────────────────────────────
    const onUnitStatusChanged = (data) => {
      addEvent({ type: "unit:status_changed", data, color: "indigo" });
    };

    // ── alerte:p1 ──────────────────────────────────────────────────────────
    const onAlerteP1 = (data) => {
      addEvent({ type: "alerte:p1", data, color: "red" });
      setAlertes((prev) =>
        [{ ...data, niveauMaximal: "EMERGENCY" }, ...prev].slice(0, 10),
      );
    };

    // ── stats:update ───────────────────────────────────────────────────────
    const onStatsUpdate = (data) => {
      if (data) setStats(data);
    };

    // ── heartbeat ──────────────────────────────────────────────────────────
    const onHeartbeat = () => {
      if (!connected) setConnected(true);
    };

    // Enregistrer les listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connected:ack", onAck);
    socket.on("transport:created", onTransportCreated);
    socket.on("intervention:created", onInterventionCreated);
    socket.on("unit:assigned", onUnitAssigned);
    socket.on("transport:status",        onStatusUpdated);  // M2 — unique nom canonique
    socket.on("escalation:triggered", onEscalationTriggered);
    socket.on("dispatch:completed", onDispatchCompleted);
    socket.on("unit:status_changed", onUnitStatusChanged);
    socket.on("alerte:p1", onAlerteP1);
    socket.on("stats:update", onStatsUpdate);
    socket.on("system:heartbeat", onHeartbeat);

    // Demander stats initiales
    socket.emit("request:stats");

    // Demander permission notifications
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Si déjà connecté
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connected:ack", onAck);
      socket.off("transport:created", onTransportCreated);
      socket.off("intervention:created", onInterventionCreated);
      socket.off("unit:assigned", onUnitAssigned);
      socket.off("transport:status",        onStatusUpdated);
      socket.off("escalation:triggered", onEscalationTriggered);
      socket.off("dispatch:completed", onDispatchCompleted);
      socket.off("unit:status_changed", onUnitStatusChanged);
      socket.off("alerte:p1", onAlerteP1);
      socket.off("stats:update", onStatsUpdate);
      socket.off("system:heartbeat", onHeartbeat);
    };
  }, [user]);

  // Ajouter un événement au journal (max 50)
  const addEvent = useCallback((event) => {
    setEvents((prev) =>
      [{ ...event, id: Date.now(), timestamp: new Date() }, ...prev].slice(
        0,
        50,
      ),
    );
  }, []);

  const clearAlertes = useCallback(() => setAlertes([]), []);
  const clearEvents = useCallback(() => setEvents([]), []);

  // Écouter un événement custom depuis un composant
  const subscribe = useCallback((eventName, callback) => {
    const socket = getSocket();
    socket.on(eventName, callback);
    return () => socket.off(eventName, callback);
  }, []);

  return {
    connected,
    stats,
    alertes,
    events,
    clearAlertes,
    clearEvents,
    subscribe,
    // Nombre de nouvelles alertes non lues
    nbAlertes: alertes.length,
    // Derniers événements par type
    lastInterventionCreated: events.find(
      (e) => e.type === "intervention:created",
    ),
    lastEscalation: events.find((e) => e.type === "escalation:triggered"),
    lastDispatch: events.find((e) => e.type === "dispatch:completed"),
  };
}
