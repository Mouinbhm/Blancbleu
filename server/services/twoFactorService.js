/**
 * BlancBleu — Service 2FA (TOTP + Backup Codes)
 *
 * Responsabilités :
 *  - Chiffrement / déchiffrement AES-256-GCM des secrets TOTP
 *  - Génération et vérification des codes TOTP via speakeasy
 *  - Génération, hashage et vérification des backup codes
 *
 * Variable d'environnement requise en production :
 *   TOTP_ENCRYPTION_KEY  — chaîne hexadécimale de 64 caractères (256 bits)
 *
 * En l'absence de TOTP_ENCRYPTION_KEY, les secrets sont stockés en base32
 * (mode développement) — un avertissement est émis au démarrage.
 */

const crypto   = require("crypto");
const bcrypt   = require("bcryptjs");
const speakeasy = require("speakeasy");

// ── Constantes ────────────────────────────────────────────────────────────────
const ALGORITHM        = "aes-256-gcm";
const IV_LENGTH        = 12;   // 96 bits — recommandé pour GCM
const AUTH_TAG_LENGTH  = 16;   // 128 bits
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LEN   = 10;  // 5+5 chars → "ABCDE-12345"
const BACKUP_BCRYPT_ROUNDS = 10;
const TOTP_WINDOW       = 1;   // ±1 période (±30 s) — tolère le décalage horaire

// ── Clé de chiffrement ────────────────────────────────────────────────────────
let _encryptionKey = null;

function _getKey() {
  if (_encryptionKey) return _encryptionKey;

  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[2FA] TOTP_ENCRYPTION_KEY manquante ou invalide — doit être une chaîne hex de 64 chars (256 bits)"
      );
    }
    // Mode dev : avertissement + clé fictive
    if (!raw) {
      console.warn(
        "[2FA] TOTP_ENCRYPTION_KEY non définie — les secrets TOTP sont stockés NON CHIFFRÉS. " +
        "Définissez TOTP_ENCRYPTION_KEY en production."
      );
    }
    return null; // signale l'absence de clé
  }

  _encryptionKey = Buffer.from(raw, "hex");
  return _encryptionKey;
}

// ── Chiffrement / Déchiffrement ───────────────────────────────────────────────

/**
 * Chiffre un secret TOTP (base32) en AES-256-GCM.
 * Retourne une chaîne au format "iv:authTag:ciphertext" (hex).
 * Si la clé est absente (dev), retourne la valeur brute préfixée de "raw:".
 */
function encryptSecret(plaintext) {
  const key = _getKey();
  if (!key) return `raw:${plaintext}`;

  const iv         = crypto.randomBytes(IV_LENGTH);
  const cipher     = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Déchiffre un secret TOTP stocké.
 * Accepte le format "iv:authTag:ciphertext" ou "raw:<valeur>" (dev).
 */
function decryptSecret(stored) {
  if (!stored) return null;

  if (stored.startsWith("raw:")) {
    return stored.slice(4);
  }

  const key = _getKey();
  if (!key) {
    // Ancien stockage raw sans préfixe (migration)
    return stored;
  }

  const parts = stored.split(":");
  if (parts.length !== 3) {
    // Stockage legacy non chiffré (migration)
    return stored;
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv         = Buffer.from(ivHex, "hex");
  const authTag    = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

// ── TOTP ──────────────────────────────────────────────────────────────────────

/**
 * Génère un nouveau secret TOTP pour un utilisateur.
 * Retourne { base32, otpauthUrl } — ne stocke rien en base.
 */
function generateTotpSecret(email) {
  const secret = speakeasy.generateSecret({
    name:   `BlancBleu (${email})`,
    issuer: "Ambulances Blanc Bleu",
    length: 32,
  });
  return {
    base32:      secret.base32,
    otpauthUrl:  secret.otpauth_url,
  };
}

/**
 * Vérifie un code TOTP contre un secret chiffré stocké en base.
 */
function verifyTotp(encryptedSecret, token) {
  if (!encryptedSecret || !token) return false;
  const plain = decryptSecret(encryptedSecret);
  if (!plain) return false;
  return speakeasy.totp.verify({
    secret:   plain,
    encoding: "base32",
    token:    String(token).replace(/\s/g, ""),
    window:   TOTP_WINDOW,
  });
}

// ── Backup codes ──────────────────────────────────────────────────────────────

/**
 * Génère BACKUP_CODE_COUNT codes de secours aléatoires.
 * Retourne { plain: string[], hashed: string[] }
 * plain  → à retourner UNE SEULE FOIS à l'utilisateur
 * hashed → à stocker en base (bcrypt)
 */
async function generateBackupCodes() {
  const plain = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(BACKUP_CODE_LEN).toString("base64url").slice(0, 10).toUpperCase();
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }

  const hashed = await Promise.all(
    plain.map((code) => bcrypt.hash(code.replace("-", ""), BACKUP_BCRYPT_ROUNDS))
  );

  return { plain, hashed };
}

/**
 * Vérifie un backup code contre la liste hashée.
 * Retourne l'index du code utilisé, ou -1 si invalide.
 * Le code fourni est normalisé (majuscules, tiret retiré).
 */
async function verifyAndConsumeBackupCode(inputCode, hashedCodes) {
  const normalized = String(inputCode).replace(/[\s\-]/g, "").toUpperCase();
  if (!normalized || !hashedCodes?.length) return -1;

  for (let i = 0; i < hashedCodes.length; i++) {
    if (!hashedCodes[i]) continue; // code déjà utilisé (null)
    const match = await bcrypt.compare(normalized, hashedCodes[i]);
    if (match) return i;
  }
  return -1;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  verifyTotp,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
};
