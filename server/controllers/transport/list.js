/**
 * BlancBleu — GET /api/transports — liste avec filtres + pagination.
 */

const Transport = require("../../models/Transport");

const getTransports = async (req, res, next) => {
  try {
    const {
      statut,
      typeTransport,
      motif,
      date,
      dateDebut,
      dateFin,
      origine,
      search,
      limit = 50,
      page = 1,
    } = req.query;
    const filter = { deletedAt: null };

    if (statut) {
      const statuts = String(statut)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      filter.statut = statuts.length === 1 ? statuts[0] : { $in: statuts };
    }
    if (typeTransport) filter.typeTransport = typeTransport;
    if (motif) filter.motif = motif;
    if (origine) filter.origine = origine;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { "patient.nom": re },
        { "patient.prenom": re },
        { "patient.telephone": re },
        { numero: re },
      ];
    }
    if (date) {
      const d = new Date(date);
      const fin = new Date(date);
      fin.setDate(fin.getDate() + 1);
      filter.dateTransport = { $gte: d, $lt: fin };
    } else if (dateDebut || dateFin) {
      filter.dateTransport = {};
      if (dateDebut) filter.dateTransport.$gte = new Date(dateDebut);
      if (dateFin) filter.dateTransport.$lte = new Date(dateFin + "T23:59:59");
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transports, total] = await Promise.all([
      Transport.find(filter)
        .populate("vehicule", "nom type statut immatriculation")
        .populate("chauffeur", "nom prenom")
        .populate("createdBy", "nom prenom")
        .populate("patientId", "nom prenom telephone mobilite numeroPatient")
        .populate("prescriptionId", "numero statut motif dateExpiration")
        .sort({ dateTransport: 1, heureRDV: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transport.countDocuments(filter),
    ]);

    res.json({
      transports,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getTransports };
