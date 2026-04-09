const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"],
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

// ─── Initialiser le service Socket.IO ────────────────────────────────────────
const socketService = require("./services/socketService");
socketService.init(io);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Middleware d'audit (avant les routes) ────────────────────────────────────
const auditMiddleware = require("./middleware/auditMiddleware");
app.use(auditMiddleware);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/interventions", require("./routes/interventions"));
app.use("/api/units", require("./routes/units"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/geo", require("./routes/geo"));
app.use("/api/workflow", require("./routes/workflow"));
app.use("/api/escalade", require("./routes/escalade"));
app.use("/api/audit", require("./routes/audit"));
app.use("/api/personnel", require("./routes/personnel"));
app.use("/api/equipements", require("./routes/equipements"));
app.use("/api/maintenances", require("./routes/maintenances"));
app.use("/api/factures", require("./routes/factures"));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "BlancBleu API is running 🚑" });
});

app.use((req, res) => res.status(404).json({ message: "Route non trouvée" }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Erreur interne", error: err.message });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Atlas connecté");
    server.listen(PORT, () => {
      console.log(`🚀 Serveur BlancBleu lancé sur le port ${PORT}`);
      // Démarrer la surveillance d'escalade
      const { demarrerSurveillance } = require("./services/escaladeService");
      demarrerSurveillance(2); // scan toutes les 2 minutes
    });
  })
  .catch((err) => {
    console.error("❌ Erreur connexion MongoDB:", err.message);
    process.exit(1);
  });

io.on("connection", (socket) => {
  console.log(`🔌 Client connecté: ${socket.id}`);
  socket.on("disconnect", () =>
    console.log(`🔌 Client déconnecté: ${socket.id}`),
  );
});

// ─── Simulation GPS (développement) ──────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const sim = require("./services/simulationService");
  setTimeout(() => sim.demarrer(), 8000); // démarrer après 8s
}
