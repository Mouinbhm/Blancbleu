/**
 * BlancBleu — Contrôleur Factures v2.0
 * Compatible avec le nouveau modèle Facture (transportId, missionId, patientId, montantTotal…)
 */
const Facture = require("../models/Facture");

const STATUTS_VALIDES = ["brouillon", "emise", "en_attente", "payee", "annulee"];

const getFactures = async (req, res) => {
  try {
    const { statut, patientId, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (statut) filter.statut = statut;
    if (patientId) filter.patientId = patientId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [factures, total] = await Promise.all([
      Facture.find(filter)
        .populate("transportId", "numero motif dateTransport typeTransport")
        .populate("missionId", "statut dureeReelleMinutes distanceReelleKm")
        .populate("patientId", "nom prenom numeroPatient")
        .sort({ dateEmission: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Facture.countDocuments(filter),
    ]);
    res.json({ factures, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getFacture = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id)
      .populate("transportId", "numero motif dateTransport adresseDestination patient typeTransport allerRetour")
      .populate("missionId", "statut dureeReelleMinutes distanceReelleKm vehicleId chauffeurId")
      .populate("patientId", "nom prenom telephone numeroSecu caisse");
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json(f);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createFacture = async (req, res) => {
  try {
    // Vérifier qu'il n'y a pas déjà une facture non-annulée pour ce transport
    if (req.body.transportId) {
      const existante = await Facture.findOne({
        transportId: req.body.transportId,
        statut: { $ne: "annulee" },
      });
      if (existante) {
        return res.status(400).json({
          message: `Une facture (${existante.numero}) existe déjà pour ce transport`,
        });
      }
    }
    const f = await Facture.create(req.body);
    res.status(201).json({ message: "Facture créée", facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const updateFacture = async (req, res) => {
  try {
    const { numero, ...updates } = req.body; // numero immuable
    const f = await Facture.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ message: "Facture mise à jour", facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const updateStatut = async (req, res) => {
  try {
    const { statut } = req.body;
    if (!STATUTS_VALIDES.includes(statut))
      return res.status(400).json({ message: `Statut invalide. Valides : ${STATUTS_VALIDES.join(", ")}` });
    const updates = { statut };
    if (statut === "payee") updates.datePaiement = new Date();
    const f = await Facture.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ message: "Statut mis à jour", facture: f });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteFacture = async (req, res) => {
  try {
    // Soft delete : passer à "annulee" plutôt que supprimer physiquement
    const f = await Facture.findByIdAndUpdate(req.params.id, { statut: "annulee" }, { new: true });
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ message: "Facture annulée" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getStats = async (req, res) => {
  try {
    const [total, payees, enAttente, brouillons, annulees, chiffre] = await Promise.all([
      Facture.countDocuments(),
      Facture.countDocuments({ statut: "payee" }),
      Facture.countDocuments({ statut: { $in: ["en_attente", "emise"] } }),
      Facture.countDocuments({ statut: "brouillon" }),
      Facture.countDocuments({ statut: "annulee" }),
      Facture.aggregate([
        { $match: { statut: "payee" } },
        { $group: { _id: null, total: { $sum: "$montantTotal" } } },
      ]),
    ]);
    res.json({
      total,
      parStatut: { payees, enAttente, brouillons, annulees },
      chiffreAffaires: chiffre[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getFactures, getFacture, createFacture, updateFacture, updateStatut, deleteFacture, getStats };
