/**
 * Middleware requestContext + helper getContext().
 *
 * Génère un requestId court pour chaque requête HTTP (ou réutilise le header
 * X-Request-Id si fourni en amont — proxy, autre service). Stocke ce
 * requestId (+ userId si dispo) dans un AsyncLocalStorage, accessible
 * partout via getContext() pour que les logs Winston (et autres) puissent
 * tagger leurs lignes sans le passer en paramètre.
 *
 * Branché tôt dans Server.js (après cookieParser, avant les routes).
 */

const { AsyncLocalStorage } = require("async_hooks");
const { nanoid } = require("nanoid");

const als = new AsyncLocalStorage();

function requestContext(req, res, next) {
  const requestId = req.headers["x-request-id"] || nanoid(10);
  // Echo back pour permettre au client (et aux navigateurs/proxies) de
  // corréler une réponse aux logs serveur.
  res.setHeader("x-request-id", requestId);
  // userId : populé seulement après le middleware `protect`, donc souvent
  // absent ici ; le record peut être enrichi plus tard si besoin.
  als.run({ requestId, userId: req.user?._id }, () => next());
}

/** Retourne le contexte de la requête courante, ou {} hors requête. */
function getContext() {
  return als.getStore() || {};
}

module.exports = { requestContext, getContext, als };
