/**
 * BlancBleu — Driver Socket.IO handler
 *
 * Events server → driver app:
 *   transport:assigned     new transport assigned
 *   transport:modified     transport details changed
 *   transport:cancelled    transport cancelled
 *   message:dispatcher     message from dispatcher
 *   shift:forced_end       dispatcher ends shift remotely
 *
 * Events driver app → server:
 *   driver:location        { lat, lng, speed, shiftId }
 *   driver:status          { status }
 *   message:driver         { text, dispatcherId }
 */

const TrackingPoint = require("../models/TrackingPoint");
const DriverShift   = require("../models/DriverShift");

function initDriverSocket(io) {
  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) return;

    // Driver joins their personal room
    if (user.type === "personnel" || user.role === "driver" || user.role === "ambulancier") {
      socket.join(`driver:${user.id}`);
      io.to("role:dispatcher").to("role:admin").emit("driver:online", {
        driverId:  user.id,
        driverNom: `${user.prenom} ${user.nom}`,
        timestamp: new Date(),
      });

      socket.on("disconnect", () => {
        io.to("role:dispatcher").to("role:admin").emit("driver:offline", {
          driverId:  user.id,
          timestamp: new Date(),
        });
      });

      // ── driver:location ───────────────────────────────────────────────────
      socket.on("driver:location", async ({ lat, lng, speed = 0, shiftId, transportId }) => {
        try {
          if (!shiftId) return;
          await TrackingPoint.create({
            driverId:    user.id,
            shiftId,
            transportId: transportId || null,
            lat, lng, speed,
            timestamp:   new Date(),
          });

          io.to("role:dispatcher").to("role:admin").to("role:superviseur").emit("driver:location_updated", {
            driverId:  user.id,
            driverNom: `${user.prenom} ${user.nom}`,
            lat, lng, speed,
            shiftId,
            timestamp: new Date(),
          });
        } catch { /* non-bloquant */ }
      });

      // ── driver:status ─────────────────────────────────────────────────────
      socket.on("driver:status", ({ status }) => {
        io.to("role:dispatcher").to("role:admin").emit("driver:status_changed", {
          driverId:  user.id,
          driverNom: `${user.prenom} ${user.nom}`,
          status,
          timestamp: new Date(),
        });
      });

      // ── message:driver ────────────────────────────────────────────────────
      socket.on("message:driver", ({ text, dispatcherId }) => {
        const payload = {
          from:      user.id,
          fromNom:   `${user.prenom} ${user.nom}`,
          text,
          timestamp: new Date(),
        };
        if (dispatcherId) {
          io.to(`driver:${dispatcherId}`).emit("message:driver", payload);
        } else {
          io.to("role:dispatcher").emit("message:driver", payload);
        }
      });
    }

    // ── Dispatcher sends message to driver ───────────────────────────────────
    if (["dispatcher", "admin", "superviseur"].includes(user.role)) {
      socket.on("message:dispatcher", ({ text, driverId }) => {
        io.to(`driver:${driverId}`).emit("message:dispatcher", {
          from:      user.id,
          fromNom:   `${user.prenom} ${user.nom}`,
          text,
          timestamp: new Date(),
        });
      });

      socket.on("shift:force_end", async ({ driverId }) => {
        io.to(`driver:${driverId}`).emit("shift:forced_end", {
          byUserId:  user.id,
          timestamp: new Date(),
        });
        try {
          await DriverShift.findOneAndUpdate(
            { driverId, status: "ACTIVE" },
            { status: "ABANDONED", endTime: new Date() }
          );
        } catch { /* silencieux */ }
      });
    }
  });
}

module.exports = { initDriverSocket };
