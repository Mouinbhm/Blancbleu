/**
 * BlancBleu — Central Socket.IO event hub
 *
 * Initialise les handlers dans l'ordre :
 *   1. roomManager   — rooms user/role/patient/driver automatiques à la connexion
 *   2. driverSocket  — events app chauffeur (position, status, messagerie)
 *   3. patientSocket — room patient + token FCM
 */

const { initDriverSocket } = require("./driverSocket");
const { initPatientSocket } = require("./patientSocket");
const vehiclePositionStore = require("./vehiclePositionStore");
const Notification = require("../models/Notification");

function initSockets(io) {
  // ── Attribution automatique des rooms à chaque connexion ────────────────────
  io.on("connection", async (socket) => {
    const user = socket.user;
    if (!user) return;

    // Room personnelle — toujours rejointe peu importe le rôle
    socket.join(`user:${user.id}`);

    // Room par rôle (web admin/dispatcher/superviseur/comptable/patient)
    if (user.role) {
      socket.join(`role:${user.role}`);
    }

    // Room spéciale patient
    if (user.role === "patient") {
      socket.join(`patient:${user.id}`);
    }

    // Room spéciale chauffeur (personnel)
    if (user.type === "personnel" || user.role === "driver" || user.role === "ambulancier") {
      socket.join(`driver:${user.id}`);
      socket.join("role:driver");

      // Tell driver whether a dispatcher is already online
      const dispRoom = io.sockets.adapter.rooms.get("role:dispatcher");
      socket.emit("dispatcher:status", { online: dispRoom ? dispRoom.size > 0 : false });
    }

    // Notify drivers when a dispatcher connects or disconnects
    if (["dispatcher", "admin", "superviseur"].includes(user.role)) {
      io.to("role:driver").emit("dispatcher:status", { online: true });

      socket.on("disconnect", () => {
        const dispRoom = io.sockets.adapter.rooms.get("role:dispatcher");
        const remaining = dispRoom ? dispRoom.size : 0;
        io.to("role:driver").emit("dispatcher:status", { online: remaining > 0 });
      });
    }

    // Sprint M2 — Snapshot des positions véhicules pour les staff fraîchement
    // connectés. Lu depuis le store Redis (multi-instance) avec fallback Map.
    if (["dispatcher", "admin", "superviseur"].includes(user.role)) {
      try {
        const snapshot = await vehiclePositionStore.getAll();
        if (snapshot && Object.keys(snapshot).length > 0) {
          socket.emit("vehicle:positions_snapshot", snapshot);
        }
      } catch { /* best-effort */ }
    }

    // Envoyer le compteur de non-lus dès la connexion
    try {
      const query = { read: false, archived: false };
      if (["admin", "superviseur"].includes(user.role)) {
        query.$or = [{ recipientId: user.id }, { recipientRole: { $in: ["admin", user.role] } }];
      } else if (user.role === "dispatcher") {
        query.$or = [{ recipientId: user.id }, { recipientRole: { $in: ["dispatcher", "admin"] } }];
      } else {
        query.$or = [{ recipientId: user.id }, { recipientRole: user.role }];
      }
      const unreadCount = await Notification.countDocuments(query);
      socket.emit("notification:unread_count", { count: unreadCount });
    } catch { /* non-bloquant */ }

    // Événement côté client pour rejoindre la room d'un transport précis
    socket.on("join:transport", (transportId) => {
      if (transportId) socket.join(`transport:${transportId}`);
    });
    socket.on("leave:transport", (transportId) => {
      if (transportId) socket.leave(`transport:${transportId}`);
    });
  });

  initDriverSocket(io);
  initPatientSocket(io);
}

module.exports = { initSockets };
