/**
 * BlancBleu — Erreurs métier typées.
 *
 * Chaque sous-classe porte un `statusCode` HTTP suggéré pour mapper
 * directement vers la réponse HTTP côté contrôleur (sans grep de message).
 *
 * Usage :
 *   const { ConflictError } = require("../utils/errors");
 *   throw new ConflictError("Véhicule déjà occupé");
 *
 * Dans le contrôleur :
 *   if (err instanceof ConflictError) return res.status(err.statusCode).json({ message: err.message });
 */

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    // Préserve la stack trace V8 sans cette frame interne.
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Conflit de ressource — 409. Typiquement levé quand une ressource est déjà
 * dans un état qui empêche l'opération (ex: véhicule déjà assigné à un autre
 * transport, transport déjà avancé dans le workflow).
 */
class ConflictError extends AppError {
  constructor(message = "Conflit de ressource") {
    super(message, 409);
  }
}

/**
 * Action interdite par le contrôle d'accès — 403. Typiquement levé quand un
 * utilisateur authentifié essaie d'exécuter une action non autorisée pour
 * son rôle (ex: chauffeur qui tente d'annuler un transport, comptable qui
 * tente de marquer EN_ROUTE).
 *
 * Distinguer de 401 (non authentifié) — ici l'auth est OK, c'est l'autorisation
 * métier qui refuse.
 */
class ForbiddenError extends AppError {
  constructor(message = "Action non autorisée pour ce rôle") {
    super(message, 403);
  }
}

module.exports = { AppError, ConflictError, ForbiddenError };
