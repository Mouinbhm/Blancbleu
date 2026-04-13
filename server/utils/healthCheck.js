/**
 * BlancBleu — Health Check Enrichi
 * Vérifie MongoDB, Flask IA, mémoire, uptime
 * Accessible sur GET /api/health
 */

const mongoose = require("mongoose");
const axios = require("axios");
const logger = require("./logger");

const AI_URL = process.env.AI_API_URL || "http://localhost:5001";
const AI_TIMEOUT = 2000;

/**
 * Vérifie la connexion MongoDB
 */
async function checkMongo() {
  const state = mongoose.connection.readyState;
  const labels = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  if (state !== 1) {
    return { status: "unhealthy", state: labels[state] || "unknown" };
  }

  try {
    // Ping réel pour vérifier la latence
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    return {
      status: "healthy",
      state: "connected",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return { status: "unhealthy", error: err.message };
  }
}

/**
 * Vérifie le service Flask IA
 */
async function checkIA() {
  try {
    const start = Date.now();
    const { data } = await axios.get(`${AI_URL}/health`, {
      timeout: AI_TIMEOUT,
    });
    return {
      status: data.loaded ? "healthy" : "degraded",
      loaded: data.loaded,
      accuracy: data.accuracy,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: "unhealthy",
      loaded: false,
      error: err.code === "ECONNREFUSED" ? "Service indisponible" : err.message,
    };
  }
}

/**
 * Métriques mémoire Node.js
 */
function checkMemoire() {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    usagePct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
  };
}

/**
 * Handler Express pour GET /api/health
 */
async function healthHandler(req, res) {
  const debut = Date.now();

  try {
    const [mongo, ia] = await Promise.all([checkMongo(), checkIA()]);
    const memoire = checkMemoire();

    const sante =
      mongo.status === "healthy" && ia.status !== "unhealthy"
        ? "healthy"
        : mongo.status !== "healthy"
          ? "unhealthy"
          : "degraded";

    const statusCode =
      sante === "healthy" ? 200 : sante === "degraded" ? 200 : 503;

    res.status(statusCode).json({
      status: sante,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || "1.2.0",
      env: process.env.NODE_ENV || "development",
      dureeMs: Date.now() - debut,
      services: {
        mongodb: mongo,
        ia,
      },
      systeme: {
        memoire,
        nodeVersion: process.version,
        pid: process.pid,
      },
    });
  } catch (err) {
    logger.error("Health check échoué", { err: err.message });
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
}

module.exports = { healthHandler, checkMongo, checkIA, checkMemoire };
