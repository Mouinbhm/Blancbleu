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
    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },

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
