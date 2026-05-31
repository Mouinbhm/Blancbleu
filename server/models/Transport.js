/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — Modèle Transport v1.0                          ║
 * ║  Transport sanitaire NON urgent                             ║
 * ║  Dialyse · Chimio · RDV médicaux · Hospitalisations        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const mongoose = require("mongoose");
const { STATUTS, LABELS } = require("../services/transportStateMachine");
const Counter = require("./Counter");
const { encrypt, decrypt } = require("../utils/encryption");

const journalSchema = new mongoose.Schema(
  {
    de: { type: String },
    vers: { type: String },
    timestamp: { type: Date, default: Date.now },
    utilisateur: { type: String, default: "système" },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

// Historique riche des changements de statut (PART A)
const statusLogEntrySchema = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    changedByRole: { type: String, default: "système" },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true },
);

// Document PMT attaché au transport (PART C)
const pmtDocumentSchema = new mongoose.Schema(
  {
    fileUrl: { type: String, required: true },
    fileName: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ocrStatus: {
      type: String,
      enum: ["pending", "processing", "done", "error", "skipped"],
      default: "pending",
    },
    extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true },
);

const adresseSchema = new mongoose.Schema(
  {
    nom: { type: String, default: "" },
    rue: { type: String, default: "" },
    ville: { type: String, default: "" },
    codePostal: { type: String, default: "" },
    service: { type: String, default: "" },
    coordonnees: {
      lat: { type: Number },
      lng: { type: Number },
    },
    // GeoJSON Point pour requêtes $near + index 2dsphere. Synchronisé depuis
    // coordonnees par le hook pre('validate') du transportSchema. Pas de default
    // sur `type` ni `coordinates` (default Mongoose Array = [] → GeoJSON invalide
    // rejeté par l'index 2dsphere).
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
  },
  { _id: false },
);

const patientSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true },
    prenom: { type: String, default: "" },
    email: { type: String, default: "" },
    dateNaissance: { type: Date },
    telephone: { type: String, default: "" },
    numeroSecu: { type: String, default: "" },
    mobilite: {
      type: String,
      enum: ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"],
      default: "ASSIS",
    },
    oxygene: { type: Boolean, default: false },
    brancardage: { type: Boolean, default: false },
    accompagnateur: { type: Boolean, default: false },
    // RGPD art. 9 — données médicales chiffrées at-rest (AES-256-GCM).
    // Hooks pre('save')/post('init') déclarés sur le subdoc plus bas — fires
    // automatiquement quand le parent Transport est sauvegardé/hydraté.
    // select:false sur la path `patient.antecedents` est appliqué via le
    // sub-schema (les readers font `.select("+patient.antecedents ...")`).
    antecedents: { type: String, default: "", select: false },
    allergies: { type: String, default: "", select: false },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

// ── Chiffrement at-rest du subdoc patient (RGPD art. 9) ──────────────────────
// Les hooks sur subSchema fires automatiquement quand le parent Transport
// save / init. isModified suit le path complet `antecedents` au niveau du
// subdoc lui-même (pas `patient.antecedents`).
patientSchema.pre("save", function (next) {
  if (this.isModified("antecedents") && this.antecedents) {
    this.antecedents = encrypt(this.antecedents);
  }
  if (this.isModified("allergies") && this.allergies) {
    this.allergies = encrypt(this.allergies);
  }
  next();
});
patientSchema.post("init", function (doc) {
  if (doc.antecedents) doc.antecedents = decrypt(doc.antecedents);
  if (doc.allergies) doc.allergies = decrypt(doc.allergies);
});

const prescriptionSchema = new mongoose.Schema(
  {
    numero: { type: String, default: "" },
    medecin: { type: String, default: "" },
    dateEmission: { type: Date },
    dateExpiration: { type: Date },
    motif: { type: String, default: "" },
    validee: { type: Boolean, default: false },
    fichierUrl: { type: String, default: "" },
    extractionIA: { type: mongoose.Schema.Types.Mixed },
    // Champs ajoutés pour la validation IA+HUMAIN
    contenu: { type: mongoose.Schema.Types.Mixed },
    extraitPar: { type: String, default: "" },
    validePar: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    valideAt: { type: Date, default: null },
  },
  { _id: false },
);

const transportSchema = new mongoose.Schema(
  {
    numero: { type: String, unique: true, index: true },

    // ── Patient ───────────────────────────────────────────────────────────────
    patient: {
      type: patientSchema,
      required: [true, "Les informations patient sont obligatoires"],
    },

    // ── Type & Motif ──────────────────────────────────────────────────────────
    typeTransport: {
      type: String,
      enum: ["VSL", "AMBULANCE", "TPMR"],
      required: [true, "Le type de transport est obligatoire"],
    },
    motif: {
      type: String,
      enum: [
        "Dialyse",
        "Chimiothérapie",
        "Radiothérapie",
        "Consultation",
        "Hospitalisation",
        "Sortie hospitalisation",
        "Rééducation",
        "Analyse",
        "Autre",
      ],
      required: [true, "Le motif est obligatoire"],
    },

    // ── Planification ─────────────────────────────────────────────────────────
    dateTransport: { type: Date, required: [true, "La date est obligatoire"] },
    heureRDV: {
      type: String,
      required: [true, "L'heure de RDV est obligatoire"],
    },
    heureDepart: { type: String, default: "" },
    allerRetour: { type: Boolean, default: false },

    recurrence: {
      active: { type: Boolean, default: false },
      frequence: { type: String, default: "" },
      joursSemaine: [{ type: Number, min: 1, max: 7 }],
      dateFin: { type: Date },
    },

    // ── Adresses ──────────────────────────────────────────────────────────────
    adresseDepart: { type: adresseSchema, required: true },
    adresseDestination: { type: adresseSchema, required: true },

    // ── Prescription ─────────────────────────────────────────────────────────
    prescription: { type: prescriptionSchema, default: () => ({}) },

    // ── Statut ────────────────────────────────────────────────────────────────
    statut: {
      type: String,
      enum: Object.values(STATUTS),
      default: STATUTS.REQUESTED,
      index: true,
    },

    // ── Affectation ───────────────────────────────────────────────────────────
    vehicule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    chauffeur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Personnel",
      default: null,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverShift",
      default: null,
    },
    scoreDispatch: { type: Number, default: null },

    // ── Recommandation IA Dispatch ────────────────────────────────────────────
    // Sous-doc dénormalisé conservé pour rétrocompat (frontend, anciens callers).
    // L'historique complet est désormais dans la collection DispatchRecommendation.
    aiDispatch: {
      recommendedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
      recommendedDriverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Personnel",
        default: null,
      },
      vehicleName: { type: String, default: "" },
      driverName: { type: String, default: "" },
      score: { type: Number, default: null }, // 0-100
      criteriaScores: { type: mongoose.Schema.Types.Mixed, default: null },
      explanation: [{ type: String }],
      risks: [{ type: String }],
      warnings: [{ type: String }],
      source: { type: String, default: "ia" }, // "ia" | "fallback"
      fallbackUsed: { type: Boolean, default: false },
      generatedAt: { type: Date, default: null },
      acceptedByDispatcher: { type: Boolean, default: null },
      acceptedAt: { type: Date, default: null },
      rejectedReason: { type: String, default: "" },
      // Référence vers le document DispatchRecommendation correspondant
      lastRecommendationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DispatchRecommendation",
        default: null,
      },
    },

    // ── Horodatages ───────────────────────────────────────────────────────────
    heureConfirmation: { type: Date },
    heurePlanification: { type: Date },
    heureAssignation: { type: Date },
    // ── Horodatages v1.2 — acceptation/refus chauffeur ────────────────────
    heureAcceptationChauffeur: { type: Date },
    heureRefusChauffeur: { type: Date },
    // ─────────────────────────────────────────────────────────────────────
    heureEnRoute: { type: Date },
    heurePriseEnCharge: { type: Date },
    heureArriveeDestination: { type: Date },
    // ── Horodatages v1.1 ─────────────────────────────────────────────────
    heureDebutAttente: { type: Date }, // WAITING_AT_DESTINATION
    heureDepartRetour: { type: Date }, // RETURN_TO_BASE
    heureFacturation: { type: Date }, // BILLED
    // ── Horodatages v1.2 — facturation étendue ────────────────────────────
    heureBillingPending: { type: Date },
    heurePaiement: { type: Date }, // PAID
    heureEchec: { type: Date }, // FAILED
    // ─────────────────────────────────────────────────────────────────────
    heureTerminee: { type: Date },
    heureAnnulation: { type: Date },
    heureReprogrammation: { type: Date },

    dureeReelleMinutes: { type: Number, default: null },
    // Durée estimée de l'attente sur place (saisie chauffeur, en minutes)
    dureeAttenteMinutes: { type: Number, default: null },

    // ── Aller-retour ──────────────────────────────────────────────────────────
    transportRetour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
    },

    // ── Série récurrente ──────────────────────────────────────────────────────
    transportParent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
    },
    indexSerie: { type: Number, default: null },

    // ── Patient ref (entité propre) ───────────────────────────────────────────
    // Si le patient est enregistré en base, on stocke son ID ici.
    // Le sous-document patient reste pour la rétrocompatibilité et l'archivage.
    // Note: pas d'index single ici — couvert par le composite { patientId, statut }
    // ajouté plus bas (préfixe gauche sert aussi les requêtes patientId seul).
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },

    // ── Prescription ref (entité propre) ──────────────────────────────────────
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      default: null,
    },

    // ── Facturation ───────────────────────────────────────────────────────────
    tauxPriseEnCharge: { type: Number, default: 65 },
    facture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facture",
      default: null,
    },
    // ── Lock de génération de facture (idempotence + anti race condition) ───
    // Posé atomiquement par invoiceService.createInvoiceFromTransport via
    // findOneAndUpdate avant le calcul tarifaire. Si la création échoue,
    // factureGenerationError est renseigné et factureGenerated/LockedAt
    // sont retirés ($unset) pour permettre un retry admin via
    // POST /api/admin/factures/retry/:transportId. Cf. docs/security.md.
    factureGenerated: { type: Boolean, default: false },
    factureLockedAt: { type: Date, default: null },
    factureGenerationError: { type: String, default: null },
    // Référence texte CPAM (ex : "PMT-20260424-0002", "FAC-2026-0087")
    // Distincte du champ facture (ObjectId) — jamais casté en ObjectId
    referenceFactureCPAM: {
      type: String,
      default: null,
    },

    // ── Annulation / NO_SHOW / FAILED ─────────────────────────────────────────
    raisonAnnulation: { type: String, default: "" },
    raisonNoShow: { type: String, default: "" },
    raisonReprogrammation: { type: String, default: "" },
    raisonEchec: { type: String, default: "" },
    nouvelleDate: { type: Date, default: null },

    // ── Journal ───────────────────────────────────────────────────────────────
    journal: [journalSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
    notes: { type: String, default: "" },

    // ── Cascade soft-flags ───────────────────────────────────────────────────
    // Renseignés par les hooks pre("findOneAndDelete") de Vehicle/Personnel
    // quand l'entité référencée est supprimée. Le Transport est préservé pour
    // l'audit/facturation, mais le front peut afficher "véhicule retiré".
    vehiculeDeleted: { type: Boolean, default: false },
    vehiculeDeletedAt: { type: Date, default: null },
    chauffeurDeleted: { type: Boolean, default: false },
    chauffeurDeletedAt: { type: Date, default: null },

    // ── Origine de la demande ─────────────────────────────────────────────────
    origine: { type: String, default: "" },

    // ── Driver app fields ─────────────────────────────────────────────────────
    statusHistory: [
      {
        status: { type: String },
        timestamp: { type: Date, default: Date.now },
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", default: null },
        note: { type: String, default: "" },
        _id: false,
      },
    ],
    driverSignedAt: { type: Date, default: null },
    patientSignatureBase64: { type: String, default: null },
    driverSignatureBase64: { type: String, default: null },
    pmtPhotoUrl: { type: String, default: null },
    estimatedArrival: { type: Date, default: null },
    actualPickupTime: { type: Date, default: null },
    actualDropoffTime: { type: Date, default: null },

    // ── PART A : Historique riche des statuts ─────────────────────────────────
    statusLog: [statusLogEntrySchema],

    // ── PART B : Preuve de prise en charge / Signature patient ────────────────
    proofOfCare: {
      signed: { type: Boolean, default: false },
      signedAt: { type: Date, default: null },
      signedByName: { type: String, default: "" },
      signatureImageUrl: { type: String, default: "" }, // chemin fichier
      signatureBase64: { type: String, default: "" }, // fallback base64 (max 2 MB)
      driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", default: null },
      patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null },
      consentText: {
        type: String,
        default: "Je certifie avoir été transporté conformément à ma demande.",
      },
    },

    // ── PART C : Documents PMT attachés ──────────────────────────────────────
    pmtDocuments: [pmtDocumentSchema],
  },
  { timestamps: true },
);

// ── Index ─────────────────────────────────────────────────────────────────────
transportSchema.index({ statut: 1, dateTransport: 1 });
transportSchema.index({ "patient.nom": 1 });
transportSchema.index({ vehicule: 1, dateTransport: 1 });
transportSchema.index({ createdAt: -1 });
// 2dsphere sur les adresses pour les requêtes géospatiales (calcul ETA, dispatch)
transportSchema.index({ "adresseDepart.location": "2dsphere" });
transportSchema.index({ "adresseDestination.location": "2dsphere" });
// Composites pour les patterns fréquents : missions par chauffeur sur une période,
// historique patient filtré par statut, planning trié par heure RDV.
transportSchema.index({ chauffeur: 1, dateTransport: -1 });
transportSchema.index({ patientId: 1, statut: 1 });
transportSchema.index({ heureRDV: 1 });

// Dual-write coords → GeoJSON sur les deux sous-docs adresse.
// Le hook s'exécute à chaque validate (donc avant save) — couvre create + update.
function syncAdresseLocation(adresse) {
  if (!adresse) return;
  const lat = adresse.coordonnees?.lat;
  const lng = adresse.coordonnees?.lng;
  if (typeof lat === "number" && typeof lng === "number") {
    adresse.location = { type: "Point", coordinates: [lng, lat] };
  }
}
transportSchema.pre("validate", function (next) {
  syncAdresseLocation(this.adresseDepart);
  syncAdresseLocation(this.adresseDestination);
  next();
});

// ── Règle métier : mobilité patient → type véhicule ──────────────────────────
// Bug corrigé : la mobilité est portée par patient.mobilite, pas this.mobilite
transportSchema.pre("validate", function (next) {
  const mobilite = this.patient?.mobilite;
  const typeTransport = this.typeTransport;
  if (!mobilite || !typeTransport) return next();
  if (mobilite === "ASSIS" && typeTransport === "AMBULANCE")
    return next(new Error("Patient ASSIS → VSL ou TPMR requis, pas AMBULANCE"));
  if (mobilite === "FAUTEUIL_ROULANT" && typeTransport === "AMBULANCE")
    return next(new Error("Fauteuil roulant → TPMR requis, pas AMBULANCE"));
  if (["ALLONGE", "CIVIERE"].includes(mobilite) && typeTransport !== "AMBULANCE")
    return next(new Error("Patient allongé/civière → AMBULANCE requise"));
  next();
});

// ── Numéro automatique — compteur atomique (évite les doublons) ───────────────
transportSchema.pre("save", async function (next) {
  if (!this.numero) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const counter = await Counter.findOneAndUpdate(
      { _id: "transport" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.numero = `TRS-${date}-${String(counter.seq).padStart(4, "0")}`;
  }
  next();
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
transportSchema.virtual("label").get(function () {
  return LABELS[this.statut]?.fr || this.statut;
});
transportSchema.virtual("progression").get(function () {
  // Miroir exact de TransportStateMachine.progression() — mis à jour en v1.2
  const ordre = [
    "REQUESTED",
    "CONFIRMED",
    "SCHEDULED",
    "ASSIGNED",
    "DRIVER_ACCEPTED",
    "EN_ROUTE_TO_PICKUP",
    "ARRIVED_AT_PICKUP",
    "PATIENT_ON_BOARD",
    "ARRIVED_AT_DESTINATION",
    "WAITING_AT_DESTINATION",
    "RETURN_TO_BASE",
    "COMPLETED",
    "BILLING_PENDING",
    "BILLED",
    "PAID",
  ];
  const idx = ordre.indexOf(this.statut);
  return idx === -1 ? null : Math.round((idx / (ordre.length - 1)) * 100);
});
transportSchema.virtual("estTermine").get(function () {
  return [
    "COMPLETED",
    "BILLING_PENDING",
    "BILLED",
    "PAID",
    "CANCELLED",
    "NO_SHOW",
    "FAILED",
  ].includes(this.statut);
});
transportSchema.set("toJSON", { virtuals: true });
transportSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Transport", transportSchema);
