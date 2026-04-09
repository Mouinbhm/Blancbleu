/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — Service Socket.IO Temps Réel                   ║
 * ║  Architecture événementielle complète                       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  ÉVÉNEMENTS ÉMIS :                                          ║
 * ║  intervention:created     → nouvelle intervention           ║
 * ║  intervention:updated     → modification générale           ║
 * ║  unit:assigned            → unité assignée                  ║
 * ║  status:updated           → changement de statut            ║
 * ║  escalation:triggered     → escalade déclenchée             ║
 * ║  dispatch:completed       → auto-dispatch effectué          ║
 * ║  unit:status_changed      → statut d'une unité              ║
 * ║  alerte:p1                → alerte critique P1              ║
 * ║  stats:update             → mise à jour des statistiques    ║
 * ║  system:heartbeat         → ping serveur toutes les 30s     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

let _io = null;

// ─── Salles Socket.IO ─────────────────────────────────────────────────────────
const ROOMS = {
  ADMINS: "role:admin",
  SUPERVISORS: "role:superviseur",
  DISPATCHERS: "role:dispatcher",
  ALL: "broadcast",
};

// ── Init ──────────────────────────────────────────────────────────────────────
function init(io) {
  _io = io;

  io.on("connection", (socket) => {
    console.log(`🔌 Socket connecté : ${socket.id}`);

    // Rejoindre salle selon rôle
    socket.on("join:role", ({ role, userId }) => {
      socket.join(`role:${role}`);
      socket.join(ROOMS.ALL);
      socket.data.role = role;
      socket.data.userId = userId;
      console.log(`  → ${socket.id} rejoint role:${role}`);

      // Confirmer la connexion au client
      socket.emit("connected:ack", {
        socketId: socket.id,
        role,
        timestamp: new Date(),
        message: "Connexion temps réel établie — BlancBleu",
      });
    });

    // Client demande les stats actuelles
    socket.on("request:stats", async () => {
      try {
        const stats = await _getStatsRapides();
        socket.emit("stats:update", stats);
      } catch {}
    });

    socket.on("disconnect", (reason) => {
      console.log(`❌ Socket déconnecté : ${socket.id} (${reason})`);
    });
  });

  // Heartbeat toutes les 30 secondes
  setInterval(() => {
    if (_io) {
      _io.emit("system:heartbeat", { timestamp: new Date(), status: "ok" });
    }
  }, 30000);
}

// ═════════════════════════════════════════════════════════════════════════════
// ÉVÉNEMENTS INTERVENTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * intervention:created
 * Émis quand une nouvelle intervention est créée
 */
function emitInterventionCreated(intervention) {
  if (!_io) return;
  const payload = {
    event: "intervention:created",
    _id: intervention._id,
    numero: intervention.numero,
    typeIncident: intervention.typeIncident,
    priorite: intervention.priorite,
    adresse: intervention.adresse,
    statut: intervention.statut,
    scoreIA: intervention.scoreIA,
    patient: intervention.patient,
    createdAt: intervention.createdAt || new Date(),
    timestamp: new Date(),
  };

  // Tous les connectés reçoivent les nouvelles interventions
  _io.emit("intervention:created", payload);

  // P1 → alerte spéciale en plus
  if (intervention.priorite === "P1") {
    _io.emit("alerte:p1", {
      message: `🚨 P1 CRITIQUE — ${intervention.typeIncident} à ${intervention.adresse}`,
      intervention: intervention._id,
      numero: intervention.numero,
      timestamp: new Date(),
    });
  }

  console.log(
    `📡 [SOCKET] intervention:created → ${intervention.numero} (${intervention.priorite})`,
  );
}

/**
 * unit:assigned
 * Émis quand une unité est assignée à une intervention
 */
function emitUnitAssigned({
  intervention,
  unite,
  eta,
  score,
  source = "MANUEL",
}) {
  if (!_io) return;
  const payload = {
    event: "unit:assigned",
    interventionId: intervention._id,
    numero: intervention.numero,
    priorite: intervention.priorite,
    unite: {
      _id: unite._id,
      nom: unite.nom,
      type: unite.type,
    },
    eta,
    score,
    source, // 'AUTO' | 'MANUEL'
    timestamp: new Date(),
  };

  _io.emit("unit:assigned", payload);
  console.log(
    `📡 [SOCKET] unit:assigned → ${unite.nom} → ${intervention.numero}`,
  );
}

/**
 * status:updated
 * Émis à chaque changement de statut d'une intervention (state machine)
 */
function emitStatusUpdated({
  intervention,
  ancienStatut,
  nouveauStatut,
  utilisateur,
}) {
  if (!_io) return;
  const payload = {
    event: "status:updated",
    interventionId: intervention._id,
    numero: intervention.numero,
    priorite: intervention.priorite,
    ancienStatut,
    nouveauStatut,
    utilisateur: utilisateur || "système",
    progression: _calculerProgression(nouveauStatut),
    timestamp: new Date(),
  };

  _io.emit("status:updated", payload);
  console.log(
    `📡 [SOCKET] status:updated → ${intervention.numero} : ${ancienStatut} → ${nouveauStatut}`,
  );
}

/**
 * escalation:triggered
 * Émis quand le moteur d'escalade détecte une situation critique
 */
function emitEscalationTriggered({ intervention, alertes, niveauMaximal }) {
  if (!_io) return;
  const payload = {
    event: "escalation:triggered",
    interventionId: intervention?._id || null,
    numero: intervention?.numero || null,
    priorite: intervention?.priorite || null,
    alertes: alertes.map((a) => ({
      code: a.code,
      message: a.message,
      niveau: a.niveau?.label || a.niveau,
      couleur: a.niveau?.couleur || "red",
      action: a.action,
    })),
    niveauMaximal: niveauMaximal?.label || "EMERGENCY",
    timestamp: new Date(),
  };

  // Escalade → admins + superviseurs en priorité
  _io.to(ROOMS.ADMINS).emit("escalation:triggered", payload);
  _io.to(ROOMS.SUPERVISORS).emit("escalation:triggered", payload);
  _io.to(ROOMS.DISPATCHERS).emit("escalation:triggered", payload);

  console.log(
    `📡 [SOCKET] escalation:triggered → ${alertes.length} alerte(s) — niveau ${niveauMaximal?.label}`,
  );
}

/**
 * dispatch:completed
 * Émis quand l'auto-dispatch a sélectionné une unité
 */
function emitDispatchCompleted({
  intervention,
  unite,
  score,
  eta,
  alternatives,
}) {
  if (!_io) return;
  const payload = {
    event: "dispatch:completed",
    interventionId: intervention._id,
    numero: intervention.numero,
    unite: {
      _id: unite._id,
      nom: unite.nom,
      type: unite.type,
    },
    score,
    eta,
    alternatives: alternatives || [],
    timestamp: new Date(),
  };

  _io.emit("dispatch:completed", payload);
  console.log(
    `📡 [SOCKET] dispatch:completed → ${unite.nom} (score ${score}/100)`,
  );
}

/**
 * unit:status_changed
 * Émis quand le statut d'une unité change (disponible ↔ en_mission)
 */
function emitUnitStatusChanged({ unite, ancienStatut, nouveauStatut }) {
  if (!_io) return;
  const payload = {
    event: "unit:status_changed",
    unitId: unite._id,
    nom: unite.nom,
    type: unite.type,
    ancienStatut,
    nouveauStatut,
    timestamp: new Date(),
  };

  _io.emit("unit:status_changed", payload);
  console.log(
    `📡 [SOCKET] unit:status_changed → ${unite.nom} : ${ancienStatut} → ${nouveauStatut}`,
  );
}

/**
 * stats:update
 * Émis après chaque événement important pour actualiser les KPIs
 */
async function emitStatsUpdate() {
  if (!_io) return;
  try {
    const stats = await _getStatsRapides();
    _io.emit("stats:update", stats);
  } catch {}
}

// ─── Fonctions héritées (compatibilité) ───────────────────────────────────────
const emitNouvelleIntervention = emitInterventionCreated;
const emitStatutIntervention = (id, statut, unitNom) =>
  emitStatusUpdated({
    intervention: { _id: id, numero: "", priorite: "" },
    ancienStatut: "",
    nouveauStatut: statut,
    utilisateur: unitNom,
  });
const emitStatutUnite = (unitId, statut, nom) =>
  emitUnitStatusChanged({
    unite: { _id: unitId, nom, type: "" },
    ancienStatut: "",
    nouveauStatut: statut,
  });
const emitDispatch = (interventionId, unite, eta) =>
  emitDispatchCompleted({
    intervention: { _id: interventionId, numero: "", priorite: "" },
    unite,
    score: 0,
    eta,
  });
const emitAlerteP1 = (intervention) =>
  emitInterventionCreated({ ...intervention, priorite: "P1" });
const emitEscalade = (data) =>
  emitEscalationTriggered({
    intervention: { _id: data.interventionId, numero: data.numero },
    alertes: data.alertes || [],
    niveauMaximal: { label: "EMERGENCY" },
  });
const emitStats = emitStatsUpdate;

// ─── Helpers privés ───────────────────────────────────────────────────────────
function _calculerProgression(statut) {
  const ordre = [
    "CREATED",
    "VALIDATED",
    "ASSIGNED",
    "EN_ROUTE",
    "ON_SITE",
    "TRANSPORTING",
    "COMPLETED",
  ];
  const idx = ordre.indexOf(statut);
  return idx === -1 ? null : Math.round((idx / (ordre.length - 1)) * 100);
}

async function _getStatsRapides() {
  try {
    const Intervention = require("../models/Intervention");
    const Unit = require("../models/Unit");
    const [total, p1, p2, p3, actives, dispo] = await Promise.all([
      Intervention.countDocuments(),
      Intervention.countDocuments({
        priorite: "P1",
        statut: { $nin: ["COMPLETED", "CANCELLED"] },
      }),
      Intervention.countDocuments({
        priorite: "P2",
        statut: { $nin: ["COMPLETED", "CANCELLED"] },
      }),
      Intervention.countDocuments({
        priorite: "P3",
        statut: { $nin: ["COMPLETED", "CANCELLED"] },
      }),
      Intervention.countDocuments({
        statut: { $nin: ["COMPLETED", "CANCELLED"] },
      }),
      Unit.countDocuments({ statut: "disponible" }),
    ]);
    return {
      total,
      actives,
      parPriorite: { P1: p1, P2: p2, P3: p3 },
      unitesDisponibles: dispo,
      timestamp: new Date(),
    };
  } catch {
    return null;
  }
}

module.exports = {
  init,
  ROOMS,
  // Nouveaux événements
  emitInterventionCreated,
  emitUnitAssigned,
  emitStatusUpdated,
  emitEscalationTriggered,
  emitDispatchCompleted,
  emitUnitStatusChanged,
  emitStatsUpdate,
  // Compatibilité anciens noms
  emitNouvelleIntervention,
  emitStatutIntervention,
  emitStatutUnite,
  emitDispatch,
  emitAlerteP1,
  emitEscalade,
  emitStats,
};
