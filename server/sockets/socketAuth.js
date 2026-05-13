const jwt       = require("jsonwebtoken");
const cookieLib  = require("cookie");

/**
 * Socket.IO authentication middleware.
 * Reads JWT from:
 *   1. socket.handshake.auth.token
 *   2. Authorization: Bearer <token> header
 *   3. bb_access httpOnly cookie
 */
function socketAuthMiddleware(socket, next) {
  let raw =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

  if (!raw && socket.handshake.headers.cookie) {
    const cookies = cookieLib.parse(socket.handshake.headers.cookie);
    raw = cookies.bb_access;
  }

  if (!raw) return next(new Error("Non autorisé"));
  try {
    socket.user = jwt.verify(raw, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("Non autorisé"));
  }
}

module.exports = { socketAuthMiddleware };
