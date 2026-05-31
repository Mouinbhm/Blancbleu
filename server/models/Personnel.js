/**
 * BlancBleu — Modèle Personnel v2.0
 * Transport sanitaire NON urgent
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { encrypt, decrypt } = require("../utils/encryption");

const certificationSchema = new mongoose.Schema(
  {
    nom: { type: String },
    dateObtention: { type: Date },
    dateExpiration: { type: Date },
  },
  { _id: false },
);

const personnelSchema = new mongoose.Schema(
  {
    // ─── Identité ─────────────────────────────────────────────────────────────
    nom: { type: String, required: true, trim: true },
    prenom: { type: String, required: true, trim: true },
    dateNaissance: { type: Date },
    adresse: { type: String, default: "" },
    photoUrl: { type: String, default: "" },

    // ─── Rôle professionnel ───────────────────────────────────────────────────
    role: {
      type: String,
      required: true,
      enum: ["Ambulancier", "Secouriste", "Infirmier", "Médecin", "Chauffeur", "Autre"],
    },

    // ─── Contrat ──────────────────────────────────────────────────────────────
    typeContrat: {
      type: String,
      enum: ["CDI", "CDD", "Intérim", "Stage", "Alternance", ""],
      default: "",
    },
    dateEmbauche: { type: Date },
    // RGPD — données financières sensibles. On garde le Number en clair pour
    // préserver les agrégations Mongo natives ($sum dans le contrôleur compta)
    // et on duplique en string chiffrée AES-256-GCM dans salaire*Enc (shadow
    // storage). La canonicalisation vers le chiffré uniquement est tracée en
    // dette dans docs/rgpd.md. Sync automatique via pre('save') plus bas.
    salaireBrut: { type: Number, default: 0, min: 0 },
    salaireNet: { type: Number, default: 0, min: 0 },
    salaireBrutEnc: { type: String, default: "", select: false },
    salaireNetEnc: { type: String, default: "", select: false },

    // ─── Statut opérationnel ──────────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["Disponible", "En shift", "Congé", "Maladie", "Formation", "Inactif"],
      default: "Disponible",
    },

    // ─── Shift en cours ───────────────────────────────────────────────────────
    currentShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverShift",
      default: null,
    },

    // ─── Véhicule assigné ─────────────────────────────────────────────────────
    uniteAssignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },

    // ─── Lien compte de connexion (optionnel) ─────────────────────────────────
    // Permet de relier un employé métier à un compte User (login) si nécessaire.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ─── Coordonnées ──────────────────────────────────────────────────────────
    telephone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },

    // ─── Permis de conduire ───────────────────────────────────────────────────
    // RGPD — pièce d'identité professionnelle, chiffrée at-rest + select:false.
    numeroPermis: { type: String, default: "", select: false },
    permisExpiration: { type: Date },

    // ─── Certifications & formations ─────────────────────────────────────────
    certifications: { type: [certificationSchema], default: [] },

    // ─── Disponibilités (jours de la semaine) ─────────────────────────────────
    // { Lundi: true, Mardi: false, ... }
    disponibilites: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ─── Divers RH ────────────────────────────────────────────────────────────
    notes: { type: String, default: "" },
    actif: { type: Boolean, default: true },

    // ─── Authentification app chauffeur ───────────────────────────────────────
    password: { type: String, select: false },
    forcePasswordChange: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    fcmToken: { type: String, default: null },
  },
  { timestamps: true },
);

personnelSchema.index({ statut: 1, role: 1 });
personnelSchema.index({ nom: 1, prenom: 1 });
personnelSchema.index({ email: 1 }, { unique: true, sparse: true });

// ── Chiffrement at-rest AES-256-GCM (RGPD) ──────────────────────────────────
// numeroPermis : chiffré transparent.
// salaire*Enc  : shadow chiffré, synchronisé depuis le Number en clair (qui
// reste pour les agrégations natives Mongo cf. comptabiliteController).
personnelSchema.pre("save", function (next) {
  if (this.isModified("numeroPermis") && this.numeroPermis) {
    this.numeroPermis = encrypt(this.numeroPermis);
  }
  if (this.isModified("salaireBrut")) {
    this.salaireBrutEnc = encrypt(String(this.salaireBrut || 0));
  }
  if (this.isModified("salaireNet")) {
    this.salaireNetEnc = encrypt(String(this.salaireNet || 0));
  }
  next();
});
personnelSchema.post("init", function (doc) {
  if (doc.numeroPermis) doc.numeroPermis = decrypt(doc.numeroPermis);
  // salaireBrutEnc / salaireNetEnc : pas déchiffrés automatiquement (le
  // Number en clair est la source canonique pour la lecture). Le déchiffrement
  // explicite reste possible côté caller via require('../utils/encryption').
});

personnelSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Cascade cleanup : pre("findOneAndDelete") ────────────────────────────────
// La route DELETE /api/personnel/:id fait un soft-delete (actif=false). Ce hook
// protège contre les suppressions dures directes : refus si transport actif,
// soft-flag chauffeurDeleted=true sur les Transport historiques.
const TERMINAL_STATUTS_PERSONNEL = ["COMPLETED", "BILLED", "PAID", "CANCELLED", "FAILED"];
personnelSchema.pre("findOneAndDelete", async function (next) {
  try {
    const Transport = mongoose.model("Transport");
    const filter = this.getQuery();
    const personnel = await this.model.findOne(filter).select("_id").lean();
    if (!personnel) return next();

    const activeCount = await Transport.countDocuments({
      chauffeur: personnel._id,
      statut: { $nin: TERMINAL_STATUTS_PERSONNEL },
    });
    if (activeCount > 0) {
      return next(
        new Error(
          `Suppression refusée : ${activeCount} transport(s) actif(s) assigné(s) à ce chauffeur`,
        ),
      );
    }

    await Transport.updateMany(
      { chauffeur: personnel._id },
      { $set: { chauffeurDeleted: true, chauffeurDeletedAt: new Date() } },
    );
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Personnel", personnelSchema);
