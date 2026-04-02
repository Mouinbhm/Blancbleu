const Maintenance = require('../models/Maintenance');
const Unit        = require('../models/Unit');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Lister toutes les maintenances (filtres: statut, uniteId)
// @route   GET /api/maintenances
// ─────────────────────────────────────────────────────────────────────────────
const getMaintenances = async (req, res) => {
  try {
    const { statut, uniteId } = req.query;
    const filter = {};
    if (statut)  filter.statut = statut;
    if (uniteId) filter.unite  = uniteId;

    const maintenances = await Maintenance.find(filter)
      .populate('unite',       'nom immatriculation type statut')
      .populate('responsable', 'nom prenom')
      .sort({ dateDebut: -1 });

    res.json(maintenances);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Détail d'une maintenance
// @route   GET /api/maintenances/:id
// ─────────────────────────────────────────────────────────────────────────────
const getMaintenance = async (req, res) => {
  try {
    const m = await Maintenance.findById(req.params.id)
      .populate('unite',       'nom immatriculation type statut kilometrage')
      .populate('responsable', 'nom prenom email');
    if (!m) return res.status(404).json({ message: 'Maintenance introuvable' });
    res.json(m);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Créer une maintenance + passer l'unité en statut "maintenance"
// @route   POST /api/maintenances
// ─────────────────────────────────────────────────────────────────────────────
const createMaintenance = async (req, res) => {
  try {
    const data = { ...req.body, responsable: req.user._id };
    const m    = await Maintenance.create(data);

    // Mettre l'unité en maintenance si statut en-cours
    if (m.statut === 'en-cours') {
      await Unit.findByIdAndUpdate(m.unite, { statut: 'maintenance' });
    }

    const populated = await Maintenance.findById(m._id)
      .populate('unite', 'nom immatriculation');

    res.status(201).json({ message: 'Maintenance planifiée', maintenance: populated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Modifier une maintenance
// @route   PATCH /api/maintenances/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateMaintenance = async (req, res) => {
  try {
    const m = await Maintenance.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    ).populate('unite', 'nom immatriculation');
    if (!m) return res.status(404).json({ message: 'Maintenance introuvable' });
    res.json({ message: 'Maintenance mise à jour', maintenance: m });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Changer le statut d'une maintenance
//          Si terminé → remettre l'unité disponible
// @route   PATCH /api/maintenances/:id/status
// ─────────────────────────────────────────────────────────────────────────────
const updateStatut = async (req, res) => {
  try {
    const { statut } = req.body;
    const valides = ['planifié', 'en-cours', 'terminé', 'annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: `Statut invalide. Valeurs : ${valides.join(', ')}` });
    }

    const update = { statut };
    if (statut === 'terminé') update.dateFin = new Date();

    const m = await Maintenance.findByIdAndUpdate(
      req.params.id, update, { new: true }
    ).populate('unite', 'nom immatriculation _id');

    if (!m) return res.status(404).json({ message: 'Maintenance introuvable' });

    // Libérer l'unité si maintenance terminée ou annulée
    if ((statut === 'terminé' || statut === 'annulé') && m.unite) {
      await Unit.findByIdAndUpdate(m.unite._id, { statut: 'disponible' });
    }

    // Mettre l'unité en maintenance si démarrage
    if (statut === 'en-cours' && m.unite) {
      await Unit.findByIdAndUpdate(m.unite._id, { statut: 'maintenance' });
    }

    res.json({ message: 'Statut mis à jour', maintenance: m });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer une maintenance
// @route   DELETE /api/maintenances/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteMaintenance = async (req, res) => {
  try {
    const m = await Maintenance.findByIdAndDelete(req.params.id);
    if (!m) return res.status(404).json({ message: 'Maintenance introuvable' });

    // Libérer l'unité si elle était en maintenance
    if (m.unite && m.statut === 'en-cours') {
      await Unit.findByIdAndUpdate(m.unite, { statut: 'disponible' });
    }

    res.json({ message: 'Maintenance supprimée' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Stats maintenance pour le dashboard
// @route   GET /api/maintenances/stats
// ─────────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [total, planifie, enCours, termine, annule, coutTotal, parType] = await Promise.all([
      Maintenance.countDocuments(),
      Maintenance.countDocuments({ statut: 'planifié'  }),
      Maintenance.countDocuments({ statut: 'en-cours'  }),
      Maintenance.countDocuments({ statut: 'terminé'   }),
      Maintenance.countDocuments({ statut: 'annulé'    }),
      Maintenance.aggregate([
        { $match: { statut: 'terminé' } },
        { $group: { _id: null, total: { $sum: '$cout' } } },
      ]),
      Maintenance.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      total,
      parStatut: { planifie, enCours, termine, annule },
      coutTotalTermine: coutTotal[0]?.total || 0,
      parType,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getMaintenances, getMaintenance, createMaintenance,
  updateMaintenance, updateStatut, deleteMaintenance, getStats,
};