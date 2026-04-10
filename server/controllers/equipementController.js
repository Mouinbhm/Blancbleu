/**
 * BlancBleu — Controller Equipements v2.0
 */
const Equipement = require("../models/Equipement");
const service = require("../services/equipementService");

// Helper erreur métier
const erreur = (res, err) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error("Equipement error:", err);
  return res.status(500).json({ message: err.message || "Erreur serveur" });
};

// ─── GET /api/equipements ─────────────────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const {
      etat,
      categorie,
      uniteId,
      estActif = "true",
      page = 1,
      limit = 50,
      search,
    } = req.query;

    const filtre = {};
    if (estActif !== "all") filtre.estActif = estActif === "true";
    if (etat) filtre.etat = etat;
    if (categorie) filtre.categorie = categorie;
    if (uniteId) filtre.uniteAssignee = uniteId;
    if (search) filtre.nom = { $regex: search, $options: "i" };

    const [equips, total] = await Promise.all([
      Equipement.find(filtre)
        .populate("uniteAssignee", "nom type statut")
        .sort({ etat: 1, nom: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      Equipement.countDocuments(filtre),
    ]);

    res.json({
      equipements: equips,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    erreur(res, err);
  }
};

// ─── GET /api/equipements/stats ───────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const stats = await service.getStats();
    res.json(stats);
  } catch (err) {
    erreur(res, err);
  }
};

// ─── GET /api/equipements/alerts/expiring ─────────────────────────────────────
const getExpiring = async (req, res) => {
  try {
    const { expires, expirentBientot } = await service.detecterAlertes();
    res.json({
      expires,
      expirentBientot,
      total: expires.length + expirentBientot.length,
    });
  } catch (err) {
    erreur(res, err);
  }
};

// ─── GET /api/equipements/alerts/check-required ───────────────────────────────
const getCheckRequired = async (req, res) => {
  try {
    const { controleRetard, controleBientot, enPanne } =
      await service.detecterAlertes();
    res.json({
      controleRetard,
      controleBientot,
      enPanne,
      total: controleRetard.length + controleBientot.length,
    });
  } catch (err) {
    erreur(res, err);
  }
};

// ─── GET /api/equipements/:id ─────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const equip = await Equipement.findById(req.params.id).populate(
      "uniteAssignee",
      "nom type statut position",
    );
    if (!equip)
      return res.status(404).json({ message: "Équipement introuvable" });
    res.json(equip);
  } catch (err) {
    erreur(res, err);
  }
};

// ─── POST /api/equipements ────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    // Validation minimale
    const { nom, categorie } = req.body;
    if (!nom?.trim())
      return res.status(400).json({ message: "Nom obligatoire" });
    if (!categorie)
      return res.status(400).json({ message: "Catégorie obligatoire" });

    const equip = await service.creerEquipement(req.body);
    res.status(201).json(equip);
  } catch (err) {
    erreur(res, err);
  }
};

// ─── PUT /api/equipements/:id ─────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const equip = await service.mettreAJour(req.params.id, req.body);
    res.json(equip);
  } catch (err) {
    erreur(res, err);
  }
};

// ─── DELETE /api/equipements/:id ──────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const equip = await Equipement.findById(req.params.id);
    if (!equip) return res.status(404).json({ message: "Introuvable" });
    // Soft delete
    equip.estActif = false;
    equip.etat = "retiré";
    await equip.save();
    res.json({ message: "Équipement désactivé" });
  } catch (err) {
    erreur(res, err);
  }
};

// ─── PATCH /api/equipements/:id/assign ───────────────────────────────────────
const assign = async (req, res) => {
  try {
    const { uniteId } = req.body;
    if (!uniteId) return res.status(400).json({ message: "uniteId requis" });
    const equip = await service.affecter(req.params.id, uniteId);
    res.json({ message: "Équipement affecté", equipement: equip });
  } catch (err) {
    erreur(res, err);
  }
};

// ─── PATCH /api/equipements/:id/unassign ─────────────────────────────────────
const unassign = async (req, res) => {
  try {
    const equip = await service.desaffecter(req.params.id);
    res.json({ message: "Équipement désaffecté", equipement: equip });
  } catch (err) {
    erreur(res, err);
  }
};

// ─── PATCH /api/equipements/:id/status ───────────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { etat, notes } = req.body;
    if (!etat) return res.status(400).json({ message: "etat requis" });
    const equip = await service.changerEtat(req.params.id, etat, notes);
    res.json({ message: `État mis à jour : ${etat}`, equipement: equip });
  } catch (err) {
    erreur(res, err);
  }
};

module.exports = {
  getAll,
  getStats,
  getExpiring,
  getCheckRequired,
  getOne,
  create,
  update,
  remove,
  assign,
  unassign,
  updateStatus,
};
