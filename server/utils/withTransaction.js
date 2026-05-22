const mongoose = require("mongoose");

/**
 * Exécute une fonction dans une transaction Mongoose si la connexion la supporte
 * (replica set), sinon en mode best-effort sans session.
 *
 * Permet d'écrire un code lifecycle qui exploite ACID en production (replica set
 * activé) sans casser les environnements de dev/test sur un Mongo standalone.
 *
 * @template T
 * @param {(session: mongoose.ClientSession | null) => Promise<T>} fn
 *   Fonction qui doit transmettre `session` à tous les writes critiques (save,
 *   findByIdAndUpdate, etc.) via `.session(session)`. Quand `session === null`,
 *   passer `null` à .session(null) est inoffensif.
 * @returns {Promise<T>}
 */
async function withTransactionOrFallback(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } catch (err) {
      // Le serveur n'est pas un replica set → repli sans session, comportement
      // identique à l'historique pré-Sprint 2.
      if (/Transaction numbers are only allowed on a replica set|Transactions are not supported|This MongoDB deployment does not support retryable writes|replica set/i.test(err.message || "")) {
        return await fn(null);
      }
      throw err;
    }
  } finally {
    session.endSession();
  }
}

module.exports = { withTransactionOrFallback };
