/**
 * BlancBleu — featureCollectorService
 *
 * Capture les features prédictibles + la durée réelle d'un transport terminé
 * et persiste dans `TransportFeature`. Sert de source de vérité pour le
 * réentraînement du DurationPredictor (Sprint 4).
 *
 * Garanties :
 *   - Idempotent (upsert sur transportId)
 *   - Ne fait jamais crasher l'appelant (try/catch global + log)
 *   - Filtre les durées aberrantes (< 3 min ou > 480 min)
 */

const TransportFeature = require("../models/TransportFeature");
const { haversine }    = require("../utils/geoUtils");
const logger           = require("../utils/logger");

const MIN_DUREE_MIN = 3;
const MAX_DUREE_MIN = 480; // 8h — au-delà c'est sûr du bruit (oubli de cloture)

function computeDureeMinutes(transport) {
  const pickup  = transport.actualPickupTime ? new Date(transport.actualPickupTime).getTime() : null;
  const dropoff = transport.actualDropoffTime ? new Date(transport.actualDropoffTime).getTime() : null;
  if (pickup && dropoff && dropoff > pickup) {
    return (dropoff - pickup) / 60000;
  }
  // Fallback : champ dénormalisé pré-calculé par le lifecycle
  if (typeof transport.dureeReelleMinutes === "number" && transport.dureeReelleMinutes > 0) {
    return transport.dureeReelleMinutes;
  }
  return null;
}

function computeDistanceKm(transport) {
  const d  = transport.adresseDepart?.coordonnees;
  const ds = transport.adresseDestination?.coordonnees;
  if (typeof d?.lat === "number" && typeof d?.lng === "number"
   && typeof ds?.lat === "number" && typeof ds?.lng === "number") {
    return haversine(d.lat, d.lng, ds.lat, ds.lng);
  }
  return null;
}

function parseHeureRDV(str) {
  if (typeof str !== "string") return null;
  const m = /^(\d{1,2}):/.exec(str);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return h >= 0 && h <= 23 ? h : null;
}

/**
 * Persiste les features + cible d'un transport terminé. Best-effort.
 *
 * @param {object} transport — document Transport (de préférence populated)
 * @returns {Promise<{ skipped?: string, _id?: string } | null>}
 */
async function captureTransportFeatures(transport) {
  try {
    if (!transport?._id) return null;

    const distanceKm        = computeDistanceKm(transport);
    const dureeReelleMinutes = computeDureeMinutes(transport);

    if (distanceKm == null) {
      logger.warn("[featureCollector] coords manquantes — skip", { transport: transport.numero });
      return { skipped: "missing_coords" };
    }
    if (dureeReelleMinutes == null) {
      logger.warn("[featureCollector] durée manquante — skip", { transport: transport.numero });
      return { skipped: "missing_duration" };
    }
    if (dureeReelleMinutes < MIN_DUREE_MIN || dureeReelleMinutes > MAX_DUREE_MIN) {
      logger.warn("[featureCollector] durée aberrante — skip", {
        transport: transport.numero, dureeReelleMinutes,
      });
      return { skipped: "duration_out_of_range" };
    }

    // Heure de référence : actualPickupTime si dispo, sinon heureRDV ("HH:MM")
    const pickupDate = transport.actualPickupTime
      ? new Date(transport.actualPickupTime)
      : (transport.dateTransport ? new Date(transport.dateTransport) : new Date());

    const heureDepart = transport.actualPickupTime
      ? pickupDate.getHours()
      : (parseHeureRDV(transport.heureRDV) ?? pickupDate.getHours());

    const completedAt = transport.actualDropoffTime
      ? new Date(transport.actualDropoffTime)
      : (transport.updatedAt ? new Date(transport.updatedAt) : new Date());

    const doc = await TransportFeature.findOneAndUpdate(
      { transportId: transport._id },
      {
        $set: {
          transportId:        transport._id,
          distanceKm,
          heureDepart,
          jourSemaine:        pickupDate.getDay(),
          mobilite:           transport.patient?.mobilite,
          typeVehicule:       transport.typeTransport,
          motif:              transport.motif,
          allerRetour:        !!transport.allerRetour,
          oxygene:            !!transport.patient?.oxygene,
          brancardage:        !!transport.patient?.brancardage,
          dureeReelleMinutes,
          completedAt,
          source:             "real",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return { _id: doc._id };
  } catch (err) {
    logger.warn("[featureCollector] capture échouée — ignoré", { err: err.message });
    return null;
  }
}

module.exports = { captureTransportFeatures };
