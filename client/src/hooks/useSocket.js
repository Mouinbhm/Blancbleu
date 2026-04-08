import { useState, useEffect, useCallback } from "react";
import { connectSocket } from "../services/socketService";
import { useAuth } from "../context/AuthContext";

export default function useSocket() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [nouvellesInterventions, setNouvellesInterventions] = useState([]);
  const [alertesP1, setAlertesP1] = useState([]);
  const [lastDispatch, setLastDispatch] = useState(null);

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(user.role || "dispatcher");

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("intervention:nouvelle", (i) =>
      setNouvellesInterventions((p) => [i, ...p].slice(0, 10)),
    );
    socket.on("alerte:p1", (a) => {
      setAlertesP1((p) => [a, ...p].slice(0, 5));
      if (Notification.permission === "granted")
        new Notification("🚨 BlancBleu — P1", { body: a.message });
    });
    socket.on("dispatch:effectue", (d) => setLastDispatch(d));

    if (Notification.permission === "default") Notification.requestPermission();

    return () => {
      socket.removeAllListeners();
    };
  }, [user]);

  return {
    connected,
    nouvellesInterventions,
    alertesP1,
    lastDispatch,
    clearAlertes: useCallback(() => setAlertesP1([]), []),
  };
}
