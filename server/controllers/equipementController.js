const Equipement = require("../models/Equipement");

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister tous les équipements (filtres: etat, uniteAssignee, categorie)
// @route   GET /api/equipements
// ─────────────────────────────────────────────────────────────────────────────
const getEquipements = async (req, res) => {
  try {
    const { etat, uniteId, categorie } = req.query;
    const filter = {};
    if (etat) filter.etat = etat;
    if (uniteId) filter.uniteAssignee = uniteId;
    if (categorie) filter.categorie = categorie;

    const equipements = await Equipement.find(filter)
      .populate("uniteAssignee", "nom immatriculation statut")
      .sort({ nom: 1 });

    res.json(equipements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Détail d'un équipement
// @route   GET /api/equipements/:id
// ─────────────────────────────────────────────────────────────────────────────
const getEquipement = async (req, res) => {
  try {
    const eq = await Equipement.findById(req.params.id).populate(
      "uniteAssignee",
      "nom immatriculation statut",
    );
    if (!eq) return res.status(404).json({ message: "Équipement introuvable" });
    res.json(eq);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Créer un équipement
// @route   POST /api/equipements
// ─────────────────────────────────────────────────────────────────────────────
const createEquipement = async (req, res) => {
  try {
    const eq = await Equipement.create(req.body);
    res.status(201).json({ message: "Équipement créé", equipement: eq });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier un équipement
// @route   PATCH /api/equipements/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateEquipement = async (req, res) => {
  try {
    const eq = await Equipement.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("uniteAssignee", "nom immatriculation");
    if (!eq) return res.status(404).json({ message: "Équipement introuvable" });
    res.json({ message: "Équipement mis à jour", equipement: eq });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Changer l'état d'un équipement
// @route   PATCH /api/equipements/:id/etat
// ─────────────────────────────────────────────────────────────────────────────
const updateEtat = async (req, res) => {
  try {
    const { etat } = req.body;
    const valides = ["opérationnel", "à-vérifier", "en-panne", "réformé"];
    if (!valides.includes(etat)) {
      return res
        .status(400)
        .json({ message: `État invalide. Valeurs : ${valides.join(", ")}` });
    }

    const eq = await Equipement.findByIdAndUpdate(
      req.params.id,
      { etat },
      { new: true },
    );
    if (!eq) return res.status(404).json({ message: "Équipement introuvable" });
    res.json({ message: "État mis à jour", equipement: eq });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Enregistrer un contrôle (met à jour dernierControle + prochainControle)
// @route   PATCH /api/equipements/:id/controle
// ─────────────────────────────────────────────────────────────────────────────
const enregistrerControle = async (req, res) => {
  try {
    const { prochainControle, notes } = req.body;

    const update = {
      dernierControle: new Date(),
      etat: "opérationnel",
    };
    if (prochainControle) update.prochainControle = new Date(prochainControle);
    if (notes) update.notes = notes;

    const eq = await Equipement.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!eq) return res.status(404).json({ message: "Équipement introuvable" });
    res.json({ message: "Contrôle enregistré", equipement: eq });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer un équipement
// @route   DELETE /api/equipements/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteEquipement = async (req, res) => {
  try {
    const eq = await Equipement.findByIdAndDelete(req.params.id);
    if (!eq) return res.status(404).json({ message: "Équipement introuvable" });
    res.json({ message: "Équipement supprimé" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Alertes — équipements expirés ou à vérifier bientôt (30 jours)
// @route   GET /api/equipements/alertes
// ─────────────────────────────────────────────────────────────────────────────
const getAlertes = async (req, res) => {
  try {
    const dans30Jours = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const maintenant = new Date();

    const [enPanne, aVerifier, expiresProchainement, expires] =
      await Promise.all([
        Equipement.find({ etat: "en-panne" }).populate("uniteAssignee", "nom"),
        Equipement.find({ etat: "à-vérifier" }).populate(
          "uniteAssignee",
          "nom",
        ),
        Equipement.find({
          dateExpiration: { $lte: dans30Jours, $gt: maintenant },
        }).populate("uniteAssignee", "nom"),
        Equipement.find({ dateExpiration: { $lte: maintenant } }).populate(
          "uniteAssignee",
          "nom",
        ),
      ]);

    res.json({
      total:
        enPanne.length +
        aVerifier.length +
        expiresProchainement.length +
        expires.length,
      enPanne,
      aVerifier,
      expiresProchainement,
      expires,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Stats des équipements
// @route   GET /api/equipements/stats
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [total, operationnels, aVerifier, enPanne, reformes, parCategorie] =
      await Promise.all([
        Equipement.countDocuments(),
        Equipement.countDocuments({ etat: "opérationnel" }),
        Equipement.countDocuments({ etat: "à-vérifier" }),
        Equipement.countDocuments({ etat: "en-panne" }),
        Equipement.countDocuments({ etat: "réformé" }),
        Equipement.aggregate([
          { $group: { _id: "$categorie", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    res.json({
      total,
      parEtat: { operationnels, aVerifier, enPanne, reformes },
      parCategorie,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getEquipements,
  getEquipement,
  createEquipement,
  updateEquipement,
  updateEtat,
  enregistrerControle,
  deleteEquipement,
  getAlertes,
  getStats,
};
