const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true },
    prenom: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Email invalide"],
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["dispatcher", "superviseur", "admin", "patient", "comptable"],
      default: "dispatcher",
    },
    actif: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },

    // ── 2FA (TOTP) ────────────────────────────────────────────────────────────
    // Secret actif — chiffré AES-256-GCM, jamais retourné en API
    twoFactorSecret:         { type: String, select: false },
    twoFactorEnabled:        { type: Boolean, default: false },
    // Secret temporaire pendant la phase de configuration (avant confirm)
    twoFactorTempSecret:     { type: String, select: false },
    // Backup codes hashés (bcrypt) — null après utilisation
    twoFactorBackupCodes:    { type: [String], select: false, default: undefined },
    // Date de la dernière vérification 2FA réussie
    twoFactorVerifiedAt:     { type: Date, default: null },
    // true = l'admin DOIT configurer la 2FA à la prochaine connexion
    twoFactorRequired:       { type: Boolean, default: false },
    // true = setup terminé (QR scanné + code confirmé)
    twoFactorSetupCompleted: { type: Boolean, default: false },

    // ── Champs patient ────────────────────────────────────────────────────────
    telephone:      { type: String, default: "" },
    dateNaissance:  { type: Date, default: null },
    adresse:        { type: String, default: "" },
    mobilite: {
      type: String,
      enum: ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"],
      default: "ASSIS",
    },
    medecin:  { type: String, default: "" },
    mutuelle: { type: String, default: "" },
    contactUrgence: {
      nom:       { type: String, default: "" },
      telephone: { type: String, default: "" },
    },

    // FCM token for push notifications (patient app)
    fcmToken: { type: String, default: null },
  },
  { timestamps: true },
);

// Compound unique index: same email can exist once per role
// (e.g. patient + dispatcher can share an email — they are separate account types)
// Partial index on company roles keeps email unique within staff accounts.
userSchema.index(
  { email: 1, role: 1 },
  { unique: true, name: "email_role_unique" },
);

// Pas de hook pre('save') — hash géré manuellement dans les controllers
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
