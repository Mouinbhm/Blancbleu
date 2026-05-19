const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const cookieLib = require("cookie");
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

const corsOptions = {
  origin: function (origin, callback) {
    // Flutter mobile n'envoie pas d'Origin header (origin === undefined) → autorisé
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origine non autorisée — ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// ── Stripe webhook — doit recevoir le body RAW (avant express.json) ───────────
// La vérification de signature Stripe exige le Buffer brut, sans express.json() appliqué.
app.post(
  "/api/payments/stripe/webhook",
  express.raw({ type: "application/json" }),
  require("./controllers/paymentController").stripeWebhook,
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: false }));
app.use(cookieParser());
app.use(noSqlSanitize);
app.use(xssSanitize);
app.use(globalLimiter);
app.use(httpLogger);
app.use(require("./middleware/auditMiddleware"));

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

// Authentification Socket.IO — lit le token depuis cookie bb_access ou Authorization header
io.use((socket, next) => {
  let raw =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

  // Fallback : lire depuis le cookie httpOnly bb_access
  if (!raw && socket.handshake.headers.cookie) {
    const cookies = cookieLib.parse(socket.handshake.headers.cookie);
    raw = cookies.bb_access;
  }

  if (!raw) return next(new Error("Non autorisé"));
  try {
    socket.user = jwt.verify(raw, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("Non autorisé"));
  }
});

app.set("io", io);
require("./services/socketService").init(io);
require("./sockets").initSockets(io);

// ─── Swagger ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") setupSwagger(app);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/gdpr", require("./routes/gdpr"));
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
app.use("/api/payments", require("./routes/payments"));
app.use("/api/comptabilite", require("./routes/comptabilite"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/planning", require("./routes/planning"));
app.use("/api/notifications", require("./routes/notifications"));
if (process.env.NODE_ENV !== "production") {
  app.use("/api/demo", require("./routes/demo"));
}

// SUPPRIMÉS :
// /api/interventions  → remplacé par /api/transports
// /api/workflow       → intégré dans transportController
// /api/escalade       → supprimé (logique urgence non applicable)

// ── Routes mobile patient ─────────────────────────────────────────────────────
app.use("/api/patient", require("./routes/patient"));

// ── Routes driver app ──────────────────────────────────────────────────────────
app.use("/api/v1/personnel/auth", require("./routes/personnelAuth.routes"));
app.use("/api/v1/driver",         require("./routes/driver.routes"));
app.use("/api/v1/shifts",         require("./routes/shift.routes"));
app.use("/api/v1/tracking",       require("./routes/tracking.routes"));
app.use("/api/v1/messages",       require("./routes/messages.routes"));

// ── Fichiers statiques (photos PMT) ───────────────────────────────────────────
app.use("/uploads", require("express").static(require("path").join(__dirname, "uploads")));

// ─── Admin one-shot migration (dev only) ─────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.post("/api/admin/migrate-statuts", async (req, res) => {
    try {
      await migrateStatuts();
      res.json({ message: "Migration terminée" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
}

// ─── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", healthHandler);
app.use((req, res) => res.status(404).json({ message: "Route non trouvée" }));
app.use(errorHandler);

// ─── Export pour tests ────────────────────────────────────────────────────────
module.exports = app;

// ── Nettoyage des véhicules bloqués ──────────────────────────────────────────
// Délégué à vehicleCleanupService pour séparation des responsabilités.
const { nettoyerVehiculesBloqués } = require("./services/vehicleCleanupService");
const { runCleanup: notifCleanup } = require("./services/notificationCleanupService");

// ── Migration one-shot : normalise les valeurs de statut ──────────────────────
async function migrateStatuts() {
  const db = mongoose.connection;

  const vehicleMap = {
    "disponible":  "Disponible",
    "en_mission":  "En service",
    "maintenance": "Maintenance",
    "hors_service":"Hors service",
  };
  let total = 0;
  for (const [old, newVal] of Object.entries(vehicleMap)) {
    const r = await db.collection("vehicles").updateMany({ statut: old }, { $set: { statut: newVal } });
    total += r.modifiedCount;
  }

  const personnelMap = {
    "en-service": "Disponible",
    "conge":      "Congé",
    "formation":  "Formation",
    "maladie":    "Maladie",
    "inactif":    "Inactif",
  };
  for (const [old, newVal] of Object.entries(personnelMap)) {
    const r = await db.collection("personnels").updateMany({ statut: old }, { $set: { statut: newVal } });
    total += r.modifiedCount;
  }

  if (total > 0) logger.info(`Migration statuts terminée — ${total} document(s) mis à jour`);
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      logger.info("MongoDB connecté");

      // Migration one-shot des valeurs de statut legacy
      migrateStatuts().catch((err) =>
        logger.warn("Migration statuts échouée", { err: err.message }),
      );

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

      // Nettoyage notifications 1x/jour
      setInterval(() => {
        notifCleanup().catch((err) =>
          logger.warn("Nettoyage notifications échoué", { err: err.message }),
        );
      }, 24 * 60 * 60 * 1000);

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

  // ── SIMULATION AUTO DÉSACTIVÉE ────────────────────────────────────────────
  // Mettre SIMULATION_ACTIVE = true pour réactiver (démos PFE).
  // La simulation déplace les véhicules toutes les 8s dans la zone Nice.
  const SIMULATION_ACTIVE = false;
  if (SIMULATION_ACTIVE && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    const sim = require("./services/simulationService");
    setTimeout(() => sim.demarrer(), 5000);
  }
}
