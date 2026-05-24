const crypto = require("crypto");
const logger = require("./logger");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. " +
        "Generate with: node -e \"logger.info(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length}). ` +
        "Regenerate with: node -e \"logger.info(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return buf;
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns empty string for empty/null input.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
function encrypt(plaintext) {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by encrypt().
 * Returns empty string for empty/null input or decryption failure.
 * Passes through unencrypted legacy values (no ':' separator) unchanged.
 */
function decrypt(ciphertext) {
  if (!ciphertext) return "";
  // Legacy unencrypted value (stored before encryption was added)
  if (!ciphertext.includes(":")) return ciphertext;
  try {
    const key = getKey();
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return "";
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Corrupted ciphertext — return empty rather than throw
    return "";
  }
}

module.exports = { encrypt, decrypt };
