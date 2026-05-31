/**
 * BlancBleu — Façade contrôleur Transport (split par cas d'usage).
 *
 * Le god controller (server/controllers/transportController.js, 1090 LOC)
 * a été éclaté en 12 modules. Cet index réexporte l'API publique pour la
 * compatibilité ascendante : `require("./controllers/transport")` rend les
 * mêmes fonctions que l'ancien `require("./controllers/transportController")`.
 *
 * Pour ajouter une nouvelle action :
 *   - Identifier le module thématique (transitions, billing, pmt, …) ou en
 *     créer un nouveau si la responsabilité est distincte.
 *   - Exporter la fonction depuis le module.
 *   - L'ajouter ci-dessous pour qu'elle soit visible côté routes.
 */

module.exports = {
  // Read-only
  ...require("./list"), // getTransports
  ...require("./stats"), // getStats, estimerTarif
  ...require("./detail"), // getTransport, getTimeline, exportPdf

  // CRUD
  ...require("./create"), // createTransport, creerTransportsRecurrents
  ...require("./update"), // updateTransport, deleteTransport

  // Dispatch + transitions
  ...require("./assign"), // assigner
  ...require("./transitions"), // confirmer, planifier, enRoute, arriveePatient,
  // patientABord, arriveeDestination, completer,
  // noShow, annuler, reprogrammer, demarrerAttente,
  // demarrerRetour, accepterDriver, refuserDriver, fail

  // Clôture financière
  ...require("./billing"), // billingPending, paid, facturer

  // Documents
  ...require("./signature"), // addSignature
  ...require("./pmt"), // uploadPmt, getPmt, deletePmt

  // Notifications
  ...require("./notifications"), // getNotifications, markNotificationRead,
  // markAllNotificationsRead
};
