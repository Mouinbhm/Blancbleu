/**
 * BlancBleu — Workers BullMQ
 *
 * Un Worker par queue, partageant la même connexion Redis que les queues.
 * Démarré par workers/start.js dans un process séparé du serveur Express.
 *
 * Jobs supportés :
 *   email/welcome       : envoi du mail de bienvenue
 *   email/reset         : envoi du mail de reset password
 *   ocr/extract         : extraction OCR d'une prescription via FastAPI
 *   pdf/invoice         : génération PDF d'une facture
 *   pdf/mission         : génération PDF d'une mission
 *   cleanup/vehicles    : libération des véhicules bloqués (récurrent)
 *   cleanup/notifs      : purge des vieilles notifications (récurrent)
 */

const { Worker } = require("bullmq");
const { QUEUES, connection } = require("../queues");
const logger = require("../utils/logger");

const baseOpts = { connection, concurrency: 3 };

// ─── Email ──────────────────────────────────────────────────────────────────
const emailWorker = new Worker(
  QUEUES.EMAIL,
  async (job) => {
    const email = require("../services/emailService");
    if (job.name === "welcome") {
      const { to, prenom, nom, email: login, motDePasse, role } = job.data;
      await email._sendWelcomeEmailNow(to, prenom, nom, login, motDePasse, role);
      return { sent: true };
    }
    if (job.name === "reset") {
      const { to, nom, resetUrl } = job.data;
      await email._sendResetEmailNow(to, nom, resetUrl);
      return { sent: true };
    }
    throw new Error(`Job email inconnu : ${job.name}`);
  },
  baseOpts,
);

// ─── OCR ────────────────────────────────────────────────────────────────────
const ocrWorker = new Worker(
  QUEUES.OCR,
  async (job) => {
    const Prescription = require("../models/Prescription");
    const aiClient     = require("../services/aiClient");
    const fs           = require("fs");

    const { prescriptionId, filePath, mimetype, originalName } = job.data;
    const buffer = await fs.promises.readFile(filePath);
    const result = await aiClient.extrairePMT(buffer, mimetype, originalName);

    await Prescription.findByIdAndUpdate(prescriptionId, {
      $set: {
        "ocr.statut":           "processed",
        "ocr.confiance":        result.confiance ?? null,
        "ocr.donneesExtraites": result.extraction || null,
        "ocr.champsIncertains": result.champsManquants || [],
        "ocr.traiteAt":         new Date(),
      },
    });
    return { confiance: result.confiance };
  },
  baseOpts,
);

// ─── PDF ────────────────────────────────────────────────────────────────────
const pdfWorker = new Worker(
  QUEUES.PDF,
  async (job) => {
    if (job.name === "invoice") {
      const invoicePdf = require("../services/invoicePdfService");
      return invoicePdf.generateInvoicePdf(job.data.factureId);
    }
    if (job.name === "mission") {
      const missionPdf = require("../services/missionPdfService");
      return missionPdf.generateMissionPdf(job.data.transportId);
    }
    throw new Error(`Job pdf inconnu : ${job.name}`);
  },
  baseOpts,
);

// ─── Cleanup ─────────────────────────────────────────────────────────────────
const cleanupWorker = new Worker(
  QUEUES.CLEANUP,
  async (job) => {
    if (job.name === "vehicles") {
      const { nettoyerVehiculesBloqués } = require("../services/vehicleCleanupService");
      return nettoyerVehiculesBloqués();
    }
    if (job.name === "notifs") {
      const { runCleanup } = require("../services/notificationCleanupService");
      return runCleanup();
    }
    throw new Error(`Job cleanup inconnu : ${job.name}`);
  },
  baseOpts,
);

// ─── Logging centralisé ──────────────────────────────────────────────────────
for (const [name, worker] of Object.entries({ email: emailWorker, ocr: ocrWorker, pdf: pdfWorker, cleanup: cleanupWorker })) {
  worker.on("completed", (job) => logger.info(`[worker:${name}] job ${job.id} (${job.name}) OK`));
  worker.on("failed", (job, err) =>
    logger.warn(`[worker:${name}] job ${job?.id} (${job?.name}) KO`, { err: err.message, attempts: job?.attemptsMade }),
  );
  worker.on("error", (err) => logger.error(`[worker:${name}] erreur globale`, { err: err.message }));
}

module.exports = { emailWorker, ocrWorker, pdfWorker, cleanupWorker };
