/**
 * BlancBleu — Auto-Dispatch Service
 *
 * Évalue si un transport est éligible à une assignation automatique.
 *
 * Philosophie : "l'IA propose, l'humain dispose". L'auto-dispatch n'est
 * autorisé que pour les transports à faible risque ET avec un match parfait
 * de véhicule. Les transports ALLONGE/CIVIERE sont systématiquement exclus
 * (trop sensibles, nécessitent une décision humaine).
 *
 * La fonction est PURE — pas d'I/O, testable sans DB.
 * Les défauts (DEFAULT_AUTODISPATCH dans DispatchConfig) sont SAFE :
 *   - enabled = false (rien ne se déclenche)
 *   - requireApproval = true (même si activé, validation humaine obligatoire)
 */

const DEFAULT_CONFIG = {
  scoreThreshold:  80,
  minLeadMinutes:  30,  // doit être au minimum 30 min avant le départ
};

const MOBILITES_AUTORISEES = new Set(["ASSIS", "FAUTEUIL_ROULANT"]);

/**
 * @param {Object} transport       - Document Transport (au moins statut, patient.mobilite, dateTransport, heureRDV)
 * @param {Object} recommendation  - DispatchRecommendation (avec bestRecommendation peuplé)
 * @param {Object} [autoCfg]       - Config { scoreThreshold, minLeadMinutes }
 * @param {Date}   [now]           - Pour testabilité — défaut : new Date()
 * @returns {{ eligible: boolean, raisons: string[] }}
 */
function evaluerEligibilite(transport, recommendation, autoCfg = {}, now = new Date()) {
  const raisons = [];
  const cfg = { ...DEFAULT_CONFIG, ...autoCfg };

  if (!transport) {
    return { eligible: false, raisons: ["transport_absent"] };
  }
  if (!recommendation || !recommendation.bestRecommendation) {
    return { eligible: false, raisons: ["recommendation_absente"] };
  }

  const best = recommendation.bestRecommendation;

  // 1. Statut transport
  if (transport.statut !== "SCHEDULED") {
    raisons.push(`statut_invalide:${transport.statut}`);
  }

  // 2. Pas déjà assigné (idempotence)
  if (transport.vehicule) {
    raisons.push("deja_assigne");
  }

  // 3. Mobilité autorisée
  const mobilite = transport.patient?.mobilite || transport.mobilite;
  if (!mobilite || !MOBILITES_AUTORISEES.has(mobilite)) {
    raisons.push(`mobilite_non_autorisee:${mobilite || "absente"}`);
  }

  // 4. Score minimum
  const score = Number(best.score);
  if (!Number.isFinite(score) || score < cfg.scoreThreshold) {
    raisons.push(`score_insuffisant:${score}<${cfg.scoreThreshold}`);
  }

  // 5. Match véhicule parfait (pas de compromis sur le type)
  const vehicleTypeMatch = best.criteriaScores?.vehicleTypeMatch;
  if (vehicleTypeMatch !== 100) {
    raisons.push(`vehicleTypeMatch_imparfait:${vehicleTypeMatch ?? "absent"}`);
  }

  // 6. Pas de risque bloquant
  if (Array.isArray(best.risks) && best.risks.length > 0) {
    raisons.push(`risques_presents:${best.risks.length}`);
  }

  // 7. Véhicule candidat identifiable
  if (!best.vehiculeId) {
    raisons.push("candidat_sans_vehicule");
  }

  // 8. Délai minimum avant départ (laisse temps de révision)
  const dt = _resolveDateTransport(transport);
  if (!dt) {
    raisons.push("date_transport_absente");
  } else {
    const leadMs = dt.getTime() - now.getTime();
    const leadMin = leadMs / 60000;
    if (leadMin < cfg.minLeadMinutes) {
      raisons.push(`delai_insuffisant:${Math.round(leadMin)}min<${cfg.minLeadMinutes}min`);
    }
  }

  return {
    eligible: raisons.length === 0,
    raisons,
  };
}

/**
 * Combine transport.dateTransport (jour) + heureRDV ("HH:MM") en un Date complet.
 * heureRDV n'écrase l'heure de dateTransport QUE si celle-ci est à minuit
 * local (cas où la date stockée est un jour brut sans heure significative).
 * Sinon on garde l'heure déjà présente.
 */
function _resolveDateTransport(transport) {
  if (!transport.dateTransport) return null;
  const dt = new Date(transport.dateTransport);
  if (Number.isNaN(dt.getTime())) return null;

  const dejaAvecHeure = dt.getHours() !== 0 || dt.getMinutes() !== 0;
  if (dejaAvecHeure) return dt;

  const heure = transport.heureRDV || transport.heureDepart;
  if (typeof heure === "string" && /^\d{1,2}:\d{2}$/.test(heure)) {
    const [h, m] = heure.split(":").map(Number);
    dt.setHours(h, m, 0, 0);
  }
  return dt;
}

module.exports = {
  evaluerEligibilite,
  DEFAULT_CONFIG,
  MOBILITES_AUTORISEES,
  _resolveDateTransport, // exporté pour tests
};
