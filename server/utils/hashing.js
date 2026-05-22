const crypto = require("crypto");

function getHmacKey() {
  const raw = process.env.HASH_KEY || process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("HASH_KEY or ENCRYPTION_KEY required");
  return Buffer.from(raw, "base64");
}

exports.hashDeterministic = (value) => {
  if (!value) return "";
  return crypto.createHmac("sha256", getHmacKey())
    .update(String(value).trim()).digest("hex");
};
