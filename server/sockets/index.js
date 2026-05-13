/**
 * BlancBleu — Central Socket.IO event hub
 *
 * Initializes all socket handlers in order:
 *   1. driverSocket  — driver app events (location, status, messaging)
 *   2. patientSocket — patient app room management + FCM token registration
 */

const { initDriverSocket }  = require("./driverSocket");
const { initPatientSocket } = require("./patientSocket");

function initSockets(io) {
  initDriverSocket(io);
  initPatientSocket(io);
}

module.exports = { initSockets };
