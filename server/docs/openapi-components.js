/**
 * Composants OpenAPI réutilisables — schemas, securitySchemes, responses.
 * Importé par middleware/swagger.js. Centraliser ici évite la duplication
 * dans chaque @openapi JSDoc des routes.
 */

const securitySchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Token JWT obtenu via POST /api/auth/login (utilisable en header Authorization).",
  },
  cookieAuth: {
    type: "apiKey",
    in: "cookie",
    name: "bb_access",
    description:
      "Cookie httpOnly émis par /api/auth/login. Utilisé en priorité par les clients browser.",
  },
  serviceTokenAuth: {
    type: "apiKey",
    in: "header",
    name: "X-Service-Token",
    description:
      "Token partagé Node ↔ Python pour les routes service-to-service (training-data, model/retrain, model/status).",
  },
};

const schemas = {
  Error: {
    type: "object",
    properties: {
      message: { type: "string", example: "Erreur interne du serveur" },
    },
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  User: {
    type: "object",
    properties: {
      id: { type: "string", example: "507f1f77bcf86cd799439011" },
      nom: { type: "string", example: "Martin" },
      prenom: { type: "string", example: "Jean" },
      email: { type: "string", example: "dispatcher@blancbleu.fr" },
      role: {
        type: "string",
        enum: ["dispatcher", "superviseur", "admin", "comptable", "patient"],
      },
      mustChangePassword: { type: "boolean", example: false },
      twoFactorEnabled: { type: "boolean", example: false },
    },
  },
  LoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", example: "dispatcher@blancbleu.fr" },
      password: { type: "string", example: "********" },
    },
  },
  LoginResponse: {
    type: "object",
    properties: {
      message: { type: "string", example: "Connexion réussie" },
      token: { type: "string", description: "JWT (aussi posé en cookie httpOnly bb_access)" },
      user: { $ref: "#/components/schemas/User" },
    },
  },

  // ── Transport ─────────────────────────────────────────────────────────────
  Transport: {
    type: "object",
    properties: {
      _id: { type: "string" },
      numero: { type: "string", example: "TRS-20260524-0001" },
      typeTransport: { type: "string", enum: ["VSL", "TPMR", "AMBULANCE"] },
      motif: { type: "string", example: "Dialyse" },
      dateTransport: { type: "string", format: "date-time" },
      heureRDV: { type: "string", example: "09:30" },
      allerRetour: { type: "boolean", example: true },
      statut: {
        type: "string",
        enum: [
          "REQUESTED",
          "CONFIRMED",
          "SCHEDULED",
          "ASSIGNED",
          "DRIVER_ACCEPTED",
          "DRIVER_REJECTED",
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
          "CANCELLED",
          "NO_SHOW",
          "RESCHEDULED",
          "FAILED",
        ],
      },
      patient: { $ref: "#/components/schemas/PatientSubdoc" },
      adresseDepart: { $ref: "#/components/schemas/Adresse" },
      adresseDestination: { $ref: "#/components/schemas/Adresse" },
      vehicule: { type: "string", nullable: true, description: "Vehicle ObjectId" },
      chauffeur: { type: "string", nullable: true, description: "Personnel ObjectId" },
      dureeReelleMinutes: { type: "number", nullable: true },
    },
  },
  Adresse: {
    type: "object",
    properties: {
      nom: { type: "string", example: "CHU Pasteur" },
      rue: { type: "string", example: "30 Voie Romaine" },
      ville: { type: "string", example: "Nice" },
      codePostal: { type: "string", example: "06000" },
      coordonnees: {
        type: "object",
        properties: {
          lat: { type: "number", example: 43.7102 },
          lng: { type: "number", example: 7.262 },
        },
      },
    },
  },
  PatientSubdoc: {
    type: "object",
    properties: {
      nom: { type: "string", example: "Dupont" },
      prenom: { type: "string", example: "Marie" },
      telephone: { type: "string", example: "0612345678" },
      mobilite: { type: "string", enum: ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"] },
      oxygene: { type: "boolean", default: false },
      brancardage: { type: "boolean", default: false },
      accompagnateur: { type: "boolean", default: false },
    },
  },

  // ── Vehicle ───────────────────────────────────────────────────────────────
  Vehicle: {
    type: "object",
    properties: {
      _id: { type: "string" },
      immatriculation: { type: "string", example: "AB-123-CD" },
      nom: { type: "string", example: "VSL-01" },
      type: { type: "string", enum: ["VSL", "AMBULANCE", "TPMR"] },
      statut: { type: "string", enum: ["Disponible", "En service", "Maintenance", "Hors service"] },
      position: {
        type: "object",
        properties: {
          lat: { type: "number" },
          lng: { type: "number" },
          adresse: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      kilometrage: {
        type: "object",
        properties: { actuel: { type: "number" } },
      },
      carburant: { type: "number", minimum: 0, maximum: 100 },
    },
  },

  // ── Personnel ──────────────────────────────────────────────────────────────
  Personnel: {
    type: "object",
    properties: {
      _id: { type: "string" },
      nom: { type: "string", example: "Durand" },
      prenom: { type: "string", example: "Paul" },
      role: {
        type: "string",
        enum: ["Ambulancier", "Secouriste", "Infirmier", "Médecin", "Chauffeur", "Autre"],
      },
      typeContrat: { type: "string", enum: ["CDI", "CDD", "Intérim", "Stage", "Alternance", ""] },
      statut: {
        type: "string",
        enum: ["Disponible", "En shift", "Congé", "Maladie", "Formation", "Inactif"],
      },
      telephone: { type: "string", nullable: true },
      email: { type: "string", format: "email", nullable: true },
      actif: { type: "boolean", default: true },
    },
  },

  // ── Prescription (PMT) ─────────────────────────────────────────────────────
  Prescription: {
    type: "object",
    properties: {
      _id: { type: "string" },
      numero: { type: "string", example: "PMT-20260524-0001" },
      patientId: { type: "string", nullable: true },
      transportId: { type: "string", nullable: true },
      medecin: { type: "string", example: "Dr. Bernard" },
      dateEmission: { type: "string", format: "date" },
      dateExpiration: { type: "string", format: "date", nullable: true },
      motif: { type: "string", example: "Dialyse — 3 fois/semaine" },
      fichierUrl: { type: "string", description: "URL du PDF/image scanné" },
      ocrStatus: { type: "string", enum: ["pending", "processing", "done", "error", "skipped"] },
      extractedData: { type: "object", description: "Champs OCR extraits par le service IA" },
      validee: { type: "boolean", default: false },
      validePar: { type: "string", nullable: true, description: "User ObjectId du valideur" },
      valideAt: { type: "string", format: "date-time", nullable: true },
    },
  },

  // ── AuditLog ───────────────────────────────────────────────────────────────
  AuditLog: {
    type: "object",
    properties: {
      _id: { type: "string" },
      action: { type: "string", example: "PATIENT_ANONYMIZED" },
      userId: { type: "string", nullable: true },
      userEmail: { type: "string", nullable: true },
      userRole: { type: "string", nullable: true },
      target: {
        type: "object",
        properties: {
          type: { type: "string", example: "Patient" },
          id: { type: "string" },
        },
      },
      metadata: { type: "object", description: "Contexte additionnel (reason, IP, before/after)" },
      createdAt: { type: "string", format: "date-time" },
    },
  },

  // ── Patient ────────────────────────────────────────────────────────────────
  Patient: {
    type: "object",
    properties: {
      _id: { type: "string" },
      numeroPatient: { type: "string", example: "PAT-20260524-0001" },
      nom: { type: "string" },
      prenom: { type: "string" },
      dateNaissance: { type: "string", format: "date" },
      telephone: { type: "string" },
      mobilite: { type: "string", enum: ["ASSIS", "FAUTEUIL_ROULANT", "ALLONGE", "CIVIERE"] },
      oxygene: { type: "boolean" },
      brancardage: { type: "boolean" },
      accompagnateur: { type: "boolean" },
      source: { type: "string", enum: ["web", "app_mobile", "papier"] },
    },
  },

  // ── Facture ────────────────────────────────────────────────────────────────
  Facture: {
    type: "object",
    properties: {
      _id: { type: "string" },
      numero: { type: "string", example: "FAC-2026-0042" },
      transportId: { type: "string" },
      montantTotal: { type: "number" },
      montantCPAM: { type: "number" },
      montantPatient: { type: "number" },
      statut: {
        type: "string",
        enum: [
          "brouillon",
          "emise",
          "en_attente",
          "payee",
          "annulee",
          "payment_failed",
          "remboursee",
          "partiellement_remboursee",
          "en_retard",
        ],
      },
      paymentStatus: {
        type: "string",
        enum: ["UNPAID", "PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      },
    },
  },

  // ── Dispatch IA ────────────────────────────────────────────────────────────
  DispatchRecommendation: {
    type: "object",
    properties: {
      _id: { type: "string" },
      transportId: { type: "string" },
      generatedAt: { type: "string", format: "date-time" },
      source: { type: "string", enum: ["ia", "fallback_node"] },
      bestRecommendation: { $ref: "#/components/schemas/DispatchCandidate" },
      summary: {
        type: "object",
        properties: {
          totalCandidates: { type: "integer" },
          eligibleCandidates: { type: "integer" },
          excludedCandidates: { type: "integer" },
        },
      },
      decision: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "accepted", "rejected"] },
          decidedAt: { type: "string", format: "date-time", nullable: true },
          decidedBy: { type: "string", nullable: true },
          rejectionReason: { type: "string", nullable: true },
        },
      },
    },
  },
  DispatchCandidate: {
    type: "object",
    properties: {
      vehiculeId: { type: "string" },
      vehicleName: { type: "string" },
      driverName: { type: "string", nullable: true },
      score: { type: "number", minimum: 0, maximum: 100 },
      criteriaScores: {
        type: "object",
        properties: {
          distance: { type: "number" },
          driverAvailability: { type: "number" },
          vehicleTypeMatch: { type: "number" },
          planningLoad: { type: "number" },
          traffic: { type: "number" },
          medicalPriority: { type: "number" },
          punctualityHistory: { type: "number" },
        },
      },
      explanation: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
  },
  DispatchConfig: {
    type: "object",
    properties: {
      _id: { type: "string", example: "default" },
      weights: {
        type: "object",
        properties: {
          distance: { type: "number", minimum: 0, maximum: 1 },
          driverAvailability: { type: "number", minimum: 0, maximum: 1 },
          vehicleTypeMatch: { type: "number", minimum: 0, maximum: 1 },
          planningLoad: { type: "number", minimum: 0, maximum: 1 },
          traffic: { type: "number", minimum: 0, maximum: 1 },
          medicalPriority: { type: "number", minimum: 0, maximum: 1 },
          punctualityHistory: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

const responses = {
  BadRequest: {
    description: "Requête malformée (paramètre invalide, JSON parse error, etc.)",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  Unauthorized: {
    description: "Token manquant, invalide ou expiré",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  Forbidden: {
    description: "Rôle non autorisé pour cette action",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  NotFound: {
    description: "Ressource introuvable",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  Conflict: {
    description: "Conflit d'état (transition de statut interdite, doublon, lock, etc.)",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  ValidationError: {
    description: "Validation des données échouée (corps de requête invalide)",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
  ServerError: {
    description: "Erreur interne",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
};

const tags = [
  { name: "Auth", description: "Authentification, sessions, 2FA, gestion des comptes" },
  { name: "Transports", description: "Transports sanitaires : CRUD + transitions lifecycle" },
  { name: "Vehicles", description: "Flotte de véhicules sanitaires" },
  { name: "Patients", description: "Dossiers patients (RGPD + consentement)" },
  { name: "Prescriptions", description: "Prescriptions Médicales de Transport (PMT)" },
  { name: "Factures", description: "Facturation CPAM + paiement Stripe" },
  { name: "GDPR", description: "Conformité RGPD : export, anonymisation, consentement" },
  {
    name: "Tracking",
    description: "Suivi GPS temps réel des véhicules (driver write / dispatcher read)",
  },
  { name: "AI", description: "Module IA : dispatch, extraction PMT, prédiction durée" },
  { name: "Analytics", description: "Tableaux de bord, statistiques" },
  { name: "Health", description: "Healthcheck + métriques" },
  { name: "Admin", description: "Réservé administrateurs (config, retrain modèle, etc.)" },
];

module.exports = { securitySchemes, schemas, responses, tags };
