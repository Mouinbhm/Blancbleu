/**
 * BlancBleu — Service Socket.IO Temps Réel
 */
let _io = null;

function init(io) {
  _io = io;
  io.on("connection", (socket) => {
    console.log(`🔌 Client connecté : ${socket.id}`);
    socket.on("join:role", (role) => socket.join(`role:${role}`));
    socket.on("disconnect", () => console.log(`❌ Déconnecté : ${socket.id}`));
  });
}

function emitNouvelleIntervention(intervention) {
  if (!_io) return;
  _io.emit("intervention:nouvelle", {
    _id: intervention._id,
    numero: intervention.numero,
    typeIncident: intervention.typeIncident,
    priorite: intervention.priorite,
    adresse: intervention.adresse,
    statut: intervention.statut,
    scoreIA: intervention.scoreIA,
    createdAt: intervention.createdAt,
  });
}

function emitStatutIntervention(interventionId, statut, unitNom) {
  if (!_io) return;
  _io.emit("intervention:statut", {
    interventionId,
    statut,
    unitNom,
    timestamp: new Date(),
  });
}

function emitStatutUnite(unitId, statut, nom) {
  if (!_io) return;
  _io.emit("unite:statut", { unitId, statut, nom, timestamp: new Date() });
}

function emitDispatch(interventionId, unite, eta) {
  if (!_io) return;
  _io.emit("dispatch:effectue", {
    interventionId,
    unite: { _id: unite._id, nom: unite.nom, type: unite.type },
    eta,
    timestamp: new Date(),
  });
}

function emitAlerteP1(intervention) {
  if (!_io) return;
  _io.emit("alerte:p1", {
    message: `🚨 P1 — ${intervention.typeIncident} à ${intervention.adresse}`,
    intervention: intervention._id,
    timestamp: new Date(),
  });
}

function emitEscalade(data) {
  if (!_io) return;
  _io.emit("escalade:alerte", { ...data, timestamp: new Date() });
}

function emitStats(stats) {
  if (!_io) return;
  _io.emit("stats:update", stats);
}

module.exports = {
  init,
  emitNouvelleIntervention,
  emitStatutIntervention,
  emitStatutUnite,
  emitDispatch,
  emitAlerteP1,
  emitEscalade,
  emitStats,
};
