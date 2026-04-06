const Facture = require("../models/Facture");

const getFactures = async (req, res) => {
  try {
    const { statut, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (statut) filter.statut = statut;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [factures, total] = await Promise.all([
      Facture.find(filter)
        .populate("intervention", "numero typeIncident")
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Facture.countDocuments(filter),
    ]);
    res.json({
      factures,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getFacture = async (req, res) => {
  try {
    const f = await Facture.findById(req.params.id).populate(
      "intervention",
      "numero typeIncident adresse",
    );
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json(f);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createFacture = async (req, res) => {
  try {
    const f = await Facture.create(req.body);
    res.status(201).json({ message: "Facture créée", facture: f });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const updateFacture = async (req, res) => {
  try {
    const f = await Facture.findByIdAndUpdate(req.params.id, req.body, {
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
    const valides = ["payée", "en-attente", "annulée"];
    if (!valides.includes(statut))
      return res.status(400).json({ message: "Statut invalide" });
    const f = await Facture.findByIdAndUpdate(
      req.params.id,
      { statut },
      { new: true },
    );
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ message: "Statut mis à jour", facture: f });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteFacture = async (req, res) => {
  try {
    const f = await Facture.findByIdAndDelete(req.params.id);
    if (!f) return res.status(404).json({ message: "Facture introuvable" });
    res.json({ message: "Facture supprimée" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getStats = async (req, res) => {
  try {
    const [total, payees, enAttente, annulees, chiffre] = await Promise.all([
      Facture.countDocuments(),
      Facture.countDocuments({ statut: "payée" }),
      Facture.countDocuments({ statut: "en-attente" }),
      Facture.countDocuments({ statut: "annulée" }),
      Facture.aggregate([
        { $match: { statut: "payée" } },
        { $group: { _id: null, total: { $sum: "$montant" } } },
      ]),
    ]);
    res.json({
      total,
      parStatut: { payees, enAttente, annulees },
      chiffreAffaires: chiffre[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getFactures,
  getFacture,
  createFacture,
  updateFacture,
  updateStatut,
  deleteFacture,
  getStats,
};
