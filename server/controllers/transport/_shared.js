/**
 * BlancBleu — Helpers partagés du contrôleur Transport.
 *
 * Extraits du god controller original (server/controllers/transportController.js)
 * pour éviter la duplication entre les modules split.
 */

const Transport = require("../../models/Transport");

// ── Garde-fou date : transitions terrain uniquement ──────────────────────────
// Bloque EN_ROUTE / ARRIVED / ON_BOARD / DESTINATION / COMPLETE si le transport
// n'est pas planifié aujourd'hui.
// Contournable avec { bypass_date_check: true } en développement uniquement.
async function _verifierDateTerrain(transportId, body = {}) {
  if (body.bypass_date_check && process.env.NODE_ENV !== "production") return null;

  const t = await Transport.findById(transportId).select("dateTransport heureRDV");
  if (!t?.dateTransport) return null;

  const jourTransport = new Date(t.dateTransport);
  jourTransport.setHours(0, 0, 0, 0);

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const estJourJ = jourTransport.getTime() === debutJour.getTime();
  if (estJourJ) return null;

  const dateStr = new Date(t.dateTransport).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    message: `Ce transport est planifié le ${dateStr}. Les actions terrain ne sont disponibles qu'à cette date.`,
    code: "TRANSPORT_DATE_FUTURE",
    dateTransport: t.dateTransport,
  };
}

// ── Map d'erreur standard pour les endpoints lifecycle ──────────────────────
// Priorise statusCode (AppError + sous-classes : ForbiddenError 403,
// ConflictError 409). Sinon, heuristique sur le message (legacy errors).
function _handleErr(res, next, e) {
  if (e && typeof e.statusCode === "number") {
    return res.status(e.statusCode).json({ message: e.message });
  }
  if (e.message?.includes("introuvable")) return res.status(404).json({ message: e.message });
  if (e.message?.includes("Transition invalide") || e.message?.includes("Conditions non remplies"))
    return res.status(422).json({ message: e.message });
  if (e.message?.includes("Aucun véhicule")) return res.status(409).json({ message: e.message });
  return next(e);
}

// Champs autorisés en PATCH /api/transports/:id (sécurité contre la mass-assign)
const UPDATE_WHITELIST = [
  "notes",
  "heureDepart",
  "allerRetour",
  "adresseDepart",
  "adresseDestination",
  "tauxPriseEnCharge",
];

// Logger lazy (tolère l'absence d'utils/logger pendant les tests bootstrap)
const logger = (() => {
  try {
    return require("../../utils/logger");
  } catch {
    return console;
  }
})();

module.exports = { _verifierDateTerrain, _handleErr, UPDATE_WHITELIST, logger };
