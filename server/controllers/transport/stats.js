/**
 * BlancBleu — Endpoints statistiques transport (lecture seule).
 *
 * GET /api/transports/stats        — agrégats par statut, type, motif
 * GET /api/transports/estimation   — estimation tarifaire CPAM (sans persistance)
 */

const Transport = require("../../models/Transport");
const tarifService = require("../../services/tarifService");

const getStats = async (req, res, next) => {
  try {
    const [total, enCours, planifies, completes, annules, noShows, parType, parMotif] =
      await Promise.all([
        Transport.countDocuments({ deletedAt: null }),
        Transport.countDocuments({
          deletedAt: null,
          statut: {
            $in: [
              "ASSIGNED",
              "EN_ROUTE_TO_PICKUP",
              "ARRIVED_AT_PICKUP",
              "PATIENT_ON_BOARD",
              "ARRIVED_AT_DESTINATION",
            ],
          },
        }),
        Transport.countDocuments({
          deletedAt: null,
          statut: { $in: ["REQUESTED", "CONFIRMED", "SCHEDULED"] },
        }),
        Transport.countDocuments({ deletedAt: null, statut: "COMPLETED" }),
        Transport.countDocuments({ deletedAt: null, statut: "CANCELLED" }),
        Transport.countDocuments({ deletedAt: null, statut: "NO_SHOW" }),
        Transport.aggregate([
          { $match: { deletedAt: null } },
          { $group: { _id: "$typeTransport", count: { $sum: 1 } } },
        ]),
        Transport.aggregate([
          { $match: { deletedAt: null } },
          { $group: { _id: "$motif", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

    res.json({
      total,
      parStatut: { enCours, planifies, completes, annules, noShows },
      parType: parType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
      parMotif,
    });
  } catch (err) {
    return next(err);
  }
};

const estimerTarif = async (req, res) => {
  try {
    const {
      typeTransport,
      lat1,
      lng1,
      lat2,
      lng2,
      allerRetour,
      heureRDV,
      dateTransport,
      tauxPriseEnCharge,
    } = req.query;

    // Validation des paramètres obligatoires
    const typesValides = ["VSL", "TPMR", "AMBULANCE"];
    if (!typeTransport || !typesValides.includes(typeTransport)) {
      return res.status(400).json({
        message: `Paramètre typeTransport invalide. Valeurs : ${typesValides.join(", ")}`,
      });
    }
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return res.status(400).json({
        message: "Coordonnées GPS manquantes : lat1, lng1, lat2, lng2 sont obligatoires",
      });
    }

    const lat1f = parseFloat(lat1);
    const lng1f = parseFloat(lng1);
    const lat2f = parseFloat(lat2);
    const lng2f = parseFloat(lng2);

    if ([lat1f, lng1f, lat2f, lng2f].some(isNaN)) {
      return res
        .status(400)
        .json({ message: "Les coordonnées GPS doivent être des nombres valides" });
    }

    // Construction d'un objet transport fictif pour le service de tarification
    const transportFictif = {
      typeTransport,
      adresseDepart: { coordonnees: { lat: lat1f, lng: lng1f } },
      adresseDestination: { coordonnees: { lat: lat2f, lng: lng2f } },
      allerRetour: allerRetour === "true",
      heureRDV: heureRDV || null,
      dateTransport: dateTransport ? new Date(dateTransport) : new Date(),
      tauxPriseEnCharge: tauxPriseEnCharge ? parseInt(tauxPriseEnCharge, 10) : 65,
    };

    const estimation = await tarifService.calculerTarif(transportFictif);

    res.json({
      estimation,
      estEstimation: true, // Indique que c'est une valeur approximative
      avertissement:
        estimation.sourceDistance === "haversine"
          ? "Distance calculée à vol d'oiseau (OSRM indisponible) — estimation approximative"
          : null,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = { getStats, estimerTarif };
