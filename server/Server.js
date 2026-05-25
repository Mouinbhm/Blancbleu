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

// Sentry — init tout en haut, avant les imports des middlewares qui peuvent
// throw au require-time. No-op si SENTRY_DSN n'est pas défini.
const { initSentry, Sentry } = require("./utils/sentry");
const _sentryEnabled = !!initSentry();

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
    if (!origin) {
      // Pas de validation possible côté CORS — laisser passer pour Flutter.
      // La protection se fait dans le middleware mobileGuard ci-dessous.
      return callback(null, true);
    }
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
// requestContext doit être placé très tôt pour que toutes les opérations
// asynchrones suivantes voient le requestId dans AsyncLocalStorage.
app.use(require("./middleware/requestContext").requestContext);
app.use(require("./middleware/mobileGuard"));
app.use(noSqlSanitize);
app.use(xssSanitize);
app.use(globalLimiter);
app.use(httpLogger);
app.use(require("./middleware/metricsMiddleware"));
app.use(require("./middleware/auditMiddleware"));

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

// Sprint M2 — Redis adapter pour scaling horizontal (multi-instance).
// Conditionné à la disponibilité de Redis : en dev/test (stub), on reste sur
// l'adapter mémoire par défaut (instance unique). En prod multi-instance,
// active REDIS_URL et l'adapter prend le relais automatiquement.
try {
  const { redis: pubBase } = require("./utils/redis");
  if (!pubBase._stub) {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const subClient = pubBase.duplicate();
    io.adapter(createAdapter(pubBase, subClient));
    logger.info("Socket.IO Redis adapter actif (multi-instance ready)");
  } else {
    logger.warn("Socket.IO en mode memory adapter (Redis stub) — pas de scaling horizontal");
  }
} catch (err) {
  logger.warn("Socket.IO Redis adapter non initialisé", { err: err.message });
}

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

// ── Fichiers uploads protégés (PMT, signatures, avatars) ─────────────────────
app.use("/uploads", require("./routes/uploads"));

// ── Bull Board (admin UI BullMQ) — réservé admin, skippé si queues stubs ────
if (process.env.NODE_ENV !== "test") {
  const { queues } = require("./queues");
  const queuesAreReal = Object.values(queues).every((q) => !q._stub);
  if (!queuesAreReal) {
    logger.info("[BullBoard] non monté (Redis désactivé → queues stubs)");
  } else {
    try {
      const { createBullBoard }     = require("@bull-board/api");
      const { BullMQAdapter }       = require("@bull-board/api/bullMQAdapter");
      const { ExpressAdapter }      = require("@bull-board/express");
      const { protect, authorize }  = require("./middleware/auth");

      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath("/api/admin/queues");
      createBullBoard({
        queues:        Object.values(queues).map((q) => new BullMQAdapter(q)),
        serverAdapter,
      });
      app.use("/api/admin/queues", protect, authorize("admin"), serverAdapter.getRouter());
    } catch (err) {
      logger.warn("[BullBoard] non monté", { err: err.message });
    }
  }
}

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

// ─── Métriques Prometheus ─────────────────────────────────────────────────────
// Protégé par X-Metrics-Token (env METRICS_TOKEN). Ne JAMAIS exposer
// publiquement. En l'absence de token, l'endpoint refuse tout accès.
app.get("/metrics", async (req, res) => {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    return res.status(503).json({ message: "METRICS_TOKEN non configuré" });
  }
  if (req.get("X-Metrics-Token") !== expected) {
    return res.status(401).json({ message: "Metrics token invalide" });
  }
  const { register } = require("./utils/metrics");
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.use((req, res) => res.status(404).json({ message: "Route non trouvée" }));

// Sentry doit voir les erreurs AVANT notre errorHandler custom (qui les
// transforme en réponse JSON et termine la chaîne).
if (_sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}
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

      // Nettoyage immédiat au démarrage (non bloquant) — le récurrent est géré
      // par le worker BullMQ (cf. server/workers/start.js).
      nettoyerVehiculesBloqués().catch((err) =>
        logger.warn("Nettoyage initial des véhicules échoué", {
          err: err.message,
        }),
      );

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
