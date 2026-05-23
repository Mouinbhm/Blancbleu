/**
 * Garde service-to-service : exige un header X-Service-Token correspondant à
 * AI_SERVICE_TOKEN. Utilisé pour les endpoints appelés par le microservice IA
 * Python (pas de session utilisateur).
 *
 * Si AI_SERVICE_TOKEN est absent côté serveur, on refuse toute requête
 * (fail-secure). Le développeur doit l'ajouter à son .env pour activer
 * les routes service.
 */

module.exports = function serviceToken(req, res, next) {
  const expected = process.env.AI_SERVICE_TOKEN;
  if (!expected) {
    return res.status(503).json({ message: "AI_SERVICE_TOKEN non configuré côté serveur" });
  }
  const provided = req.get("X-Service-Token");
  if (!provided || provided !== expected) {
    return res.status(401).json({ message: "Service token invalide ou manquant" });
  }
  next();
};
