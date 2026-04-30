const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
require("dotenv").config();

const logger = require("./utils/logger");
const httpLogger = require("./middleware/httpLogger");
const { healthHandler } = require("./utils/healthCheck");
const { noSqlSanitize, xssSanitize } = require("./middleware/sanitize");
const { globalLimiter } = require("./middleware/rateLimiter");
const { setupSwagger } = require("./middleware/swagger");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
    : ["http://localhost:3000"];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline requis pour Tailwind
        imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
        connectSrc: ["'self'", process.env.CLIENT_URL, "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, cb) =>
      !origin || ALLOWED_ORIGINS.includes(origin)
        ? cb(null, true)
        : cb(new Error(`CORS bloqué : ${origin}`)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(noSqlSanitize);
app.use(xssSanitize);
app.use(globalLimiter);
app.use(httpLogger);
app.use(require("./middleware/auditMiddleware"));

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});
app.set("io", io);
require("./services/socketService").init(io);

// ─── Swagger ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") setupSwagger(app);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/patients", require("./routes/patients"));           // ← NOUVEAU
app.use("/api/prescriptions", require("./routes/prescriptions")); // ← NOUVEAU
app.use("/api/transports", require("./routes/transports"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/geo", require("./routes/geo"));
app.use("/api/audit", require("./routes/audit"));
app.use("/api/personnel", require("./routes/personnel"));
app.use("/api/equipements", require("./routes/equipements"));
app.use("/api/maintenances", require("./routes/maintenances"));
app.use("/api/factures", require("./routes/factures"));
app.use("/api/comptabilite", require("./routes/comptabilite"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/planning", require("./routes/planning"));
if (process.env.NODE_ENV !== "production") {
  app.use("/api/demo", require("./routes/demo"));
}

// SUPPRIMÉS :
// /api/interventions  → remplacé par /api/transports
// /api/workflow       → intégré dans transportController
// /api/escalade       → supprimé (logique urgence non applicable)

// ─── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", healthHandler);
app.use((req, res) => res.status(404).json({ message: "Route non trouvée" }));
app.use(errorHandler);

// ─── Export pour tests ────────────────────────────────────────────────────────
module.exports = app;

// ── Nettoyage des véhicules bloqués ──────────────────────────────────────────
// Libère les véhicules restés en statut "en_mission" après la fin de leur
// transport. Conçu pour être idempotent et non-bloquant.
async function nettoyerVehiculesBloqués() {
  // Import local pour éviter les dépendances circulaires au chargement
  const Vehicle = require("./models/Vehicle");
  const Transport = require("./models/Transport");

  const STATUTS_TERMINES = ["COMPLETED", "CANCELLED", "NO_SHOW", "BILLED"];
  const vehiculesEnMission = await Vehicle.find({
    statut: "en_mission",
    deletedAt: null,
  });

  let liberes = 0;

  for (const vehicule of vehiculesEnMission) {
    let doitLiberer = false;
    let raison = "";

    if (!vehicule.transportEnCours) {
      doitLiberer = true;
      raison = "aucun transport associé";
    } else {
      const transport = await Transport.findById(
        vehicule.transportEnCours,
      ).select("numero statut");

      if (!transport) {
        doitLiberer = true;
        raison = "transport introuvable en base";
      } else if (STATUTS_TERMINES.includes(transport.statut)) {
        doitLiberer = true;
        raison = `transport ${transport.numero} terminé (${transport.statut})`;
      }
    }

    if (doitLiberer) {
      await Vehicle.findByIdAndUpdate(vehicule._id, {
        statut: "disponible",
        transportEnCours: null,
      });
      logger.info("Véhicule débloqué automatiquement", {
        vehicule: vehicule.nom,
        immatriculation: vehicule.immatriculation,
        raison,
      });
      liberes++;
    }
  }

  if (liberes > 0 || vehiculesEnMission.length > 0) {
    logger.info("Nettoyage véhicules terminé", {
      verifies: vehiculesEnMission.length,
      liberes,
    });
  }
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      logger.info("MongoDB connecté");

      // Nettoyage immédiat au démarrage (non bloquant)
      nettoyerVehiculesBloqués().catch((err) =>
        logger.warn("Nettoyage initial des véhicules échoué", {
          err: err.message,
        }),
      );

      // Nettoyage périodique toutes les heures
      setInterval(() => {
        nettoyerVehiculesBloqués().catch((err) =>
          logger.warn("Nettoyage périodique des véhicules échoué", {
            err: err.message,
          }),
        );
      }, 60 * 60 * 1000);

      server.listen(PORT, () => {
        logger.info(`BlancBleu Transport démarré`, { port: PORT });
        if (process.env.NODE_ENV !== "production") {
          logger.info(`Swagger : http://localhost:${PORT}/api-docs`);
        }
      });
    })
    .catch((err) => {
      logger.error("MongoDB échoué", { err: err.message });
      process.exit(1);
    });

  if (process.env.NODE_ENV !== "production") {
    const sim = require("./services/simulationService");
    setTimeout(() => sim.demarrer(), 5000);
  }
}
