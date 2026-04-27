const Joi = require("joi");

// ─── Intervention ─────────────────────────────────────────────────────────────
const TYPES_INCIDENTS = [
  "Arrêt cardiaque",
  "AVC",
  "Détresse respiratoire",
  "Douleur thoracique",
  "Traumatisme grave",
  "Accident de la route",
  "Intoxication",
  "Accouchement",
  "Malaise",
  "Brûlure",
  "Chute",
  "Autre",
];

const PRIORITES = ["P1", "P2", "P3"];

const ETATS_PATIENT = [
  "conscient",
  "inconscient",
  "critique",
  "stable",
  "inconnu",
];

const patientSchema = Joi.object({
  nom: Joi.string().max(100).default("Inconnu"),
  age: Joi.number().integer().min(0).max(150).allow(null),
  sexe: Joi.string().valid("M", "F", "inconnu").default("inconnu"),
  etat: Joi.string()
    .valid(...ETATS_PATIENT)
    .default("inconnu"),
  symptomes: Joi.array().items(Joi.string().max(100)).max(20).default([]),
  nbVictimes: Joi.number().integer().min(1).max(500).default(1),
  antecedents: Joi.string().max(500).allow("").default(""),
});

const coordonneesSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

// Création d'une intervention
const createInterventionSchema = Joi.object({
  typeIncident: Joi.string()
    .valid(...TYPES_INCIDENTS)
    .required()
    .messages({
      "any.only": `Type d'incident invalide. Valeurs : ${TYPES_INCIDENTS.join(", ")}`,
    }),

  adresse: Joi.string()
    .min(5)
    .max(300)
    .required()
    .messages({
      "string.min": "L'adresse doit contenir au moins 5 caractères",
    }),

  priorite: Joi.string()
    .valid(...PRIORITES)
    .default("P2"),

  coordonnees: coordonneesSchema.allow(null).default(null),

  patient: patientSchema.default({}),

  unitAssignee: Joi.string().hex().length(24).allow(null).default(null),

  notes: Joi.string().max(1000).allow("").default(""),
});

// Mise à jour d'une intervention
const updateInterventionSchema = Joi.object({
  typeIncident: Joi.string().valid(...TYPES_INCIDENTS),
  adresse: Joi.string().min(5).max(300),
  priorite: Joi.string().valid(...PRIORITES),
  coordonnees: coordonneesSchema.allow(null),
  patient: patientSchema,
  notes: Joi.string().max(1000).allow(""),
})
  .min(1)
  .messages({ "object.min": "Au moins un champ à modifier est requis" });

// Changement de statut simple
const updateStatutInterventionSchema = Joi.object({
  statut: Joi.string()
    .valid(
      "CREATED",
      "VALIDATED",
      "ASSIGNED",
      "EN_ROUTE",
      "ON_SITE",
      "TRANSPORTING",
      "COMPLETED",
      "CANCELLED",
    )
    .required(),
});

// Assignation d'une unité
const assignUnitSchema = Joi.object({
  unitId: Joi.string()
    .hex()
    .length(24)
    .required()
    .messages({
      "string.length":
        "unitId doit être un ObjectId MongoDB valide (24 caractères hex)",
    }),
});

// ─── Unité ────────────────────────────────────────────────────────────────────
const TYPES_UNITES = ["SMUR", "VSAV", "VSL", "VPSP", "AR"];

const createUnitSchema = Joi.object({
  nom: Joi.string().min(2).max(50).required(),
  type: Joi.string()
    .valid(...TYPES_UNITES)
    .required(),
  immatriculation: Joi.string().max(20).required(),
  statut: Joi.string()
    .valid("disponible", "en_mission", "maintenance", "hors_service")
    .default("disponible"),
  carburant: Joi.number().min(0).max(100).default(100),
  kilometrage: Joi.number().min(0).default(0),
  position: Joi.object({
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
    adresse: Joi.string().max(200).allow(""),
  }).default(null),
  specs: Joi.object({
    consommationL100: Joi.number().min(1).max(50).default(12),
    capaciteReservoir: Joi.number().min(10).max(200).default(80),
  }).default({}),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(1).required(),
});

const registerSchema = Joi.object({
  nom: Joi.string().min(2).max(60).trim().required(),
  prenom: Joi.string().min(2).max(60).trim().required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      "string.min": "Le mot de passe doit contenir au moins 8 caractères",
    }),
  role: Joi.string()
    .valid("dispatcher", "superviseur", "admin")
    .default("dispatcher"),
});

const updatePasswordSchema = Joi.object({
  ancienPassword: Joi.string().required(),
  nouveauPassword: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      "string.min":
        "Le nouveau mot de passe doit contenir au moins 8 caractères",
    }),
});

// ─── Transport sanitaire ──────────────────────────────────────────────────────
const TYPES_TRANSPORT = ["VSL", "AMBULANCE", "TPMR"];
const MOTIFS_TRANSPORT = [
  "Dialyse", "Chimiothérapie", "Radiothérapie", "Consultation",
  "Hospitalisation", "Sortie hospitalisation", "Rééducation", "Analyse", "Autre",
];
const MOBILITES = ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"];

const adresseTransportSchema = Joi.object({
  nom: Joi.string().max(200).allow("").default(""),
  rue: Joi.string().max(300).allow("").default(""),
  ville: Joi.string().max(100).allow("").default(""),
  codePostal: Joi.string().max(10).allow("").default(""),
  service: Joi.string().max(100).allow("").default(""),
  coordonnees: Joi.object({
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
  }).default({}),
});

const patientTransportSchema = Joi.object({
  nom: Joi.string().min(1).max(100).required(),
  prenom: Joi.string().max(100).allow("").default(""),
  dateNaissance: Joi.date().allow(null).default(null),
  telephone: Joi.string().max(20).allow("").default(""),
  numeroSecu: Joi.string().max(30).allow("").default(""),
  mobilite: Joi.string().valid(...MOBILITES).default("ASSIS"),
  oxygene: Joi.boolean().default(false),
  brancardage: Joi.boolean().default(false),
  accompagnateur: Joi.boolean().default(false),
  antecedents: Joi.string().max(1000).allow("").default(""),
  notes: Joi.string().max(1000).allow("").default(""),
});

const createTransportSchema = Joi.object({
  typeTransport: Joi.string().valid(...TYPES_TRANSPORT).required().messages({
    "any.only": `typeTransport invalide. Valeurs : ${TYPES_TRANSPORT.join(", ")}`,
  }),
  motif: Joi.string().valid(...MOTIFS_TRANSPORT).required().messages({
    "any.only": `motif invalide. Valeurs : ${MOTIFS_TRANSPORT.join(", ")}`,
  }),
  dateTransport: Joi.date().required().messages({
    "date.base": "dateTransport doit être une date valide",
  }),
  heureRDV: Joi.string().pattern(/^\d{2}:\d{2}$/).required().messages({
    "string.pattern.base": "heureRDV doit être au format HH:MM",
  }),
  adresseDepart: adresseTransportSchema.required(),
  adresseDestination: adresseTransportSchema.required(),
  patient: patientTransportSchema.required(),
  allerRetour: Joi.boolean().default(false),
  heureDepart: Joi.string().allow("").default(""),
  notes: Joi.string().max(2000).allow("").default(""),
  patientId: Joi.string().hex().length(24).allow(null).default(null),
  prescriptionId: Joi.string().hex().length(24).allow(null).default(null),
  vehicule: Joi.string().hex().length(24).allow(null).default(null),
  chauffeur: Joi.string().hex().length(24).allow(null).default(null),
  tauxPriseEnCharge: Joi.number().integer().min(0).max(100).default(65),
});

const updateTransportSchema = Joi.object({
  typeTransport: Joi.string().valid(...TYPES_TRANSPORT),
  motif: Joi.string().valid(...MOTIFS_TRANSPORT),
  dateTransport: Joi.date(),
  heureRDV: Joi.string().pattern(/^\d{2}:\d{2}$/),
  adresseDepart: adresseTransportSchema,
  adresseDestination: adresseTransportSchema,
  patient: patientTransportSchema,
  allerRetour: Joi.boolean(),
  heureDepart: Joi.string().allow(""),
  notes: Joi.string().max(2000).allow(""),
  patientId: Joi.string().hex().length(24).allow(null),
  prescriptionId: Joi.string().hex().length(24).allow(null),
}).min(1).messages({ "object.min": "Au moins un champ à modifier est requis" });

// ─── Véhicule ─────────────────────────────────────────────────────────────────
const TYPES_VEHICULE = ["VSL", "AMBULANCE", "TPMR"];
const STATUTS_VEHICULE = ["disponible", "en_mission", "maintenance", "hors_service"];

const createVehicleSchema = Joi.object({
  immatriculation: Joi.string().max(20).uppercase().trim().required(),
  nom: Joi.string().min(2).max(100).trim().required(),
  type: Joi.string().valid(...TYPES_VEHICULE).required().messages({
    "any.only": `type invalide. Valeurs : ${TYPES_VEHICULE.join(", ")}`,
  }),
  statut: Joi.string().valid(...STATUTS_VEHICULE).default("disponible"),
  capacitePassagers: Joi.number().integer().min(1).max(10).default(1),
  equipeFauteuil: Joi.boolean().default(false),
  equipeOxygene: Joi.boolean().default(false),
  equipeBrancard: Joi.boolean().default(false),
  kilometrage: Joi.number().min(0).default(0),
  carburant: Joi.number().min(0).max(100).default(100),
  annee: Joi.number().integer().min(2000).max(new Date().getFullYear() + 1).allow(null).default(null),
  notes: Joi.string().max(1000).allow("").default(""),
});

const updateVehicleSchema = Joi.object({
  immatriculation: Joi.string().max(20).uppercase().trim(),
  nom: Joi.string().min(2).max(100).trim(),
  type: Joi.string().valid(...TYPES_VEHICULE),
  statut: Joi.string().valid(...STATUTS_VEHICULE),
  capacitePassagers: Joi.number().integer().min(1).max(10),
  equipeFauteuil: Joi.boolean(),
  equipeOxygene: Joi.boolean(),
  equipeBrancard: Joi.boolean(),
  kilometrage: Joi.number().min(0),
  carburant: Joi.number().min(0).max(100),
  annee: Joi.number().integer().min(2000).allow(null),
  notes: Joi.string().max(1000).allow(""),
  chauffeurAssigne: Joi.string().hex().length(24).allow(null),
}).min(1).messages({ "object.min": "Au moins un champ à modifier est requis" });

// ─── Analyse IA ───────────────────────────────────────────────────────────────
const analyzeIASchema = Joi.object({
  typeIncident: Joi.string().required(),
  etatPatient: Joi.string()
    .valid(...ETATS_PATIENT)
    .required(),
  age: Joi.number().integer().min(0).max(150).default(40),
  nrsPain: Joi.number().min(0).max(10).default(0),
  nbVictimes: Joi.number().integer().min(1).max(500).default(1),
  arrivalMode: Joi.string()
    .valid("ambulance", "walk", "transfer")
    .default("walk"),
  injury: Joi.boolean().default(false),
  symptomes: Joi.array().items(Joi.string()).default([]),
  patientsPerHour: Joi.number().min(0).default(5),
});

module.exports = {
  createInterventionSchema,
  updateInterventionSchema,
  updateStatutInterventionSchema,
  assignUnitSchema,
  createUnitSchema,
  loginSchema,
  registerSchema,
  updatePasswordSchema,
  analyzeIASchema,
  createTransportSchema,
  updateTransportSchema,
  createVehicleSchema,
  updateVehicleSchema,
};
