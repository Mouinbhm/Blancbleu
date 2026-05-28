/**
 * BlancBleu — Contrôleur Auto-Dispatch Queue
 *
 * Endpoints (rôles dispatcher/superviseur/admin) :
 *   GET    /api/ai/dispatch/auto/queue          → liste propositions pending
 *   GET    /api/ai/dispatch/auto/queue/count    → compteur (pour badge sidebar)
 *   POST   /api/ai/dispatch/auto/:recId/accept  → validation humaine (assigne)
 *   POST   /api/ai/dispatch/auto/:recId/reject  → rejet humain (raison requise)
 */

const DispatchRecommendation = require("../models/DispatchRecommendation");
const Transport = require("../models/Transport");
const transportLifecycle = require("../services/transportLifecycle");
const auditService = require("../services/auditService");
const socketService = require("../services/socketService");
const logger = require("../utils/logger");

// ── GET /api/ai/dispatch/auto/queue ─────────────────────────────────────────
exports.getQueue = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const recs = await DispatchRecommendation.find({ "decision.status": "pending" })
      .sort({ generatedAt: -1 })
      .limit(limit)
      .populate({
        path: "transportId",
        select:
          "numero statut motif typeTransport dateTransport heureRDV patient adresseDepart adresseDestination",
      })
      .lean();

    // Filtrer les recos dont le transport a été supprimé entre temps
    const valid = recs.filter((r) => r.transportId);

    res.json({
      count: valid.length,
      proposals: valid.map((r) => ({
        recommendationId: r._id,
        generatedAt: r.generatedAt,
        source: r.source,
        transport: r.transportId,
        best: r.bestRecommendation,
        alternatives: (r.recommendations || []).slice(1, 3),
        summary: r.summary,
      })),
    });
  } catch (err) {
    logger.error("[autoDispatch] getQueue", { err: err.message });
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/ai/dispatch/auto/queue/count ───────────────────────────────────
exports.getQueueCount = async (_req, res) => {
  try {
    const count = await DispatchRecommendation.countDocuments({ "decision.status": "pending" });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/ai/dispatch/auto/:recId/accept ────────────────────────────────
exports.accept = async (req, res) => {
  try {
    const rec = await DispatchRecommendation.findById(req.params.recId);
    if (!rec) return res.status(404).json({ message: "Recommandation introuvable" });
    if (rec.decision.status !== "pending") {
      return res.status(409).json({
        message: `Cette recommandation est déjà ${rec.decision.status}`,
      });
    }

    const transport = await Transport.findById(rec.transportId);
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    if (transport.vehicule) {
      return res.status(409).json({ message: "Transport déjà assigné" });
    }

    const best = rec.bestRecommendation;
    const userCtx = { _id: req.user._id, email: req.user.email, role: req.user.role };

    const { transport: updated } = await transportLifecycle.assignerVehicule(
      transport._id,
      {
        vehiculeId: best.vehiculeId,
        chauffeurId: best.chauffeurId || null,
      },
      userCtx,
    );

    await DispatchRecommendation.findByIdAndUpdate(rec._id, {
      $set: {
        "decision.status": "accepted",
        "decision.decidedAt": new Date(),
        "decision.decidedBy": req.user._id,
        "decision.finalVehiculeId": best.vehiculeId,
        "decision.finalChauffeurId": best.chauffeurId || null,
      },
    });

    await auditService.log({
      action: "AUTO_DISPATCH_PROPOSAL",
      origine: "HUMAIN",
      utilisateur: userCtx,
      ressource: { type: "Transport", id: transport._id, reference: transport.numero },
      details: {
        message: `Proposition auto-dispatch validée par ${req.user.email}`,
        metadata: { recommendationId: String(rec._id), score: best.score },
      },
    });

    socketService.getIO?.()?.to("role:dispatcher").emit("autoDispatch:proposal_decided", {
      recommendationId: rec._id,
      transportId: transport._id,
      decision: "accepted",
      decidedBy: req.user.email,
    });

    res.json({
      success: true,
      transport: { id: updated._id, numero: updated.numero, statut: updated.statut },
    });
  } catch (err) {
    logger.error("[autoDispatch] accept", { err: err.message });
    // ConflictError (véhicule déjà occupé / transport non assignable) → 409
    if (err && typeof err.statusCode === "number") {
      return res.status(err.statusCode).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/ai/dispatch/auto/:recId/reject ────────────────────────────────
exports.reject = async (req, res) => {
  try {
    const { raison } = req.body || {};
    if (!raison || raison.trim().length < 3) {
      return res.status(400).json({ message: "Raison du rejet requise (min 3 caractères)" });
    }

    const rec = await DispatchRecommendation.findById(req.params.recId);
    if (!rec) return res.status(404).json({ message: "Recommandation introuvable" });
    if (rec.decision.status !== "pending") {
      return res.status(409).json({
        message: `Cette recommandation est déjà ${rec.decision.status}`,
      });
    }

    await DispatchRecommendation.findByIdAndUpdate(rec._id, {
      $set: {
        "decision.status": "rejected",
        "decision.decidedAt": new Date(),
        "decision.decidedBy": req.user._id,
        "decision.rejectionReason": raison.trim(),
      },
    });

    await auditService.log({
      action: "AUTO_DISPATCH_REJECTED",
      origine: "HUMAIN",
      utilisateur: { _id: req.user._id, email: req.user.email, role: req.user.role },
      ressource: { type: "Transport", id: rec.transportId, reference: String(rec.transportId) },
      details: { message: `Proposition rejetée : ${raison}` },
    });

    socketService.getIO?.()?.to("role:dispatcher").emit("autoDispatch:proposal_decided", {
      recommendationId: rec._id,
      transportId: rec.transportId,
      decision: "rejected",
      decidedBy: req.user.email,
      reason: raison,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error("[autoDispatch] reject", { err: err.message });
    res.status(500).json({ message: err.message });
  }
};
