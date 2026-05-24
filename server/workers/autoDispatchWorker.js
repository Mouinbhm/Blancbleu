/**
 * BlancBleu — Worker auto-dispatch (BullMQ)
 *
 * Job `eval` : pour un transportId, génère une recommandation IA, persiste
 * un DispatchRecommendation, et selon la config DispatchConfig.autoDispatch :
 *   - requireApproval=true  → laisse la proposition en `pending` (HITL).
 *   - requireApproval=false → assigne effectivement le véhicule.
 *
 * GARDE-FOUS (jamais relâchés) :
 *   1. Re-check de DispatchConfig.autoDispatch.enabled à chaque exécution
 *      (pas seulement au scheduling).
 *   2. Idempotence : skip si transport déjà assigné OU statut ≠ SCHEDULED OU
 *      une recommandation `pending` existe déjà pour ce transport.
 *   3. evaluerEligibilite() doit retourner eligible=true.
 *   4. Branche d'assignation effective n'est jamais "silencieuse" : audit
 *      AUTO_DISPATCH_ASSIGNED + socket event + log.
 */

const { Worker } = require("bullmq");
const { QUEUES, connection } = require("../queues");
const logger = require("../utils/logger");

// ── Process unitaire ────────────────────────────────────────────────────────
async function processAutoDispatchJob(job) {
  // Lazy requires : on charge mongoose models au moment du job, pas au boot
  const Transport             = require("../models/Transport");
  const Vehicle               = require("../models/Vehicle");
  const Personnel             = require("../models/Personnel");
  const DispatchConfig        = require("../models/DispatchConfig");
  const DispatchRecommendation = require("../models/DispatchRecommendation");
  const aiClient              = require("../services/aiClient");
  const autoDispatchService   = require("../services/autoDispatchService");
  const auditService          = require("../services/auditService");
  const socketService         = require("../services/socketService");

  const { transportId } = job.data || {};
  if (!transportId) {
    logger.warn("[autoDispatch] job sans transportId, skip");
    return { skipped: "no_transport_id" };
  }

  // ── 0. Re-check config (toggle peut avoir été désactivé entre temps) ──────
  const cfg = await DispatchConfig.findById("default").lean();
  const auto = cfg?.autoDispatch || DispatchConfig.DEFAULT_AUTODISPATCH;
  if (!auto.enabled) {
    logger.info("[autoDispatch] désactivé en config, skip", { transportId });
    return { skipped: "config_disabled" };
  }

  // ── 1. Charger le transport et vérifier l'idempotence ─────────────────────
  const transport = await Transport.findById(transportId);
  if (!transport) {
    logger.warn("[autoDispatch] transport introuvable", { transportId });
    return { skipped: "transport_not_found" };
  }
  if (transport.statut !== "SCHEDULED") {
    logger.info("[autoDispatch] statut non SCHEDULED, skip", {
      transportId, statut: transport.statut,
    });
    return { skipped: `statut:${transport.statut}` };
  }
  if (transport.vehicule) {
    logger.info("[autoDispatch] déjà assigné, skip", { transportId });
    return { skipped: "already_assigned" };
  }

  // Idempotence : refuse de ré-créer une reco si une est déjà en attente
  const existingPending = await DispatchRecommendation.findOne({
    transportId: transport._id,
    "decision.status": "pending",
  }).sort({ generatedAt: -1 }).lean();
  if (existingPending) {
    logger.info("[autoDispatch] proposition pending déjà existante, skip", {
      transportId, recId: existingPending._id,
    });
    return { skipped: "pending_exists", recommendationId: existingPending._id };
  }

  // ── 2. Charger véhicules + chauffeurs disponibles ────────────────────────
  const [vehicules, chauffeurs] = await Promise.all([
    Vehicle.find({ statut: "Disponible" }).limit(15).lean(),
    Personnel.find({
      statut: "En shift",
      role: { $in: ["Ambulancier", "Chauffeur"] },
    }).lean(),
  ]);

  if (vehicules.length === 0) {
    logger.info("[autoDispatch] aucun véhicule disponible, skip", { transportId });
    return { skipped: "no_vehicle_available" };
  }

  // ── 3. Appel IA + persistance DispatchRecommendation ─────────────────────
  let iaResult;
  try {
    iaResult = await aiClient.recommanderDispatch(transport, vehicules, chauffeurs);
  } catch (err) {
    logger.warn("[autoDispatch] IA indisponible, skip (pas de fallback en auto)", {
      transportId, err: err.message,
    });
    // Pas de fallback en auto-dispatch — on préfère ne rien faire plutôt
    // qu'assigner sur la base d'un scoring local
    return { skipped: "ia_unavailable", error: err.message };
  }

  const best = iaResult.bestRecommendation || iaResult.recommandation;
  if (!best) {
    logger.warn("[autoDispatch] IA n'a pas retourné de bestRecommendation", { transportId });
    return { skipped: "no_best_recommendation" };
  }

  const rec = await DispatchRecommendation.create({
    transportId: transport._id,
    source: "ia",
    weights: iaResult.weights || null,
    recommendations: Array.isArray(iaResult.recommendations)
      ? iaResult.recommendations
      : [best],
    bestRecommendation: best,
    excludedCandidates: iaResult.excludedCandidates || [],
    summary: iaResult.summary || {
      totalCandidates:    vehicules.length,
      eligibleCandidates: Array.isArray(iaResult.recommendations) ? iaResult.recommendations.length : 1,
      excludedCandidates: 0,
    },
    decision: { status: "pending" },
  });

  // ── 4. Évaluer l'éligibilité ─────────────────────────────────────────────
  const verdict = autoDispatchService.evaluerEligibilite(transport, rec, {
    scoreThreshold: auto.scoreThreshold,
  });

  if (!verdict.eligible) {
    // Marque la reco comme rejected avec raison technique (pour debug + ne pas
    // qu'elle pollue la file de validation)
    await DispatchRecommendation.findByIdAndUpdate(rec._id, {
      $set: {
        "decision.status":          "rejected",
        "decision.rejectionReason": `auto-dispatch ineligible: ${verdict.raisons.join(", ")}`,
        "decision.decidedAt":       new Date(),
      },
    });
    logger.info("[autoDispatch] non éligible, reco rejetée auto", {
      transportId, recId: rec._id, raisons: verdict.raisons,
    });
    return { eligible: false, raisons: verdict.raisons, recommendationId: rec._id };
  }

  // ── 5. Branche selon requireApproval ─────────────────────────────────────
  if (auto.requireApproval) {
    // Mode HITL : proposition pending, notif dispatcher
    socketService.getIO?.()?.to("role:dispatcher").emit("autoDispatch:proposal_created", {
      transportId: transport._id,
      numero:      transport.numero,
      recommendationId: rec._id,
      score:       best.score,
      vehiculeId:  best.vehiculeId,
      vehicleName: best.vehicleName,
      driverName:  best.driverName,
    });
    socketService.getIO?.()?.to("role:admin").emit("autoDispatch:proposal_created", {
      transportId: transport._id, numero: transport.numero, recommendationId: rec._id,
    });

    logger.info("[autoDispatch] proposition créée (HITL pending)", {
      transportId, recId: rec._id, score: best.score,
    });
    return { mode: "pending", recommendationId: rec._id, score: best.score };
  }

  // ── 6. Branche SENSIBLE : assignation effective ──────────────────────────
  // N'est exécutée que si enabled=true ET requireApproval=false.
  const transportLifecycle = require("../services/transportLifecycle");
  const systemUser = {
    _id: null,
    email: "auto-dispatch@system",
    role: "système",
  };

  try {
    const { transport: assignedTransport } = await transportLifecycle.assignerVehicule(
      transport._id,
      {
        vehiculeId:  best.vehiculeId,
        chauffeurId: best.chauffeurId || best.driverId || null,
      },
      systemUser,
    );

    // Marque la reco comme accepted (décidée par le système)
    await DispatchRecommendation.findByIdAndUpdate(rec._id, {
      $set: {
        "decision.status":          "accepted",
        "decision.decidedAt":       new Date(),
        "decision.decidedBy":       null, // pas d'utilisateur humain
        "decision.finalVehiculeId": best.vehiculeId,
        "decision.finalChauffeurId": best.chauffeurId || best.driverId || null,
      },
    });

    // Audit obligatoire (non silencieux)
    await auditService.log({
      action:    "AUTO_DISPATCH_ASSIGNED",
      origine:   "SYSTÈME",
      utilisateur: systemUser,
      ressource: {
        type: "Transport",
        id:   transport._id,
        reference: transport.numero,
      },
      details: {
        message: `Auto-dispatch assigné véhicule ${best.vehiculeId} (score ${best.score})`,
        metadata: {
          recommendationId: String(rec._id),
          score:            best.score,
          criteriaScores:   best.criteriaScores || null,
        },
      },
    });

    socketService.getIO?.()?.to("role:dispatcher").emit("autoDispatch:auto_assigned", {
      transportId: transport._id,
      numero:      transport.numero,
      recommendationId: rec._id,
      vehiculeId:  best.vehiculeId,
      score:       best.score,
    });

    logger.info("[autoDispatch] assignation automatique effectuée", {
      transportId, recId: rec._id, vehiculeId: best.vehiculeId, score: best.score,
    });

    return {
      mode: "auto_assigned",
      recommendationId: rec._id,
      vehiculeId: best.vehiculeId,
      score: best.score,
      transportNumero: assignedTransport.numero,
    };
  } catch (err) {
    logger.error("[autoDispatch] échec assignation effective", {
      transportId, recId: rec._id, err: err.message,
    });
    // Rabattre la reco en pending pour qu'un humain la traite
    await DispatchRecommendation.findByIdAndUpdate(rec._id, {
      $set: {
        "decision.status":          "pending",
        "decision.rejectionReason": `auto-assign-failed: ${err.message}`,
      },
    });
    throw err; // BullMQ retentera selon backoff
  }
}

// ── Boot worker (uniquement si Redis dispo) ─────────────────────────────────
let autoDispatchWorker = null;

if (connection) {
  autoDispatchWorker = new Worker(
    QUEUES.AUTODISPATCH,
    processAutoDispatchJob,
    { connection, concurrency: 2 },
  );

  autoDispatchWorker.on("completed", (job, res) =>
    logger.info(`[worker:autodispatch] job ${job.id} OK`, { result: res?.mode || res?.skipped || "done" }),
  );
  autoDispatchWorker.on("failed", (job, err) =>
    logger.warn(`[worker:autodispatch] job ${job?.id} KO`, { err: err.message, attempts: job?.attemptsMade }),
  );
  autoDispatchWorker.on("error", (err) =>
    logger.error("[worker:autodispatch] erreur globale", { err: err.message }),
  );
}

module.exports = {
  autoDispatchWorker,
  processAutoDispatchJob, // exporté pour tests
};
