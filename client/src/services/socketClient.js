/**
 * Shared Socket.IO singleton.
 * Both useSocket and DispatcherChat import from here so they share one connection.
 */
import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

let _socket = null;

export function getSocket() {
  if (!_socket) {
    _socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
  }
  return _socket;
}
