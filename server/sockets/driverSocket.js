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
 *   driver:location        { lat, lng, speed, shiftId, vehicleId }
 *   driver:status          { status }
 *   message:driver         { text, dispatcherId }
 */

const TrackingPoint = require("../models/TrackingPoint");
const DriverShift   = require("../models/DriverShift");
const Message       = require("../models/Message");
// Sprint M2 — snapshot des positions vit dans Redis (cf. vehiclePositionStore)
// pour supporter le scaling multi-instance. La Map en mémoire est conservée
// comme fallback dans le store quand Redis n'est pas dispo.
const vehiclePositionStore = require("./vehiclePositionStore");

// Build a display name from JWT fields; fall back to email or a generic label
function displayName(user) {
  const full = `${user.prenom || ""} ${user.nom || ""}`.trim();
  return full || user.email || `Chauffeur #${String(user.id).slice(-4)}`;
}

function initDriverSocket(io) {
  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) return;

    // Driver joins their personal room
    if (user.type === "personnel" || user.role === "driver" || user.role === "ambulancier") {
      socket.join(`driver:${user.id}`);
      io.to("role:dispatcher").to("role:admin").emit("driver:online", {
        driverId:  user.id,
        driverNom: displayName(user),
        timestamp: new Date(),
      });

      socket.on("disconnect", () => {
        io.to("role:dispatcher").to("role:admin").emit("driver:offline", {
          driverId:  user.id,
          timestamp: new Date(),
        });
      });

      // ── driver:location ───────────────────────────────────────────────────
      socket.on("driver:location", async ({ lat, lng, speed = 0, shiftId, transportId, vehicleId }) => {
        try {
          if (!shiftId) return;

          await TrackingPoint.create({
            driverId:    user.id,
            shiftId,
            transportId: transportId || null,
            lat, lng, speed,
            timestamp:   new Date(),
          });

          const posPayload = {
            driverId:  user.id,
            driverNom: displayName(user),
            vehicleId: vehicleId || null,
            lat, lng, speed,
            shiftId,
            timestamp: new Date(),
          };

          // Persist snapshot (Redis si dispo, sinon Map mémoire — cf. store).
          // Best-effort : ne bloque jamais l'emit GPS.
          if (vehicleId) {
            vehiclePositionStore.set(vehicleId, posPayload).catch(() => {});
          }

          const STAFF_ROOMS = ["role:dispatcher", "role:admin", "role:superviseur"];

          // Legacy event kept for backward compatibility
          io.to(STAFF_ROOMS).emit("driver:location_updated", posPayload);

          // New event consumed by the Suivi en direct live map
          io.to(STAFF_ROOMS).emit("vehicle:position", posPayload);

          // Sprint M1 — route le GPS vers la room transport pour le suivi
          // patient temps réel. Le patient a join:transport:{id} via le
          // tracking_screen côté app et reçoit ce même event que la route
          // HTTP /api/tracking/batch émet.
          if (transportId) {
            io.to(`transport:${transportId}`).emit("tracking:gps_updated", {
              transportId,
              lat, lng, speed,
              timestamp: new Date(),
            });
          }
        } catch { /* non-bloquant */ }
      });

      // ── driver:status ─────────────────────────────────────────────────────
      socket.on("driver:status", ({ status }) => {
        io.to("role:dispatcher").to("role:admin").emit("driver:status_changed", {
          driverId:  user.id,
          driverNom: displayName(user),
          status,
          timestamp: new Date(),
        });
      });

      // ── message:driver ────────────────────────────────────────────────────
      socket.on("message:driver", async ({ text, dispatcherId, localId }) => {
        try {
          const saved = await Message.create({
            driverId:     user.id,
            dispatcherId: dispatcherId || null,
            fromDriver:   true,
            text:         String(text || "").trim().slice(0, 1000),
          });

          const payload = {
            messageId: saved._id.toString(),
            from:      user.id,
            fromNom:   displayName(user),
            text:      saved.text,
            timestamp: saved.createdAt,
          };

          if (dispatcherId) {
            // Target a specific dispatcher by their personal room
            io.to(`user:${dispatcherId}`).emit("message:driver", payload);
          } else {
            io.to("role:dispatcher").emit("message:driver", payload);
          }

          // Confirm delivery to the driver
          socket.emit("message:delivered", {
            messageId: saved._id.toString(),
            localId:   localId || null,
          });
        } catch {
          socket.emit("message:delivered", { error: true, localId: localId || null });
        }
      });
    }

    // ── Dispatcher sends message to driver ───────────────────────────────────
    if (["dispatcher", "admin", "superviseur"].includes(user.role)) {
      socket.on("message:dispatcher", async ({ text, driverId }) => {
        try {
          const saved = await Message.create({
            driverId:     driverId,
            dispatcherId: user.id,
            fromDriver:   false,
            text:         String(text || "").trim().slice(0, 1000),
          });
          io.to(`driver:${driverId}`).emit("message:dispatcher", {
            messageId: saved._id.toString(),
            from:      user.id,
            fromNom:   displayName(user),
            text:      saved.text,
            timestamp: saved.createdAt,
          });
        } catch {
          io.to(`driver:${driverId}`).emit("message:dispatcher", {
            from:      user.id,
            fromNom:   displayName(user),
            text:      String(text || ""),
            timestamp: new Date(),
          });
        }
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
