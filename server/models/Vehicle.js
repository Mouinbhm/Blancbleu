/**
 * BlancBleu — Modèle Vehicle v1.0
 * Véhicule de transport sanitaire non urgent
 * Remplace Unit.js (urgences)
 */
const mongoose = require("mongoose");
const { normalizeStatut } = require("../utils/vehicleStatut");

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lng: { type: Number },
    adresse: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const vehicleSchema = new mongoose.Schema(
  {
    // ── Identification ────────────────────────────────────────────────────────
    immatriculation: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    nom: { type: String, required: true, trim: true },

    // ── Type véhicule ─────────────────────────────────────────────────────────
    type: {
      type: String,
      required: true,
      enum: ["VSL", "AMBULANCE", "TPMR"],
      index: true,
    },

    // Capacités
    capacitePassagers: { type: Number, default: 1 },
    equipeFauteuil: { type: Boolean, default: false }, // rampe/hayon
    equipeOxygene: { type: Boolean, default: false },
    equipeBrancard: { type: Boolean, default: false },

    // ── Statut opérationnel ───────────────────────────────────────────────────
    statut: {
      type: String,
      enum: ["Disponible", "En service", "Maintenance", "Hors service"],
      default: "Disponible",
      index: true,
    },

    // ── Shift et personnel en cours ───────────────────────────────────────────
    currentShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverShift",
      default: null,
    },
    currentPersonnelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Personnel",
      default: null,
    },

    // ── Chauffeur principal assigné ───────────────────────────────────────────
    chauffeurAssigne: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Personnel",
      default: null,
    },

    // ── Position GPS ─────────────────────────────────────────────────────────
    // position : ancien format { lat, lng, adresse, updatedAt } — gardé pour
    // compatibilité frontend Leaflet (réponse JSON). La recherche géospatiale
    // utilise désormais le champ `location` (GeoJSON Point + index 2dsphere).
    position: { type: locationSchema, default: () => ({}) },
    // GeoJSON Point — pas de default sur `type` pour éviter un sous-doc invalide
    // sans coordonnées (rejeté par l'index 2dsphere). Le hook pre('save') le remplit.
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat] — ordre GeoJSON
    },
    baseAdresse: { type: String, default: "59 Bd Madeleine, Nice" },
    basePosition: {
      lat: { type: Number, default: 43.7102 },
      lng: { type: Number, default: 7.262 },
    },

    // ── Métriques ─────────────────────────────────────────────────────────────
    // Changed from flat Number to nested object for maintenance tracking
    kilometrage: {
      actuel:          { type: Number, default: 0, min: 0 },
      dernierControle: { type: Number, default: 0 },
      prochainVidange: { type: Number },
      prochainControle:{ type: Number },
    },
    carburant: { type: Number, default: 100, min: 0, max: 100 },
    annee: { type: Number, min: 2000 },
    tauxPonctualite: { type: Number, default: 95, min: 0, max: 100 },

    // ── Transport en cours ────────────────────────────────────────────────────
    transportEnCours: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
    },

    // ── Identification étendue ────────────────────────────────────────────────────
    marque:      { type: String, trim: true, default: "" },
    modele:      { type: String, trim: true, default: "" },
    couleur:     { type: String, trim: true, default: "" },
    numeroSerie: { type: String, trim: true, default: "" },
    actif:       { type: Boolean, default: true },

    // ── Motorisation ──────────────────────────────────────────────────────────────
    typeEnergie: {
      type: String,
      enum: ["Diesel", "Essence", "Hybride", "Electrique", "GPL", "Hydrogène"],
      default: "Diesel",
    },
    consommationL100: { type: Number, min: 0, max: 30 },
    autonomieKm:      { type: Number, min: 0 },
    puissanceCv:      { type: Number, min: 0 },

    // ── Contrôles réglementaires ──────────────────────────────────────────────────
    controleTechnique: {
      dateExpiration: { type: Date },
      rappel30j:      { type: Boolean, default: true },
    },
    assurance: {
      compagnie:      { type: String, trim: true, default: "" },
      numeroPolice:   { type: String, trim: true, default: "" },
      dateExpiration: { type: Date },
      rappel30j:      { type: Boolean, default: true },
    },
    vignetteControlePollution: {
      categorie:      { type: String, enum: ["Crit'Air 1", "Crit'Air 2", "Crit'Air 3", "Non classé"] },
      dateExpiration: { type: Date },
    },

    // ── Équipements médicaux ──────────────────────────────────────────────────────
    equipements: {
      oxygene:       { type: Boolean, default: false },
      fauteuilRampe: { type: Boolean, default: false },
      brancard:      { type: Boolean, default: false },
      dae:           { type: Boolean, default: false },
      aspirateur:    { type: Boolean, default: false },
      chauffage:     { type: Boolean, default: false },
      climatisation: { type: Boolean, default: false },
    },

    // ── Capacité ──────────────────────────────────────────────────────────────────
    capacite: {
      placesAssises:  { type: Number, default: 1, min: 1, max: 6 },
      placesFauteuil: { type: Number, default: 0, min: 0, max: 2 },
      placesBrancard: { type: Number, default: 0, min: 0, max: 1 },
    },

    // ── Garage d'attache ──────────────────────────────────────────────────────────
    garage: {
      nom:     { type: String, default: "Garage principal" },
      adresse: { type: String, default: "59 Bd Madeleine, Nice" },
      lat:     { type: Number, default: 43.7102 },
      lng:     { type: Number, default: 7.262 },
    },

    notes:     { type: String, default: "" },
    deletedAt: { type: Date, default: null },

    // ── Métriques performance (PHASE 1) ───────────────────────────────────────
    // Calculées et mises en cache via recalculateVehicleMetrics()
    vehicleMetrics: {
      totalKm:           { type: Number, default: 0 },
      monthlyKm:         { type: Number, default: 0 },
      totalMissions:     { type: Number, default: 0 },
      completedMissions: { type: Number, default: 0 },
      cancelledMissions: { type: Number, default: 0 },
      totalWorkingHours: { type: Number, default: 0 },
      totalIdleHours:    { type: Number, default: 0 },
      estimatedCost:     { type: Number, default: 0 },
      lastMetricUpdate:  { type: Date,   default: null },
    },

    // ── Informations maintenance enrichies (PHASE 1) ──────────────────────────
    maintenanceInfo: {
      lastMaintenanceDate:     { type: Date,   default: null },
      nextMaintenanceDate:     { type: Date,   default: null },
      nextMaintenanceKm:       { type: Number, default: null },
      maintenanceIntervalKm:   { type: Number, default: 15000 },
      maintenanceIntervalDays: { type: Number, default: 365 },
      maintenanceStatus: {
        type:    String,
        enum:    ["ok", "soon", "urgent", "overdue"],
        default: "ok",
      },
    },

    // ── Disponibilité opérationnelle (PHASE 1) ────────────────────────────────
    availability: {
      currentStatus: {
        type:    String,
        enum:    ["available", "in_mission", "maintenance", "out_of_service"],
        default: "available",
      },
      currentTransportId: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     "Transport",
        default: null,
      },
      availableFrom:     { type: Date,   default: null },
      unavailableReason: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

vehicleSchema.index({ statut: 1, type: 1 });
// Ancien index sur position.lat/lng remplacé par 2dsphere sur location (GeoJSON).
vehicleSchema.index({ location: "2dsphere" });
vehicleSchema.index({ "maintenanceInfo.nextMaintenanceDate": 1 });
vehicleSchema.index({ "availability.currentTransportId": 1 });

// Normalize legacy / lowercase statut values before every save and validation
vehicleSchema.pre("validate", function (next) {
  if (this.statut) {
    const normalized = normalizeStatut(this.statut);
    if (normalized) this.statut = normalized;
    // If not recognized, leave it unchanged so Mongoose enum validation produces the right error
  }
  next();
});

// Dual-write : synchroniser position {lat,lng} → location GeoJSON {type:"Point", coordinates:[lng,lat]}
// Le frontend continue de consommer `position`; les requêtes $near utilisent `location`.
vehicleSchema.pre("save", function (next) {
  if (this.position?.lat != null && this.position?.lng != null) {
    this.location = {
      type: "Point",
      coordinates: [this.position.lng, this.position.lat],
    };
  }
  next();
});

module.exports = mongoose.model("Vehicle", vehicleSchema);
