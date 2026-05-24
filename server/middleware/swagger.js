const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const logger = require("../utils/logger");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "BlancBleu API",
      version: "1.2.0",
      description:
        "API de la plateforme intelligente de gestion des interventions ambulancières. " +
        "Authentification JWT Bearer token requis sur toutes les routes protégées.",
      contact: {
        name: "BlancBleu — Support",
        email: "support@blancbleu.fr",
      },
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? process.env.API_URL || "https://api.blancbleu.fr"
            : "http://localhost:5000",
        description:
          process.env.NODE_ENV === "production"
            ? "Production"
            : "Développement local",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token JWT obtenu via POST /api/auth/login",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", example: "507f1f77bcf86cd799439011" },
            nom: { type: "string", example: "Martin" },
            prenom: { type: "string", example: "Jean" },
            email: { type: "string", example: "dispatcher@blancbleu.fr" },
            role: {
              type: "string",
              enum: ["dispatcher", "superviseur", "admin"],
            },
          },
        },
        Intervention: {
          type: "object",
          properties: {
            _id: { type: "string" },
            numero: { type: "string", example: "INT-20241201-0001" },
            typeIncident: { type: "string", example: "Arrêt cardiaque" },
            adresse: { type: "string", example: "59 Bd Madeleine, Nice" },
            priorite: { type: "string", enum: ["P1", "P2", "P3"] },
            statut: {
              type: "string",
              enum: [
                "CREATED",
                "VALIDATED",
                "ASSIGNED",
                "EN_ROUTE",
                "ON_SITE",
                "TRANSPORTING",
                "COMPLETED",
                "CANCELLED",
              ],
            },
            progression: { type: "number", example: 40 },
          },
        },
        Unit: {
          type: "object",
          properties: {
            _id: { type: "string" },
            nom: { type: "string", example: "VSAV-01" },
            type: { type: "string", enum: ["SMUR", "VSAV", "VSL"] },
            statut: {
              type: "string",
              enum: ["disponible", "en_mission", "maintenance"],
            },
            carburant: { type: "number", example: 80 },
            kilometrage: { type: "number", example: 45200 },
          },
        },
        PredictionIA: {
          type: "object",
          properties: {
            priorite: { type: "string", enum: ["P1", "P2", "P3"] },
            score: { type: "number", example: 87 },
            confiance: { type: "number", example: 92.4 },
            uniteRecommandee: { type: "string", enum: ["SMUR", "VSAV", "VSL"] },
            justification: { type: "array", items: { type: "string" } },
            source: { type: "string", example: "ml" },
            surcharge: { type: "boolean" },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Non autorisé — token manquant",
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentification et gestion des comptes" },
      {
        name: "Interventions",
        description: "Gestion des interventions ambulancières",
      },
      { name: "Unités", description: "Flotte et cycle de vie des ambulances" },
      { name: "Workflow", description: "State machine des interventions" },
      { name: "IA", description: "Module de triage intelligent" },
      { name: "Géo", description: "Géodécision et calcul ETA" },
      { name: "Escalade", description: "Surveillance et escalade automatique" },
      { name: "Audit", description: "Traçabilité et logs" },
    ],
  },
  apis: ["./routes/*.js", "./controllers/*.js"],
};

const specs = swaggerJsdoc(options);

/**
 * Monter Swagger UI sur l'application Express.
 * Appeler dans Server.js : setupSwagger(app)
 */
function setupSwagger(app) {
  if (process.env.NODE_ENV === "production") {
    // En production : protéger /api-docs derrière une auth basique optionnelle
    // Pour l'instant on l'expose, à restreindre selon les besoins
    logger.info("📄 Swagger UI disponible sur /api-docs");
  }

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      customSiteTitle: "BlancBleu API Docs",
      customCss: ".swagger-ui .topbar { background-color: #1a1a2e; }",
      swaggerOptions: {
        persistAuthorization: true,
        filter: true,
        displayRequestDuration: true,
      },
    }),
  );

  // Endpoint JSON brut pour les outils externes (Postman, Insomnia)
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(specs);
  });
}

module.exports = { setupSwagger };
