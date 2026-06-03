/**
 * BlancBleu — Service Lifecycle Transport Non Urgent (barrel)
 *
 * Orchestre toutes les transitions métier d'un transport :
 *   REQUESTED → CONFIRMED → SCHEDULED → ASSIGNED
 *   → EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP
 *   → PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION → COMPLETED
 *
 * Le module a été scindé par cas d'usage (transitions / assignment / completion
 * / documents) autour d'un noyau partagé `_core`. Ce barrel ré-exporte l'API
 * publique à l'identique : les importeurs (`require("../services/transportLifecycle")`)
 * ne changent pas.
 *
 * Remplace unitLifecycle.js (urgences).
 */

module.exports = {
  ...require("./transitions"),
  ...require("./assignment"),
  ...require("./completion"),
  ...require("./documents"),
};
