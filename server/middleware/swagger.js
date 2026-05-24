const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
const logger = require("../utils/logger");

const { securitySchemes, schemas, responses, tags } = require("../docs/openapi-components");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title:   "BlancBleu API",
      version: process.env.npm_package_version || "1.3.0",
      description:
        "Plateforme de gestion de transports sanitaires non urgents (Nice 06).\n\n" +
        "**Authentification** : la plupart des routes exigent soit le cookie httpOnly `bb_access` " +
        "(émis par /api/auth/login, prioritaire côté browser), soit le header `Authorization: Bearer <jwt>` " +
        "(SPA / scripts). Les routes service-to-service (training-data, model/retrain) utilisent " +
        "`X-Service-Token`.",
      contact: { name: "BlancBleu — Support", email: "support@blancbleu.fr" },
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? process.env.API_URL || "https://api.blancbleu.fr"
            : "http://localhost:5000",
        description:
          process.env.NODE_ENV === "production" ? "Production" : "Développement local",
      },
    ],
    components: { securitySchemes, schemas, responses },
    // Default : cookieAuth + bearerAuth (les routes service override avec serviceTokenAuth)
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    tags,
  },
  apis: [
    path.join(__dirname, "..", "routes", "*.js"),
    path.join(__dirname, "..", "controllers", "*.js"),
  ],
};

const specs = swaggerJsdoc(options);

/**
 * Monter Swagger UI sur l'application Express.
 *
 * Toujours actif en dev/staging. En production, monté seulement si
 * SWAGGER_IN_PROD=true (à protéger ensuite derrière auth admin).
 */
function setupSwagger(app) {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.SWAGGER_IN_PROD === "true";

  if (!enabled) {
    logger.info("[Swagger] désactivé en production (SWAGGER_IN_PROD non défini)");
    return;
  }

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      customSiteTitle: "BlancBleu API Docs",
      customCss:       ".swagger-ui .topbar { background-color: #1D6EF5; }",
      swaggerOptions: {
        persistAuthorization:   true,
        filter:                 true,
        displayRequestDuration: true,
      },
    }),
  );

  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(specs);
  });

  logger.info("[Swagger] UI disponible sur /api-docs");
}

/** Exporté pour le script CLI scripts/dump-openapi.js (npm run docs:openapi). */
function getSpecs() {
  return specs;
}

module.exports = { setupSwagger, getSpecs };
