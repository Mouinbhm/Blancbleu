const Transport = require("../models/Transport");

const STAFF_ROLES = ["dispatcher", "admin", "superviseur"];

/**
 * Détermine si `user` peut accéder à un transport.
 * Appartenance basée UNIQUEMENT sur des identifiants immuables/uniques.
 * NE PAS utiliser nom/prénom/téléphone (modifiables → contournables).
 * @param {{ _id?: any, id?: any, role?: string, email?: string }} user
 * @param {string} transportId
 * @returns {Promise<boolean>}
 */
async function userCanAccessTransport(user, transportId) {
  if (!user || !transportId) return false;
  if (STAFF_ROLES.includes(user.role)) return true;

  const uid = String(user._id || user.id || "");
  const t = await Transport.findById(transportId)
    .select("createdBy chauffeur patient.email")
    .lean();
  if (!t) return false;

  if (uid && String(t.createdBy) === uid) return true;
  if (uid && t.chauffeur && String(t.chauffeur) === uid) return true;
  if (user.email && t.patient?.email && t.patient.email === user.email) return true;
  return false;
}

module.exports = { userCanAccessTransport, STAFF_ROLES };
