const mongoose = require("mongoose");

// TTL géré par MongoDB : le document est auto-supprimé après expiresAt
const revokedTokenSchema = new mongoose.Schema({
  jti:       { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date,   required: true, index: { expires: 0 } },
});

module.exports = mongoose.model("RevokedToken", revokedTokenSchema);
