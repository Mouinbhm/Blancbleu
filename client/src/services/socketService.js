/**
 * BlancBleu — Service Socket.IO Client
 * Connexion temps réel avec le serveur Express
 */
import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.REACT_APP_API_URL?.replace("/api", "") || "http://localhost:5000";

let socket = null;

export function connectSocket(role = "dispatcher") {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token: localStorage.getItem("token") },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 2000,
  });

  socket.on("connect", () => {
    console.log("🔌 Socket connecté");
    socket.emit("join:role", role);
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket déconnecté");
  });

  socket.on("connect_error", (err) => {
    console.warn("Socket erreur:", err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

export function getOrCreateSocket(role = "dispatcher") {
  if (socket?.connected) return socket;
  return connectSocket(role);
}

/**
 * Hook React pour écouter un événement Socket.IO
 * Usage : useSocketEvent('intervention:nouvelle', callback)
 */
export function subscribeToEvent(event, callback) {
  if (!socket) return () => {};
  socket.on(event, callback);
  return () => socket.off(event, callback);
}
