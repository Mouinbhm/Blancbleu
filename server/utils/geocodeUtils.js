/**
 * BlancBleu — Géocodage d'adresses françaises (côté serveur)
 *
 * Utilise la Base Adresse Nationale (BAN) maintenue par Etalab / IGN.
 * API publique, sans clé, conforme RGPD, données souveraines françaises.
 * https://api-adresse.data.gouv.fr
 *
 * Usage :
 *   const { lat, lng, score } = await geocodeAdresse("12 Rue de la Paix, Nice");
 *   // Retourne null si l'adresse est introuvable ou si le service est indisponible.
 *
 * Intégré dans transportController.js pour géocoder automatiquement les adresses
 * soumises sans coordonnées GPS (ex : saisie manuelle depuis un autre formulaire).
 */

const axios = require("axios");
const logger = require("./logger");

const BAN_SEARCH_URL = "https://api-adresse.data.gouv.fr/search/";

// Timeout conservateur — la BAN est généralement rapide (<200ms)
// mais peut ralentir si le serveur est sollicité.
const BAN_TIMEOUT_MS = 5000;

// Seuil de confiance minimal : en dessous, on préfère ne pas utiliser le résultat
// (0.4 = assez bas pour accepter des adresses partielles en milieu rural)
const SCORE_MIN = 0.4;

/**
 * Géocode une adresse française via l'API BAN (data.gouv.fr).
 *
 * @param {string} adresseString - Adresse complète en une chaîne
 *   Ex : "12 Rue de la Paix 06000 Nice"
 *   Ex : "CHU de Nice, 30 Voie Romaine, Nice"
 *
 * @returns {Promise<{ lat: number, lng: number, score: number, label: string } | null>}
 *   null si l'adresse est introuvable, score insuffisant, ou service indisponible.
 */
async function geocodeAdresse(adresseString) {
  if (!adresseString || !adresseString.trim()) return null;

  try {
    const { data } = await axios.get(BAN_SEARCH_URL, {
      params: {
        q: adresseString.trim(),
        limit: 1,
      },
      timeout: BAN_TIMEOUT_MS,
    });

    const feature = data.features?.[0];
    if (!feature) {
      logger.debug("[Géocodage] Aucun résultat BAN", { adresse: adresseString });
      return null;
    }

    const { score, label } = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;

    if (score < SCORE_MIN) {
      logger.warn("[Géocodage] Score BAN trop faible — coordonnées ignorées", {
        adresse: adresseString,
        label,
        score,
      });
      return null;
    }

    logger.debug("[Géocodage] Succès BAN", { adresse: adresseString, label, score, lat, lng });
    return { lat, lng, score, label };
  } catch (err) {
    // Ne jamais bloquer la création d'un transport pour un géocodage échoué
    logger.warn("[Géocodage] BAN indisponible ou timeout", {
      adresse: adresseString,
      err: err.message,
    });
    return null;
  }
}

/**
 * Géocode les deux adresses d'un transport en parallèle.
 * Retourne les deux résultats (null si échec individual).
 *
 * @param {Object} adresseDepart      - { rue, ville, codePostal }
 * @param {Object} adresseDestination - { rue, ville, codePostal, nom? }
 * @returns {Promise<[deparGeo|null, destGeo|null]>}
 */
async function geocodeTransport(adresseDepart, adresseDestination) {
  const buildLabel = (a) => {
    const standard = [a?.rue, a?.codePostal, a?.ville].filter(Boolean).join(" ");
    return standard || a?.nom || "";
  };

  const labelDepart = buildLabel(adresseDepart);
  const labelDest = buildLabel(adresseDestination);

  return Promise.all([
    labelDepart ? geocodeAdresse(labelDepart) : null,
    labelDest ? geocodeAdresse(labelDest) : null,
  ]);
}

module.exports = { geocodeAdresse, geocodeTransport };
