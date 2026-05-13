/**
 * BlancBleu — Patient Socket.IO handler
 *
 * Patients join a personal room `patient:{userId}` so that transport
 * status updates can be pushed to them in real time.
 *
 * Events server → patient app:
 *   transport:status_updated   transport status changed by driver
 *   transport:assigned         transport assigned (vehicle + driver)
 *   transport:cancelled        transport cancelled by dispatcher
 */

function initPatientSocket(io) {
  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) return;

    if (user.role === "patient") {
      socket.join(`patient:${user.id}`);

      // Register/update FCM token for push notifications
      socket.on("patient:fcm_token", async ({ token }) => {
        if (!token) return;
        try {
          const User = require("../models/User");
          await User.findByIdAndUpdate(user.id, { fcmToken: token });
        } catch { /* non-bloquant */ }
      });

      socket.on("disconnect", () => {
        // Room membership is cleaned up automatically by Socket.IO
      });
    }
  });
}

module.exports = { initPatientSocket };
